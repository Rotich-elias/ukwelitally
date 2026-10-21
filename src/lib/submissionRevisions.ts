import { queryOne } from '@/lib/db'
import type { PoolClient } from '@/lib/db'

/**
 * Versioned corrections.
 *
 * A correction never overwrites the submission it corrects. The corrected
 * version is stored as the next revision of the same submission, the original
 * keeps its figures, its evidence and its audit trail, and the selected
 * result only follows the new version once the new version is approved.
 *
 * The chain is a linked list:
 *
 *   revision 1  <-- supersedes --  revision 2  <-- supersedes --  revision 3
 *        |                                  |
 *        +-- superseded_by ------------------+
 *
 * `superseded_by_submission_id` is only set once the correction has been
 * approved, so an unapproved correction never removes the current version.
 */

export interface SubmissionVersion {
  id: number
  status: string
  revision_number: number
  supersedes_submission_id: number | null
  superseded_by_submission_id: number | null
  submission_origin: string
}

/**
 * The current version of a submission key.
 *
 * The current version is the highest revision that was stored. A submission
 * that is still pending or verified blocks a new submission; a flagged or
 * rejected one may be corrected.
 */
export async function getCurrentVersion(params: {
  userId: number
  pollingStationId: number
  candidateId: number
  submissionType: string
}): Promise<SubmissionVersion | null> {
  return queryOne<SubmissionVersion>(
    `SELECT id, status, revision_number, supersedes_submission_id,
            superseded_by_submission_id, submission_origin
       FROM submissions
      WHERE user_id = $1
        AND polling_station_id = $2
        AND candidate_id = $3
        AND submission_type = $4
      ORDER BY revision_number DESC
      LIMIT 1`,
    [params.userId, params.pollingStationId, params.candidateId, params.submissionType]
  )
}

/**
 * The versions a submission replaces, oldest first.
 *
 * The chain is walked upwards, so the result contains every version that
 * the given submission supersedes. The client is passed in when the caller
 * runs inside a transaction, so the chain is read on the same connection.
 */
export async function getSupersededChain(
  submissionId: number,
  client?: PoolClient
): Promise<SubmissionVersion[]> {
  const run = async (text: string, params: any[]): Promise<SubmissionVersion | null> => {
    if (client) {
      const result = await client.query<SubmissionVersion>(text, params)
      return result.rows[0] || null
    }
    return queryOne<SubmissionVersion>(text, params)
  }

  const chain: SubmissionVersion[] = []
  let currentId: number | null = submissionId
  const seen = new Set<number>()

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId)
    const row = await run(
      `SELECT id, status, revision_number, supersedes_submission_id,
              superseded_by_submission_id, submission_origin
         FROM submissions
        WHERE id = $1`,
      [currentId]
    )
    if (!row) break
    chain.push(row)
    currentId = row.supersedes_submission_id
  }

  return chain
}

/**
 * Mark the versions that a correction replaces as superseded.
 *
 * The rows are only marked once the correction has been approved, so a
 * correction that never gets approved leaves the current version in place.
 */
export async function markSuperseded(
  client: PoolClient,
  params: {
    /** The approved correction. */
    revisionSubmissionId: number
    /** The submission the correction was created from. */
    supersedesSubmissionId: number | null
  }
): Promise<number[]> {
  if (!params.supersedesSubmissionId) return []

  const chain = await getSupersededChain(params.supersedesSubmissionId, client)
  const supersededIds = chain.map((version) => version.id)

  if (supersededIds.length === 0) return []

  await client.query(
    `UPDATE submissions
        SET superseded_by_submission_id = $1,
            updated_at = NOW()
      WHERE id = ANY($2::int[])
        AND superseded_by_submission_id IS NULL`,
    [params.revisionSubmissionId, supersededIds]
  )

  return supersededIds
}

/**
 * Move the selected result to the corrected version.
 *
 * The selected result follows the correction only when it still points at one
 * of the versions the correction replaces, and only when the source of the
 * selection matches the origin of the correction. An observer correction is
 * never promoted automatically: it still needs the candidate's approval.
 */
export async function moveSelectedResult(
  client: PoolClient,
  params: {
    /** The versions the correction replaces. */
    supersededIds: number[]
    /** The approved correction. */
    revisionSubmissionId: number
    /** The source the selection must have for the move to happen. */
    source: 'agent_primary' | 'observer_fallback'
  }
): Promise<boolean> {
  if (params.supersededIds.length === 0) return false

  const updated = await client.query(
    `UPDATE selected_results
        SET submission_id = $1,
            source = $2,
            approved_at = NOW()
      WHERE submission_id = ANY($3::int[])
        AND source = $2`,
    [params.revisionSubmissionId, params.source, params.supersededIds]
  )

  return (updated.rowCount ?? 0) > 0
}

/**
 * The source that matches the origin of a submission.
 */
export function selectedResultSourceFor(
  submissionOrigin: string
): 'agent_primary' | 'observer_fallback' | null {
  if (submissionOrigin === 'agent') return 'agent_primary'
  if (submissionOrigin === 'observer') return 'observer_fallback'
  return null
}

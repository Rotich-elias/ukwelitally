import { query, queryMany } from '@/lib/db'
import { calculateVariance } from '@/lib/validation'

/**
 * Verification services.
 *
 * These implement the verification mechanisms described in the product
 * documentation:
 *
 *  - agent_vs_backup: compare a primary agent submission against a backup
 *    (observer) submission for the same polling station and flag a
 *    discrepancy when the variance exceeds the threshold.
 *  - vs_iebc: compare submitted results against official IEBC results once
 *    they have been imported.
 *
 * Both write into the `discrepancies` table and set `has_discrepancy` on the
 * affected submissions so the review queue and candidate activity feed pick
 * them up.
 */

/** Flag a discrepancy when the vote variance exceeds this percentage. */
export const VARIANCE_THRESHOLD_PERCENT = 5

interface CandidateVoteMap {
  [candidateName: string]: number
}

/**
 * Load candidate votes for a set of submissions, keyed by candidate name.
 */
async function loadCandidateVotes(
  submissionIds: number[]
): Promise<Map<number, CandidateVoteMap>> {
  const votesBySubmission = new Map<number, CandidateVoteMap>()

  if (submissionIds.length === 0) return votesBySubmission

  const rows = await queryMany<{
    submission_id: number
    candidate_name: string
    votes: number
  }>(
    `SELECT r.submission_id, cv.candidate_name, cv.votes
     FROM candidate_votes cv
     JOIN results r ON cv.result_id = r.id
     WHERE r.submission_id = ANY($1::int[])`,
    [submissionIds]
  )

  for (const row of rows) {
    let votes = votesBySubmission.get(row.submission_id)
    if (!votes) {
      votes = {}
      votesBySubmission.set(row.submission_id, votes)
    }
    votes[row.candidate_name] = (votes[row.candidate_name] || 0) + Number(row.votes)
  }

  return votesBySubmission
}

/**
 * Compare a backup submission against the primary submission for the same
 * polling station and position, recording a discrepancy when they disagree
 * beyond the allowed variance.
 *
 * Returns the created discrepancy, or null when the two agree or no primary
 * submission exists to compare against.
 */
export async function compareWithPrimarySubmission(
  backupSubmissionId: number,
  pollingStationId: number,
  position: string
): Promise<{ id: number; variance_percentage: number } | null> {
  const primaryResult = await query<{ id: number; submission_id: number }>(
    `SELECT r.id, r.submission_id
     FROM results r
     JOIN submissions s ON s.id = r.submission_id
     WHERE s.polling_station_id = $1
       AND r.position = $2
       AND s.status = 'verified'
       AND s.submission_type = 'primary'
       AND s.id <> $3
     ORDER BY s.submitted_at DESC
     LIMIT 1`,
    [pollingStationId, position, backupSubmissionId]
  )

  if (primaryResult.rows.length === 0) return null

  const primarySubmissionId = primaryResult.rows[0].submission_id

  const votesBySubmission = await loadCandidateVotes([
    primarySubmissionId,
    backupSubmissionId,
  ])

  const primaryVotes = votesBySubmission.get(primarySubmissionId)
  const backupVotes = votesBySubmission.get(backupSubmissionId)

  if (!primaryVotes || !backupVotes) return null

  const variance = calculateVariance(
    {
      candidate_votes: Object.entries(primaryVotes).map(([candidate_name, votes]) => ({
        candidate_name,
        votes,
      })),
    },
    {
      candidate_votes: Object.entries(backupVotes).map(([candidate_name, votes]) => ({
        candidate_name,
        votes,
      })),
    }
  )

  if (variance.percentage <= VARIANCE_THRESHOLD_PERCENT) return null

  const inserted = await query<{ id: number }>(
    `INSERT INTO discrepancies (
       polling_station_id, position,
       primary_submission_id, backup_submission_id,
       discrepancy_type, variance_percentage, details, status
     ) VALUES ($1, $2, $3, $4, 'agent_vs_backup', $5, $6, 'open')
     RETURNING id`,
    [
      pollingStationId,
      position,
      primarySubmissionId,
      backupSubmissionId,
      variance.percentage,
      JSON.stringify({ differences: variance.details }),
    ]
  )

  // Mark both submissions so they surface in the review queue.
  await query(
    `UPDATE submissions
     SET has_discrepancy = TRUE,
         flagged_reason = COALESCE(flagged_reason, $1)
     WHERE id = ANY($2::int[])`,
    [
      `Vote variance of ${variance.percentage.toFixed(2)}% exceeds the ${VARIANCE_THRESHOLD_PERCENT}% threshold`,
      [primarySubmissionId, backupSubmissionId],
    ]
  )

  return {
    id: inserted.rows[0].id,
    variance_percentage: variance.percentage,
  }
}

/**
 * Compare submitted results against official IEBC results for the same
 * polling station and position.
 *
 * IEBC data is optional. When no official results have been imported for the
 * station this is a no-op.
 */
export async function compareWithIebcResults(
  submissionId: number,
  pollingStationId: number,
  position: string
): Promise<{ id: number; variance_percentage: number } | null> {
  const officialRows = await queryMany<{ candidate_name: string; votes: number }>(
    `SELECT candidate_name, votes
     FROM iebc_results
     WHERE polling_station_id = $1 AND position = $2`,
    [pollingStationId, position]
  )

  if (officialRows.length === 0) return null

  const submittedVotes = await loadCandidateVotes([submissionId])
  const submitted = submittedVotes.get(submissionId)
  if (!submitted) return null

  const official: CandidateVoteMap = {}
  for (const row of officialRows) {
    official[row.candidate_name] = Number(row.votes)
  }

  const variance = calculateVariance(
    {
      candidate_votes: Object.entries(official).map(([candidate_name, votes]) => ({
        candidate_name,
        votes,
      })),
    },
    {
      candidate_votes: Object.entries(submitted).map(([candidate_name, votes]) => ({
        candidate_name,
        votes,
      })),
    }
  )

  if (variance.percentage <= VARIANCE_THRESHOLD_PERCENT) return null

  const inserted = await query<{ id: number }>(
    `INSERT INTO discrepancies (
       polling_station_id, position,
       primary_submission_id,
       discrepancy_type, variance_percentage, details, status
     ) VALUES ($1, $2, $3, 'vs_iebc', $4, $5, 'open')
     RETURNING id`,
    [
      pollingStationId,
      position,
      submissionId,
      variance.percentage,
      JSON.stringify({ differences: variance.details }),
    ]
  )

  await query(
    `UPDATE submissions
     SET has_discrepancy = TRUE,
         flagged_reason = COALESCE(flagged_reason, $1)
     WHERE id = $2`,
    [
      `Vote variance of ${variance.percentage.toFixed(2)}% against official IEBC results exceeds the ${VARIANCE_THRESHOLD_PERCENT}% threshold`,
      submissionId,
    ]
  )

  return {
    id: inserted.rows[0].id,
    variance_percentage: variance.percentage,
  }
}

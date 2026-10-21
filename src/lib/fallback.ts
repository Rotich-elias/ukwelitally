import { query, queryOne, queryMany, transaction, type PoolClient } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { createNotification } from '@/lib/notifications'
import { markSuperseded } from '@/lib/submissionRevisions'

/**
 * Observer alternative submissions and candidate approved fallbacks.
 *
 * The rules this module enforces:
 *
 *   - An observer submission is stored separately and never replaces an
 *     agent result on its own.
 *   - Only the candidate who owns the scope may approve an observer
 *     submission as the fallback for a station.
 *   - A fallback can only be approved while NO agent primary submission
 *     exists for that station and position. A zero vote agent result is a
 *     result, not an absent result.
 *   - Nothing is ever overwritten: rejected submissions and superseded
 *     selections stay in the database for comparison and audit.
 */

export type SubmissionOrigin = 'agent' | 'observer' | 'admin'
export type ReviewStatus = 'pending_review' | 'approved_fallback' | 'rejected_fallback'
export type SelectedResultSource = 'agent_primary' | 'observer_fallback'

export interface ObserverSubmissionRow {
  id: number
  polling_station_id: number
  user_id: number
  candidate_id: number
  submission_type: string
  submission_origin: SubmissionOrigin
  review_status: ReviewStatus | null
  review_reason: string | null
  reviewed_by: number | null
  reviewed_at: Date | null
  status: string
  submitted_at: Date
}

export interface SelectedResultRow {
  id: number
  polling_station_id: number
  position: string
  submission_id: number
  source: SelectedResultSource
  approved_by: number | null
  approved_at: Date | null
}

/**
 * Reasons a fallback cannot be approved.
 */
export type FallbackRejectionCode =
  | 'not_observer_submission'
  | 'already_reviewed'
  | 'submission_invalid'
  | 'not_in_scope'
  | 'observer_not_authorized'
  | 'agent_submission_exists'
  | 'another_fallback_selected'
  | 'candidate_not_owner'

export interface FallbackEligibility {
  eligible: boolean
  code: FallbackRejectionCode | null
  reasons: string[]
}

export interface FallbackEligibilityInput {
  /** The observer submission being considered. */
  submission: {
    id: number
    submission_origin: SubmissionOrigin
    review_status: ReviewStatus | null
    status: string
    polling_station_id: number
    user_id: number
  }
  /** Does the acting candidate own the scope of the submission? */
  candidateOwnsScope: boolean
  /** Is the observer still assigned to the polling station? */
  observerAuthorized: boolean
  /** The agent primary submission for the same station and position, if any. */
  agentSubmission: { id: number; status: string } | null
  /** The result currently selected for the station and position, if any. */
  selectedResult: { id: number; source: SelectedResultSource; submission_id: number } | null
}

/**
 * Agent submission states that count as "an agent result exists".
 *
 * A flagged submission is still an agent result that is being corrected, so
 * it is present rather than absent. Only a rejected submission has been
 * invalidated and no longer blocks a fallback.
 */
export const PRESENT_AGENT_SUBMISSION_STATUSES = ['pending', 'verified', 'flagged']

/**
 * Decide whether an observer submission may be approved as the fallback.
 *
 * The rules are pure so they can be exercised without a database.
 */
export function evaluateFallbackEligibility(
  input: FallbackEligibilityInput
): FallbackEligibility {
  const reasons: string[] = []
  let code: FallbackRejectionCode | null = null

  const reject = (rejectionCode: FallbackRejectionCode, reason: string): FallbackEligibility => {
    reasons.push(reason)
    return { eligible: false, code: rejectionCode, reasons }
  }

  if (input.submission.submission_origin !== 'observer') {
    return reject(
      'not_observer_submission',
      'Only an observer submission can be approved as a fallback.'
    )
  }

  if (input.submission.review_status === 'rejected_fallback') {
    return reject(
      'already_reviewed',
      'This submission was already rejected. It cannot be approved without a new review.'
    )
  }

  if (input.submission.review_status === 'approved_fallback') {
    return reject(
      'already_reviewed',
      'This submission has already been approved as the fallback result.'
    )
  }

  if (input.submission.status === 'rejected') {
    return reject('submission_invalid', 'This submission was rejected and is no longer valid.')
  }

  if (!input.candidateOwnsScope) {
    return reject(
      'not_in_scope',
      'This submission is outside the electoral area you are responsible for.'
    )
  }

  if (!input.observerAuthorized) {
    return reject(
      'observer_not_authorized',
      'The observer is no longer assigned to this polling station.'
    )
  }

  if (
    input.agentSubmission &&
    PRESENT_AGENT_SUBMISSION_STATUSES.includes(input.agentSubmission.status)
  ) {
    return reject(
      'agent_submission_exists',
      'An agent result already exists for this polling station, so a fallback cannot be used.'
    )
  }

  if (
    input.selectedResult &&
    input.selectedResult.source === 'observer_fallback' &&
    input.selectedResult.submission_id !== input.submission.id
  ) {
    return reject(
      'another_fallback_selected',
      'Another observer fallback has already been approved for this polling station.'
    )
  }

  return { eligible: true, code: null, reasons }
}

/* -------------------------------------------------------------------------- */
/*                            Database accessors                               */
/* -------------------------------------------------------------------------- */

/**
 * The agent primary submission for a station and position, if there is one.
 *
 * The check looks at the submission itself, not at the result figures: an
 * agent that reported a station but has not entered the numbers yet still
 * means the station is not "absent". The position comes from the candidate
 * the agent belongs to.
 */
export async function getAgentPrimarySubmission(
  pollingStationId: number,
  position: string
): Promise<{ id: number; status: string; user_id: number } | null> {
  return queryOne<{ id: number; status: string; user_id: number }>(
    `SELECT s.id, s.status, s.user_id
       FROM submissions s
       JOIN candidates c ON c.id = s.candidate_id
      WHERE s.polling_station_id = $1
        AND c.position = $2
        AND s.submission_type = 'primary'
        AND s.submission_origin = 'agent'
      ORDER BY s.id
      LIMIT 1`,
    [pollingStationId, position]
  )
}

/**
 * The result currently selected for a station and position.
 */
export async function getSelectedResult(
  pollingStationId: number,
  position: string
): Promise<SelectedResultRow | null> {
  return queryOne<SelectedResultRow>(
    'SELECT * FROM selected_results WHERE polling_station_id = $1 AND position = $2',
    [pollingStationId, position]
  )
}

/**
 * Observer submissions that are waiting for a review decision.
 */
export async function getObserverSubmissionsForReview(params: {
  candidateId: number
  position: string
  countyId?: number | null
  constituencyId?: number | null
  wardId?: number | null
  reviewStatus?: ReviewStatus | 'all'
}): Promise<any[]> {
  const conditions: string[] = [
    "s.submission_origin = 'observer'",
    'r.position = $1',
  ]
  const bindings: any[] = [params.position]

  if (params.reviewStatus && params.reviewStatus !== 'all') {
    conditions.push(`s.review_status = $${bindings.length + 1}`)
    bindings.push(params.reviewStatus)
  } else if (!params.reviewStatus) {
    conditions.push("s.review_status = 'pending_review'")
  }

  // Scope the queue to the candidate's electoral area.
  if (params.position === 'mca' && params.wardId) {
    conditions.push(`ps.ward_id = $${bindings.length + 1}`)
    bindings.push(params.wardId)
  } else if (params.position === 'mp' && params.constituencyId) {
    conditions.push(`ps.constituency_id = $${bindings.length + 1}`)
    bindings.push(params.constituencyId)
  } else if (
    ['governor', 'senator', 'women_rep'].includes(params.position) &&
    params.countyId
  ) {
    conditions.push(`ps.county_id = $${bindings.length + 1}`)
    bindings.push(params.countyId)
  }

  return queryMany(
    `SELECT
       s.id,
       s.polling_station_id,
       s.user_id,
       s.candidate_id,
       s.submission_type,
       s.submission_origin,
       s.review_status,
       s.review_reason,
       s.reviewed_by,
       s.reviewed_at,
       s.status,
       s.submitted_at,
       s.confidence_score,
       s.has_discrepancy,
       s.flagged_reason,
       u.full_name as observer_name,
       u.email as observer_email,
       u.phone as observer_phone,
       ps.name as polling_station_name,
       ps.code as polling_station_code,
       w.name as ward_name,
       con.name as constituency_name,
       co.name as county_name,
       r.id as result_id,
       r.registered_voters,
       r.total_votes_cast,
       r.valid_votes,
       r.rejected_votes,
       r.is_valid,
       r.validation_errors,
       (SELECT COUNT(*) FROM submission_photos sp WHERE sp.submission_id = s.id) AS photo_count,
       (SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', sp.id,
                      'photo_type', sp.photo_type
                    )
                  ),
                  '[]'
                )
          FROM submission_photos sp
         WHERE sp.submission_id = s.id) AS photos,
       agent_sub.id as agent_submission_id,
       agent_sub.status as agent_submission_status,
       agent_user.full_name as agent_name,
       sel.source as selected_source,
       sel.submission_id as selected_submission_id
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     JOIN polling_stations ps ON ps.id = s.polling_station_id
     LEFT JOIN wards w ON w.id = ps.ward_id
     LEFT JOIN constituencies con ON con.id = ps.constituency_id
     LEFT JOIN counties co ON co.id = ps.county_id
     LEFT JOIN results r ON r.submission_id = s.id
     LEFT JOIN submissions agent_sub
       ON agent_sub.polling_station_id = s.polling_station_id
      AND agent_sub.submission_type = 'primary'
      AND agent_sub.submission_origin = 'agent'
      AND agent_sub.status IN ('pending', 'verified', 'flagged')
      AND agent_sub.id <> s.id
     LEFT JOIN candidates agent_cand ON agent_cand.id = agent_sub.candidate_id
     LEFT JOIN users agent_user ON agent_user.id = agent_sub.user_id
     LEFT JOIN selected_results sel
       ON sel.polling_station_id = s.polling_station_id
      AND sel.position = r.position
     WHERE ${conditions.join(' AND ')}
       AND (agent_cand.id IS NULL OR agent_cand.position = r.position)
     ORDER BY s.submitted_at DESC
     LIMIT 200`,
    bindings
  )
}

/* -------------------------------------------------------------------------- */
/*                              Review actions                                 */
/* -------------------------------------------------------------------------- */

export interface FallbackActionResult {
  ok: boolean
  code?: FallbackRejectionCode | 'not_found' | 'conflict'
  message: string
  submissionId?: number
  selectedResult?: SelectedResultRow
}

/**
 * Approve an observer submission as the fallback result for its station.
 *
 * The eligibility rules are re-checked inside the transaction, and the
 * station is locked, so an agent submission that arrives at the same moment
 * cannot slip in and produce an inconsistent state.
 */
export async function approveObserverFallback(params: {
  submissionId: number
  candidateId: number
  actorId: number
  reason?: string | null
  now?: Date
}): Promise<FallbackActionResult> {
  const now = params.now ?? new Date()

  const outcome = await transaction(async (client: PoolClient) => {
    const submissionResult = await client.query<{
      id: number
      polling_station_id: number
      user_id: number
      submission_origin: SubmissionOrigin
      review_status: ReviewStatus | null
      status: string
      supersedes_submission_id: number | null
    }>(
      `SELECT id, polling_station_id, user_id, submission_origin, review_status, status,
              supersedes_submission_id
         FROM submissions
        WHERE id = $1
        FOR UPDATE`,
      [params.submissionId]
    )

    const submission = submissionResult.rows[0]
    if (!submission) {
      return { ok: false as const, code: 'not_found' as const, message: 'Submission not found' }
    }

    // The position of the submission decides which result it competes with.
    const resultRow = await client.query<{ position: string }>(
      'SELECT position FROM results WHERE submission_id = $1 LIMIT 1',
      [submission.id]
    )
    const position = resultRow.rows[0]?.position
    if (!position) {
      return {
        ok: false as const,
        code: 'submission_invalid' as const,
        message: 'This submission has no result figures attached.',
      }
    }

    // Lock the selection row for the station and position.
    await client.query(
      `SELECT id FROM selected_results
        WHERE polling_station_id = $1 AND position = $2
        FOR UPDATE`,
      [submission.polling_station_id, position]
    )

    const agentSubmission = await client.query<{ id: number; status: string }>(
      `SELECT s.id, s.status
         FROM submissions s
         JOIN candidates c ON c.id = s.candidate_id
        WHERE s.polling_station_id = $1
          AND c.position = $2
          AND s.submission_type = 'primary'
          AND s.submission_origin = 'agent'
          AND s.status IN ('pending', 'verified', 'flagged')
        ORDER BY s.id
        LIMIT 1`,
      [submission.polling_station_id, position]
    )

    const selectedRow = await client.query<{
      id: number
      source: SelectedResultSource
      submission_id: number
    }>(
      `SELECT id, source, submission_id
         FROM selected_results
        WHERE polling_station_id = $1 AND position = $2`,
      [submission.polling_station_id, position]
    )

    const observerAuthorized = await client.query(
      `SELECT 1 FROM observer_assignments
        WHERE user_id = $1 AND polling_station_id = $2 AND status = 'active'
        LIMIT 1`,
      [submission.user_id, submission.polling_station_id]
    )

    const ownsScope = await client.query(
      `SELECT 1 FROM candidates c
         JOIN polling_stations ps ON ps.id = $1
        WHERE c.id = $2
          AND c.position = $3
          AND (
            (c.position = 'president')
            OR (c.position IN ('governor', 'senator', 'women_rep') AND c.county_id = ps.county_id)
            OR (c.position = 'mp' AND c.constituency_id = ps.constituency_id)
            OR (c.position = 'mca' AND c.ward_id = ps.ward_id)
          )
        LIMIT 1`,
      [submission.polling_station_id, params.candidateId, position]
    )

    const eligibility = evaluateFallbackEligibility({
      submission: {
        id: submission.id,
        submission_origin: submission.submission_origin,
        review_status: submission.review_status,
        status: submission.status,
        polling_station_id: submission.polling_station_id,
        user_id: submission.user_id,
      },
      candidateOwnsScope: ownsScope.rows.length > 0,
      observerAuthorized: observerAuthorized.rows.length > 0,
      agentSubmission: agentSubmission.rows[0] ?? null,
      selectedResult: selectedRow.rows[0] ?? null,
    })

    if (!eligibility.eligible) {
      return {
        ok: false as const,
        code: eligibility.code!,
        message: eligibility.reasons[0],
      }
    }

    // Select this submission as the result for the station and position.
    const selected = await client.query<SelectedResultRow>(
      `INSERT INTO selected_results (
         polling_station_id, position, submission_id, source, approved_by, approved_at
       ) VALUES ($1, $2, $3, 'observer_fallback', $4, $5)
       ON CONFLICT (polling_station_id, position)
       DO UPDATE SET submission_id = EXCLUDED.submission_id,
                     source = EXCLUDED.source,
                     approved_by = EXCLUDED.approved_by,
                     approved_at = EXCLUDED.approved_at
       RETURNING *`,
      [submission.polling_station_id, position, submission.id, params.actorId, now]
    )

    // When the approved submission is a correction, the versions it replaces
    // are marked as superseded. Their figures and evidence are kept.
    const superseded = await markSuperseded(client, {
      revisionSubmissionId: submission.id,
      supersedesSubmissionId: submission.supersedes_submission_id,
    })

    // Keep the original submission and its figures, only record the decision.
    // An approved fallback is an approved result, so the submission is
    // verified as well. The origin stays 'observer': it is never presented
    // as an agent result.
    await client.query(
      `UPDATE submissions
          SET review_status = 'approved_fallback',
              review_reason = $1,
              reviewed_by = $2,
              reviewed_at = $3::timestamptz,
              status = 'verified',
              verified_at = $4::timestamp
        WHERE id = $5`,
      [params.reason ?? null, params.actorId, now, now, submission.id]
    )

    // The decision is also part of the review history of the submission, so
    // it shows up wherever a submission is reviewed.
    await client.query(
      `INSERT INTO submission_reviews (submission_id, reviewer_id, action, review_notes)
       VALUES ($1, $2, 'approve', $3)`,
      [
        submission.id,
        params.actorId,
        params.reason
          ? `Approved as the fallback result: ${params.reason}`
          : 'Approved as the fallback result',
      ]
    )

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'observer_fallback_approved', 'submission', $2, $3)`,
      [
        params.actorId,
        submission.id,
        JSON.stringify({
          polling_station_id: submission.polling_station_id,
          position,
          source: 'observer_fallback',
          reason: params.reason ?? null,
          approved_at: now.toISOString(),
        }),
      ]
    )

    return {
      ok: true as const,
      message: 'Observer submission approved as the fallback result.',
      submissionId: submission.id,
      selectedResult: selected.rows[0],
    }
  })

  if (outcome.ok) {
    await notifyObserverOfDecision(params.submissionId, 'approved_fallback')
  }

  return outcome
}

/**
 * Reject an observer submission.
 *
 * The submission and its figures are preserved; only the review state
 * changes.
 */
export async function rejectObserverFallback(params: {
  submissionId: number
  candidateId: number
  actorId: number
  reason?: string | null
  now?: Date
}): Promise<FallbackActionResult> {
  const now = params.now ?? new Date()

  const outcome = await transaction(async (client: PoolClient) => {
    const submissionResult = await client.query<{
      id: number
      polling_station_id: number
      user_id: number
      submission_origin: SubmissionOrigin
      review_status: ReviewStatus | null
      status: string
    }>(
      `SELECT id, polling_station_id, user_id, submission_origin, review_status, status
         FROM submissions
        WHERE id = $1
        FOR UPDATE`,
      [params.submissionId]
    )

    const submission = submissionResult.rows[0]
    if (!submission) {
      return { ok: false as const, code: 'not_found' as const, message: 'Submission not found' }
    }

    if (submission.submission_origin !== 'observer') {
      return {
        ok: false as const,
        code: 'not_observer_submission' as const,
        message: 'Only an observer submission can be rejected as a fallback.',
      }
    }

    if (submission.review_status === 'rejected_fallback') {
      return {
        ok: false as const,
        code: 'already_reviewed' as const,
        message: 'This submission was already rejected.',
      }
    }

    const resultRow = await client.query<{ position: string }>(
      'SELECT position FROM results WHERE submission_id = $1 LIMIT 1',
      [submission.id]
    )
    const position = resultRow.rows[0]?.position ?? null

    const ownsScope = await client.query(
      `SELECT 1 FROM candidates c
         JOIN polling_stations ps ON ps.id = $1
        WHERE c.id = $2
          AND c.position = $3
        LIMIT 1`,
      [submission.polling_station_id, params.candidateId, position]
    )
    if (ownsScope.rows.length === 0) {
      return {
        ok: false as const,
        code: 'not_in_scope' as const,
        message: 'This submission is outside the electoral area you are responsible for.',
      }
    }

    await client.query(
      `UPDATE submissions
          SET review_status = 'rejected_fallback',
              review_reason = $1,
              reviewed_by = $2,
              reviewed_at = $3
        WHERE id = $4`,
      [params.reason ?? null, params.actorId, now, submission.id]
    )

    await client.query(
      `INSERT INTO submission_reviews (submission_id, reviewer_id, action, review_notes)
       VALUES ($1, $2, 'reject', $3)`,
      [
        submission.id,
        params.actorId,
        params.reason ? `Rejected as a fallback result: ${params.reason}` : 'Rejected as a fallback result',
      ]
    )

    // A rejected submission is not the result of the station any more. The
    // selection is released so a report stops counting figures that were
    // rejected.
    await client.query('DELETE FROM selected_results WHERE submission_id = $1', [
      submission.id,
    ])

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'observer_fallback_rejected', 'submission', $2, $3)`,
      [
        params.actorId,
        submission.id,
        JSON.stringify({
          polling_station_id: submission.polling_station_id,
          position,
          reason: params.reason ?? null,
          reviewed_at: now.toISOString(),
        }),
      ]
    )

    return {
      ok: true as const,
      message: 'Observer submission rejected.',
      submissionId: submission.id,
    }
  })

  if (outcome.ok) {
    await notifyObserverOfDecision(params.submissionId, 'rejected_fallback')
  }

  return outcome
}

/**
 * Tell the observer which decision was taken on their submission.
 */
async function notifyObserverOfDecision(
  submissionId: number,
  decision: 'approved_fallback' | 'rejected_fallback'
): Promise<void> {
  try {
    const owner = await queryOne<{ user_id: number }>(
      'SELECT user_id FROM submissions WHERE id = $1',
      [submissionId]
    )
    if (!owner) return

    const approved = decision === 'approved_fallback'
    await createNotification({
      userId: owner.user_id,
      title: approved ? 'Fallback approved' : 'Fallback rejected',
      message: approved
        ? 'Your alternative result was approved by the candidate and is used as the fallback result for this station.'
        : 'Your alternative result was not approved as the fallback result for this station.',
      type: approved ? 'success' : 'warning',
      relatedEntityType: 'submission',
      relatedEntityId: submissionId,
    })
  } catch (error) {
    console.error('[fallback] Failed to notify observer of decision:', error)
  }
}

/* -------------------------------------------------------------------------- */
/*                                Conflicts                                    */
/* -------------------------------------------------------------------------- */

/**
 * Record that an agent result arrived for a station where a candidate already
 * approved an observer fallback.
 *
 * The approved fallback is NOT replaced. The conflict is stored in the
 * existing discrepancies table and the candidate is notified, so the
 * resolution is an explicit, audited decision.
 */
export async function recordAgentFallbackConflict(params: {
  agentSubmissionId: number
  observerSubmissionId: number
  pollingStationId: number
  position: string
  variancePercentage?: number | null
  details?: Record<string, unknown>
}): Promise<number | null> {
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM discrepancies
      WHERE primary_submission_id = $1
        AND backup_submission_id = $2
        AND status IN ('open', 'investigating')`,
    [params.agentSubmissionId, params.observerSubmissionId]
  )
  if (existing) return existing.id

  const created = await queryOne<{ id: number }>(
    `INSERT INTO discrepancies (
       polling_station_id, position, primary_submission_id, backup_submission_id,
       discrepancy_type, variance_percentage, details, status
     ) VALUES ($1, $2, $3, $4, 'agent_vs_backup', $5, $6, 'open')
     RETURNING id`,
    [
      params.pollingStationId,
      params.position,
      params.agentSubmissionId,
      params.observerSubmissionId,
      params.variancePercentage ?? null,
      JSON.stringify({
        ...params.details,
        conflict: 'agent_result_after_approved_observer_fallback',
        requires_review: true,
      }),
    ]
  )

  await recordAudit({
    userId: null,
    action: 'submission_conflict_detected',
    entityType: 'discrepancy',
    entityId: created?.id ?? null,
    newValues: {
      agent_submission_id: params.agentSubmissionId,
      observer_submission_id: params.observerSubmissionId,
      polling_station_id: params.pollingStationId,
      position: params.position,
    },
  })

  return created?.id ?? null
}

/**
 * Resolve a conflict between an agent result and an approved observer
 * fallback.
 *
 * `accept_agent` makes the agent result the selected result. `keep_fallback`
 * keeps the approved observer fallback and records the agent result as
 * reviewed. Neither action deletes a submission.
 */
export async function resolveSubmissionConflict(params: {
  conflictId: number
  candidateId: number
  actorId: number
  action: 'accept_agent' | 'keep_fallback'
  reason?: string | null
  now?: Date
}): Promise<{ ok: boolean; message: string; code?: string }> {
  const now = params.now ?? new Date()

  const outcome = await transaction(async (client: PoolClient) => {
    const conflictResult = await client.query<{
      id: number
      polling_station_id: number
      position: string
      primary_submission_id: number | null
      backup_submission_id: number | null
      status: string
    }>(
      `SELECT id, polling_station_id, position, primary_submission_id,
              backup_submission_id, status
         FROM discrepancies
        WHERE id = $1
        FOR UPDATE`,
      [params.conflictId]
    )

    const conflict = conflictResult.rows[0]
    if (!conflict) {
      return { ok: false as const, message: 'Conflict not found', code: 'not_found' }
    }

    if (conflict.status === 'resolved') {
      return {
        ok: false as const,
        message: 'This conflict has already been resolved.',
        code: 'already_resolved',
      }
    }

    const agentSubmissionId = conflict.primary_submission_id
    const observerSubmissionId = conflict.backup_submission_id

    if (!agentSubmissionId) {
      return {
        ok: false as const,
        message: 'The conflict has no agent submission to resolve.',
        code: 'conflict',
      }
    }

    if (params.action === 'accept_agent') {
      await client.query(
        `INSERT INTO selected_results (
           polling_station_id, position, submission_id, source, approved_by, approved_at
         ) VALUES ($1, $2, $3, 'agent_primary', $4, $5)
         ON CONFLICT (polling_station_id, position)
         DO UPDATE SET submission_id = EXCLUDED.submission_id,
                       source = EXCLUDED.source,
                       approved_by = EXCLUDED.approved_by,
                       approved_at = EXCLUDED.approved_at`,
        [conflict.polling_station_id, conflict.position, agentSubmissionId, params.actorId, now]
      )

      // The observer submission is kept, but it is no longer the selected result.
      if (observerSubmissionId) {
        await client.query(
          `UPDATE submissions
              SET review_status = 'rejected_fallback',
                  review_reason = COALESCE(review_reason, $1),
                  reviewed_by = $2,
                  reviewed_at = $3
            WHERE id = $4`,
          [
            params.reason || 'Superseded by an agent result after review',
            params.actorId,
            now,
            observerSubmissionId,
          ]
        )
      }
    } else if (observerSubmissionId) {
      await client.query(
        `INSERT INTO selected_results (
           polling_station_id, position, submission_id, source, approved_by, approved_at
         ) VALUES ($1, $2, $3, 'observer_fallback', $4, $5)
         ON CONFLICT (polling_station_id, position)
         DO UPDATE SET submission_id = EXCLUDED.submission_id,
                       source = EXCLUDED.source,
                       approved_by = EXCLUDED.approved_by,
                       approved_at = EXCLUDED.approved_at`,
        [conflict.polling_station_id, conflict.position, observerSubmissionId, params.actorId, now]
      )
    }

    await client.query(
      `UPDATE discrepancies
          SET status = $1,
              resolved_by = $2,
              resolved_at = $3,
              resolution_notes = $4
        WHERE id = $5`,
      [
        params.action === 'accept_agent' ? 'confirmed_error' : 'resolved',
        params.actorId,
        now,
        params.reason ?? null,
        conflict.id,
      ]
    )

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, 'discrepancy', $3, $4)`,
      [
        params.actorId,
        `submission_conflict_${params.action}`,
        conflict.id,
        JSON.stringify({
          polling_station_id: conflict.polling_station_id,
          position: conflict.position,
          agent_submission_id: agentSubmissionId,
          observer_submission_id: observerSubmissionId,
          reason: params.reason ?? null,
          resolved_at: now.toISOString(),
        }),
      ]
    )

    return {
      ok: true as const,
      message:
        params.action === 'accept_agent'
          ? 'The agent result is now the selected result for this station.'
          : 'The approved observer fallback remains the selected result for this station.',
    }
  })

  return outcome
}

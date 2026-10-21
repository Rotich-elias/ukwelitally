import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, queryMany, transaction } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { validateVoteCounts, detectAnomalies } from '@/lib/validation'
import {
  evaluateSubmissionAuthorization,
  getAgentWindowContext,
  getObserverWindowContext,
  lockScopeWindows,
  resolveObserverReportingScopeWith,
} from '@/lib/submissionWindow'
import { getSelectedResult, recordAgentFallbackConflict } from '@/lib/fallback'
import { getSupersededChain } from '@/lib/submissionRevisions'
import { createNotification } from '@/lib/notifications'
import { Result, Submission } from '@/types/database'

// POST /api/results - Create result entry for a submission
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    const body = await req.json()

    const {
      submission_id,
      position,
      registered_voters,
      total_votes_cast,
      valid_votes,
      rejected_votes,
      candidate_votes,
      manually_verified = false,
    } = body

    // Validate required fields
    if (
      !submission_id ||
      !position ||
      registered_voters === undefined ||
      total_votes_cast === undefined ||
      valid_votes === undefined ||
      rejected_votes === undefined ||
      !candidate_votes ||
      !Array.isArray(candidate_votes)
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify submission exists and user has access
    const submission = await queryOne<Submission>(
      'SELECT * FROM submissions WHERE id = $1',
      [submission_id]
    )

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Check permission
    if (user.role !== 'admin' && submission.user_id !== user.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // The result carries the vote figures, so the reporting window is
    // enforced here as well: closing the window stops the data entry, not
    // only the photo upload.
    let windowContext: Awaited<ReturnType<typeof getAgentWindowContext>> | null = null

    if (user.role === 'agent' || user.role === 'observer') {
      const account = await queryOne<{ active: boolean }>(
        'SELECT active FROM users WHERE id = $1',
        [user.userId]
      )
      const accountActive = account?.active === true

      windowContext =
        user.role === 'observer'
          ? await getObserverWindowContext(
              user.userId,
              submission.polling_station_id,
              position
            )
          : await getAgentWindowContext(user.userId)

      if (!windowContext) {
        return NextResponse.json(
          { error: 'Your reporting profile could not be resolved' },
          { status: 403 }
        )
      }

      const stationAssigned =
        user.role === 'agent'
          ? (await queryOne<{ polling_station_id: number | null }>(
              'SELECT polling_station_id FROM agents WHERE user_id = $1',
              [user.userId]
            ))?.polling_station_id === submission.polling_station_id
          : true

      const authorization = evaluateSubmissionAuthorization({
        role: user.role,
        accountActive,
        candidateAccessStatus: windowContext.accessStatus,
        window: windowContext.evaluation,
        stationAssigned,
        kind: user.role === 'observer' ? 'observer' : 'agent',
      })

      if (!authorization.allowed) {
        return NextResponse.json(
          {
            error: authorization.message,
            code: authorization.code,
            window_status: windowContext.evaluation.status,
          },
          { status: 403 }
        )
      }
    }

    // Validate that position matches candidate's actual position
    const candidatePosition = await queryOne<{ position: string }>(
      'SELECT c.position FROM candidates c WHERE c.id = $1',
      [submission.candidate_id]
    )

    if (!candidatePosition) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    // Only admins can create results for positions other than the candidate's position
    if (user.role !== 'admin' && candidatePosition.position !== position) {
      return NextResponse.json(
        {
          error: `Position mismatch: This candidate is running for ${candidatePosition.position}, but you're trying to submit results for ${position}. Please select the correct position.`,
        },
        { status: 400 }
      )
    }

    // Merge duplicate candidate entries so a candidate can only be counted
    // once per result. This keeps the vote total intact while satisfying the
    // candidate_votes unique constraint.
    const mergedVotes = new Map<string, { candidate_name: string; party_name?: string; votes: number }>()
    for (const cv of candidate_votes) {
      const key = cv.candidate_name.trim()
      const existing = mergedVotes.get(key)
      if (existing) {
        existing.votes += cv.votes
        if (!existing.party_name && cv.party_name) existing.party_name = cv.party_name
      } else {
        mergedVotes.set(key, {
          candidate_name: key,
          party_name: cv.party_name,
          votes: cv.votes,
        })
      }
    }
    const normalizedCandidateVotes = Array.from(mergedVotes.values())

    // Validate vote counts
    const validation = validateVoteCounts({
      registered_voters,
      total_votes_cast,
      valid_votes,
      rejected_votes,
      candidate_votes: normalizedCandidateVotes,
    })

    // Detect anomalies
    const anomalyCheck = detectAnomalies({
      total_votes_cast,
      registered_voters,
      valid_votes,
      rejected_votes,
      candidate_votes: normalizedCandidateVotes,
    })

    // Check if user is a primary agent for auto-verification
    let isPrimaryAgent = false
    if (user.role === 'agent') {
      const agentCheck = await queryOne<{ is_primary: boolean }>(
        'SELECT is_primary FROM agents WHERE user_id = $1',
        [user.userId]
      )
      isPrimaryAgent = agentCheck?.is_primary || false
    }

    // Reject a duplicate result for the same submission and position up front
    // so the user gets a clear conflict message instead of a database error.
    const existingResult = await queryOne<{ id: number }>(
      'SELECT id FROM results WHERE submission_id = $1 AND position = $2',
      [submission_id, position]
    )

    if (existingResult) {
      return NextResponse.json(
        {
          error:
            'Results already exist for this submission. Delete the existing result before submitting again.',
          result_id: existingResult.id,
        },
        { status: 409 }
      )
    }

    // Create result in transaction
    const conflict: {
      observerSubmissionId?: number
      agentSubmissionId?: number
      approvedBy?: number | null
      selectedSource?: string
    } = {}

    const result = await transaction(async (client) => {
      // Re-check the reporting window inside the transaction. The window row
      // is locked, so a close that happens now waits for this submission and
      // a submission can never be written after the window was closed.
      //
      // For an observer the scope is re-read as well: a candidate whose team
      // was withdrawn from the station in the meantime cannot authorise the
      // submission.
      if (user.role === 'agent' || user.role === 'observer') {
        let candidateIds = windowContext!.candidateIds
        let position = windowContext!.position

        if (user.role === 'observer') {
          const scope = await resolveObserverReportingScopeWith(
            client,
            submission.polling_station_id,
            position!
          )
          candidateIds = scope.candidateIds
        }

        const locked = await lockScopeWindows(
          client,
          { candidateIds, position },
          new Date()
        )

        if (!locked.canSubmit) {
          const error = new Error(locked.message) as Error & { status?: number }
          error.status = 403
          throw error
        }
      }

      // Insert result
      const resultData = await client.query<Result>(
        `INSERT INTO results (
          submission_id, polling_station_id, position,
          registered_voters, total_votes_cast, valid_votes, rejected_votes,
          is_valid, validation_errors, manually_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          submission_id,
          submission.polling_station_id,
          position,
          registered_voters,
          total_votes_cast,
          valid_votes,
          rejected_votes,
          validation.valid,
          validation.valid ? null : JSON.stringify({ errors: validation.errors }),
          manually_verified,
        ]
      )

      const resultRecord = resultData.rows[0]

      // Insert candidate votes
      for (const cv of normalizedCandidateVotes) {
        await client.query(
          `INSERT INTO candidate_votes (result_id, candidate_name, party_name, votes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (result_id, candidate_name)
           DO UPDATE SET votes = candidate_votes.votes + EXCLUDED.votes`,
          [resultRecord.id, cv.candidate_name, cv.party_name || null, cv.votes]
        )
      }

      // Update submission confidence score if math is invalid
      if (!validation.valid) {
        await client.query(
          'UPDATE submissions SET confidence_score = confidence_score - 20 WHERE id = $1',
          [submission_id]
        )
      }

      // Flag submission if anomalies detected
      if (anomalyCheck.hasAnomalies) {
        await client.query(
          'UPDATE submissions SET has_discrepancy = TRUE, flagged_reason = $1 WHERE id = $2',
          [anomalyCheck.flags.join('; '), submission_id]
        )
      }

      // Auto-verify submission for primary agents with valid data
      const autoVerifies =
        isPrimaryAgent &&
        validation.valid &&
        !anomalyCheck.hasAnomalies &&
        submission.submission_type === 'primary'

      if (autoVerifies) {
        await client.query(
          `UPDATE submissions
           SET status = 'verified', verified_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'pending'`,
          [submission_id]
        )
      }

      // A verified agent primary result becomes the selected result for the
      // station and position. When a candidate already approved an observer
      // fallback for the same station, the approved fallback is NOT replaced:
      // the conflict is recorded and the candidate resolves it explicitly.
      const isVerified =
        submission.status === 'verified' ||
        (autoVerifies && submission.status === 'pending')

      if (
        isVerified &&
        submission.submission_origin === 'agent' &&
        submission.submission_type === 'primary'
      ) {
        const existing = await client.query<{
          id: number
          source: string
          submission_id: number
          approved_by: number | null
        }>(
          `SELECT id, source, submission_id, approved_by
             FROM selected_results
            WHERE polling_station_id = $1 AND position = $2
            FOR UPDATE`,
          [submission.polling_station_id, position]
        )

        const current = existing.rows[0]

        // The versions this submission corrects. When the selected result
        // still points at one of them, the selected result is an earlier
        // version of this very submission: the approved correction replaces
        // it. That is a correction, not a conflict.
        const supersededChain = submission.supersedes_submission_id
          ? await getSupersededChain(submission.supersedes_submission_id, client)
          : []
        const supersededIds = supersededChain.map((version) => version.id)

        if (!current) {
          await client.query(
            `INSERT INTO selected_results (
               polling_station_id, position, submission_id, source
             ) VALUES ($1, $2, $3, 'agent_primary')
             ON CONFLICT (polling_station_id, position) DO NOTHING`,
            [submission.polling_station_id, position, submission_id]
          )
        } else if (supersededIds.includes(current.submission_id)) {
          // The correction is approved: the selected result follows it and
          // the versions it replaces are marked as superseded. The figures of
          // the earlier versions are kept.
          await client.query(
            `UPDATE selected_results
                SET submission_id = $1,
                    source = 'agent_primary',
                    approved_at = NOW()
              WHERE id = $2`,
            [submission_id, current.id]
          )
        } else if (current.source === 'observer_fallback') {
          conflict.observerSubmissionId = current.submission_id
          conflict.approvedBy = current.approved_by
          conflict.selectedSource = current.source
        } else {
          // Another agent already reported this station. The first result
          // stays selected so the outcome never depends on arrival order.
          conflict.agentSubmissionId = current.submission_id
          conflict.approvedBy = current.approved_by
          conflict.selectedSource = current.source
        }

        // The versions this correction replaces are superseded once the
        // correction is approved. Their figures and evidence are kept.
        if (supersededIds.length > 0) {
          await client.query(
            `UPDATE submissions
                SET superseded_by_submission_id = $1,
                    updated_at = NOW()
              WHERE id = ANY($2::int[])
                AND superseded_by_submission_id IS NULL`,
            [submission_id, supersededIds]
          )
        }
      }

      return resultRecord
    })

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        'result_created',
        'result',
        result.id,
        JSON.stringify({ position, total_votes_cast, valid_votes }),
      ]
    )

    // A conflict never overwrites the selected result. It is recorded and
    // the candidate decides how to resolve it.
    let conflict_detected = false
    if (conflict.observerSubmissionId || conflict.agentSubmissionId) {
      const observerSubmissionId = conflict.observerSubmissionId ?? null
      const otherAgentSubmissionId = conflict.agentSubmissionId ?? null

      if (observerSubmissionId) {
        const conflictId = await recordAgentFallbackConflict({
          agentSubmissionId: submission_id,
          observerSubmissionId,
          pollingStationId: submission.polling_station_id,
          position,
          details: {
            conflict: 'agent_result_after_approved_observer_fallback',
            requires_review: true,
          },
        })

        if (conflict.approvedBy) {
          await createNotification({
            userId: conflict.approvedBy,
            title: 'New agent result for an approved fallback',
            message:
              'An agent result arrived for a polling station where you approved an observer fallback. The approved fallback was not replaced. Please resolve the conflict.',
            type: 'warning',
            relatedEntityType: 'discrepancy',
            relatedEntityId: conflictId ?? undefined,
          })
        }
        conflict_detected = true
      } else if (otherAgentSubmissionId) {
        await recordAgentFallbackConflict({
          agentSubmissionId: submission_id,
          observerSubmissionId: otherAgentSubmissionId,
          pollingStationId: submission.polling_station_id,
          position,
          details: {
            conflict: 'second_agent_result_for_same_station',
            requires_review: true,
            note: 'The first agent result stays the selected result for this station.',
          },
        })
        conflict_detected = true
      }
    }

    return NextResponse.json(
      {
        message: 'Result created successfully',
        result,
        validation,
        anomalies: anomalyCheck.hasAnomalies ? anomalyCheck.flags : null,
        conflict_detected: conflict_detected,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating result:', error)

    // The reporting window was closed while the request was running. The
    // transaction rolled back, so nothing was written.
    if (error?.status === 403) {
      return NextResponse.json(
        { error: error.message, code: 'window_closed' },
        { status: 403 }
      )
    }

    // Unique violation on (submission_id, position): a concurrent request
    // inserted the same result. Surface it as a conflict, not a server error.
    if (error?.code === '23505') {
      return NextResponse.json(
        {
          error:
            'Results already exist for this submission. Delete the existing result before submitting again.',
        },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

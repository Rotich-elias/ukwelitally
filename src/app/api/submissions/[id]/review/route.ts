import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, transaction } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { compareWithIebcResults, compareWithPrimarySubmission } from '@/lib/verification'
import { notifyAdmins, notifySubmissionOwner, createNotification } from '@/lib/notifications'
import { recordAgentFallbackConflict } from '@/lib/fallback'
import { markSuperseded } from '@/lib/submissionRevisions'
import { Submission } from '@/types/database'

// POST /api/submissions/[id]/review - Admin review action
async function handlePost(
  req: NextRequest,
  context?: any
) {
  try {
    const user = (req as any).user

    // Extract params - handle Next.js 14/15 compatibility
    let submissionId: number

    if (context && context.params) {
      // Next.js 15 - params might be a Promise
      const params = await Promise.resolve(context.params)
      submissionId = parseInt(params.id)
      console.log('[Review] Got submission ID from params:', submissionId)
    } else {
      // Fallback - try to extract from URL
      const url = new URL(req.url)
      const pathParts = url.pathname.split('/')
      const idIndex = pathParts.indexOf('submissions') + 1
      submissionId = parseInt(pathParts[idIndex])
      console.log('[Review] Got submission ID from URL:', submissionId)
    }

    console.log('[Review] Processing review for submission:', submissionId, 'by user:', user.userId)

    // Validate submission ID
    if (isNaN(submissionId) || submissionId <= 0) {
      console.error('[Review] Invalid submission ID:', submissionId)
      return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 })
    }

    // Only admins and candidates (system users) can review
    if (user.role !== 'admin' && user.role !== 'candidate') {
      return NextResponse.json({ error: 'Unauthorized. Only admins and candidates can review submissions.' }, { status: 403 })
    }

    const body = await req.json()
    const { action, review_notes } = body

    console.log('[Review] Action:', action, 'Notes:', review_notes)

    // Validate action
    if (!['approve', 'reject', 'request_revision'].includes(action)) {
      console.error('[Review] Invalid action:', action)
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Get submission
    const submission = await queryOne<Submission>(
      'SELECT * FROM submissions WHERE id = $1',
      [submissionId]
    )

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // A candidate may only review submissions that belong to their own team or
    // fall inside their electoral scope. Without this check any authenticated
    // candidate could review a rival's submission (IDOR).
    if (user.role === 'candidate') {
      const candidateProfile = await queryOne<{ id: number }>(
        'SELECT id FROM candidates WHERE user_id = $1',
        [user.userId]
      )

      if (!candidateProfile) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }

      const inScope = await queryOne<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM submissions s
           JOIN polling_stations ps ON ps.id = s.polling_station_id
           JOIN wards w ON w.id = ps.ward_id
           JOIN constituencies con ON con.id = w.constituency_id
           JOIN candidates c ON c.id = $1
           WHERE s.id = $2
             AND (
               s.candidate_id = c.id
               OR s.scope_candidate_id = c.id
               OR (
                 c.position = 'president'
               )
               OR (
                 c.position = 'governor' AND ps.county_id = c.county_id
               )
               OR (
                 c.position = 'senator' AND ps.county_id = c.county_id
               )
               OR (
                 c.position = 'women_rep' AND ps.county_id = c.county_id
               )
               OR (
                 c.position = 'mp' AND con.id = c.constituency_id
               )
               OR (
                 c.position = 'mca' AND w.id = c.ward_id
               )
             )
         ) AS allowed`,
        [candidateProfile.id, submissionId]
      )

      if (!inScope?.allowed) {
        return NextResponse.json(
          { error: 'You can only review submissions within your electoral scope.' },
          { status: 403 }
        )
      }
    }

    // An observer submission is an alternative result. It only becomes the
    // result of a station through the candidate's fallback decision, so the
    // generic review action is not available for it.
    if (submission.submission_origin === 'observer' && user.role === 'candidate') {
      return NextResponse.json(
        {
          error:
            'Observer submissions are reviewed through the fallback review. Use the observer review queue to approve or reject a fallback.',
        },
        { status: 400 }
      )
    }

    let newStatus = submission.status
    let verifiedAt = submission.verified_at

    switch (action) {
      case 'approve':
        newStatus = 'verified'
        verifiedAt = new Date()
        break
      case 'reject':
        newStatus = 'rejected'
        break
      case 'request_revision':
        newStatus = 'flagged'
        break
    }

    console.log('[Review] Updating submission status to:', newStatus)

    // The status change, the review record and the selection update are
    // applied in one transaction, so a report never sees half of a decision.
    let conflict_detected = false

    await transaction(async (client) => {
      // Update submission
      await client.query(
        `UPDATE submissions
         SET status = $1, verified_at = $2
         WHERE id = $3`,
        [newStatus, verifiedAt, submissionId]
      )

      console.log('[Review] Creating review record')

      // Create review record
      await client.query(
        `INSERT INTO submission_reviews (submission_id, reviewer_id, action, review_notes)
         VALUES ($1, $2, $3, $4)`,
        [submissionId, user.userId, action, review_notes || null]
      )

      // A submission that is no longer approved must not stay the selected
      // result: a report would otherwise count figures that were flagged or
      // rejected. The station simply has no result until a version is
      // approved.
      if (newStatus !== 'verified') {
        await client.query(
          'DELETE FROM selected_results WHERE submission_id = $1',
          [submissionId]
        )
      }

      // A verified agent primary result becomes the selected result for the
      // station and position, unless a candidate already approved an observer
      // fallback for it. An approved fallback is never silently replaced: the
      // conflict is recorded and the candidate resolves it.
      if (
        newStatus === 'verified' &&
        submission.submission_origin === 'agent' &&
        submission.submission_type === 'primary'
      ) {
        const positionRow = await client.query<{ position: string }>(
          'SELECT position FROM results WHERE submission_id = $1 LIMIT 1',
          [submissionId]
        )
        const position = positionRow.rows[0]?.position

        if (position) {
          const existingResult = await client.query<{
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
          const existing = existingResult.rows[0]

          if (!existing) {
            await client.query(
              `INSERT INTO selected_results (polling_station_id, position, submission_id, source)
               VALUES ($1, $2, $3, 'agent_primary')
               ON CONFLICT (polling_station_id, position) DO NOTHING`,
              [submission.polling_station_id, position, submissionId]
            )
          } else if (
            submission.supersedes_submission_id &&
            existing.submission_id === submission.supersedes_submission_id
          ) {
            // The approved submission is a correction of the selected result.
            // The selected result follows the correction. The figures of the
            // earlier version are kept.
            await client.query(
              `UPDATE selected_results
                  SET submission_id = $1,
                      source = 'agent_primary',
                      approved_at = NOW()
                WHERE id = $2`,
              [submissionId, existing.id]
            )
          } else if (existing.source === 'observer_fallback') {
            const conflictId = await recordAgentFallbackConflict({
              agentSubmissionId: submissionId,
              observerSubmissionId: existing.submission_id,
              pollingStationId: submission.polling_station_id,
              position,
              details: {
                conflict: 'agent_result_after_approved_observer_fallback',
                requires_review: true,
              },
            })

            if (existing.approved_by) {
              await createNotification({
                userId: existing.approved_by,
                title: 'New agent result for an approved fallback',
                message:
                  'An agent result was approved for a polling station where you approved an observer fallback. The approved fallback was not replaced. Please resolve the conflict.',
                type: 'warning',
                relatedEntityType: 'discrepancy',
                relatedEntityId: conflictId ?? undefined,
              })
            }
            conflict_detected = true
          } else {
            // Another agent result is already selected for this station. The
            // first one stays selected so the outcome never depends on which
            // submission happened to arrive last.
            await recordAgentFallbackConflict({
              agentSubmissionId: submissionId,
              observerSubmissionId: existing.submission_id,
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

          // The versions this correction replaces are superseded once the
          // correction is approved. Their figures and evidence are kept.
          if (submission.supersedes_submission_id) {
            const superseded = await markSuperseded(client, {
              revisionSubmissionId: submissionId,
              supersedesSubmissionId: submission.supersedes_submission_id,
            })

            if (superseded.length > 0) {
              await client.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
                 VALUES ($1, 'submission_revision_approved', 'submission', $2, $3)`,
                [
                  user.userId,
                  submissionId,
                  JSON.stringify({
                    superseded_submission_ids: superseded,
                    revision_number: submission.revision_number,
                  }),
                ]
              )
            }
          }
        }
      }
    })

    console.log('[Review] Creating audit log')

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        `submission_${action}`,
        'submission',
        submissionId,
        JSON.stringify({ status: newStatus, review_notes }),
      ]
    )

    // Notify the submitter of the outcome.
    const outcomeMessages: Record<string, { title: string; message: string; type: 'info' | 'warning' | 'error' | 'success' }> = {
      approve: {
        title: 'Submission approved',
        message: 'Your submission was verified and is now included in the published results.',
        type: 'success',
      },
      reject: {
        title: 'Submission rejected',
        message: 'Your submission was rejected. Please contact an administrator for details.',
        type: 'error',
      },
      request_revision: {
        title: 'Revision requested',
        message: 'Your submission needs revision. Please resubmit with corrected figures.',
        type: 'warning',
      },
    }

    const outcome = outcomeMessages[action]
    if (outcome) {
      await notifySubmissionOwner(submissionId, outcome)
    }

    // When a submission is verified, run the verification checks against the
    // primary submission for the same station and against official IEBC data.
    let discrepancy = null
    if (newStatus === 'verified') {
      const resultRow = await queryOne<{ position: string }>(
        'SELECT position FROM results WHERE submission_id = $1 LIMIT 1',
        [submissionId]
      )

      if (resultRow?.position) {
        try {
          if (submission.submission_type === 'backup') {
            discrepancy = await compareWithPrimarySubmission(
              submissionId,
              submission.polling_station_id,
              resultRow.position
            )
          }

          if (!discrepancy) {
            discrepancy = await compareWithIebcResults(
              submissionId,
              submission.polling_station_id,
              resultRow.position
            )
          }

          if (discrepancy) {
            await notifyAdmins({
              title: 'Discrepancy detected',
              message: `A ${discrepancy.variance_percentage.toFixed(2)}% vote variance was detected at a polling station and needs review.`,
              type: 'warning',
              relatedEntityType: 'discrepancy',
              relatedEntityId: discrepancy.id,
            })
          }
        } catch (verificationError) {
          // Verification failures must not block the review itself.
          console.error('[Review] Verification check failed:', verificationError)
        }
      }
    }

    console.log('[Review] Successfully completed review for submission:', submissionId)

    return NextResponse.json({
      message: `Submission ${action}d successfully`,
      submission: {
        id: submissionId,
        status: newStatus,
        verified_at: verifiedAt,
      },
      discrepancy_detected: !!discrepancy,
      conflict_detected: conflict_detected,
    })
  } catch (error) {
    console.error('Error reviewing submission:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

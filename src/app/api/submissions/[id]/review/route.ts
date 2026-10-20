import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { compareWithIebcResults, compareWithPrimarySubmission } from '@/lib/verification'
import { notifyAdmins, notifySubmissionOwner } from '@/lib/notifications'
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

    // Update submission
    await query(
      `UPDATE submissions
       SET status = $1, verified_at = $2
       WHERE id = $3`,
      [newStatus, verifiedAt, submissionId]
    )

    console.log('[Review] Creating review record')

    // Create review record
    await query(
      `INSERT INTO submission_reviews (submission_id, reviewer_id, action, review_notes)
       VALUES ($1, $2, $3, $4)`,
      [submissionId, user.userId, action, review_notes || null]
    )

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

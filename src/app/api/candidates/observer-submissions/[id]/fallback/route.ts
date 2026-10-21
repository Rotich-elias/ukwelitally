import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { getCandidateProfile } from '@/lib/candidate-restrictions'
import { approveObserverFallback, rejectObserverFallback } from '@/lib/fallback'
import { recordAudit, auditRequestContext } from '@/lib/audit'
import { checkRateLimit, getClientIp, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/candidates/observer-submissions/[id]/fallback
 *
 * The candidate approves or rejects an observer submission as the fallback
 * result for a polling station.
 *
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * The eligibility rules are re-checked on the server inside a transaction, so
 * an approval can never be forced by a stale browser tab.
 */
async function handlePost(req: NextRequest, context?: any) {
  try {
    const user = (req as any).user

    if (user.role !== 'candidate') {
      return NextResponse.json(
        { error: 'Only candidates can approve or reject a fallback result' },
        { status: 403 }
      )
    }

    const candidate = await getCandidateProfile(user.userId)
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    const params = await Promise.resolve(context?.params ?? {})
    const submissionId = parseInt(params?.id)
    if (!submissionId || submissionId <= 0) {
      return NextResponse.json({ error: 'Invalid submission id' }, { status: 400 })
    }

    // A review decision is a privileged action, so it is rate limited.
    const limit = checkRateLimit(
      rateLimitKey('fallback', `${user.userId}:${getClientIp(req)}`),
      RATE_LIMITS.fallbackDecision.limit,
      RATE_LIMITS.fallbackDecision.windowMs
    )
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many review actions. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const body = await req.json()
    const action = body?.action
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : null

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'action must be either approve or reject' },
        { status: 400 }
      )
    }

    // A rejection is a decision about a submission, so a reason is always
    // required. An approval is recorded with a reason when one is given.
    if (action === 'reject' && !reason) {
      return NextResponse.json(
        { error: 'A reason is required when rejecting an observer submission' },
        { status: 400 }
      )
    }

    const result =
      action === 'approve'
        ? await approveObserverFallback({
            submissionId,
            candidateId: candidate.id,
            actorId: user.userId,
            reason,
          })
        : await rejectObserverFallback({
            submissionId,
            candidateId: candidate.id,
            actorId: user.userId,
            reason,
          })

    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : 409
      return NextResponse.json({ error: result.message, code: result.code }, { status })
    }

    const { ipAddress, userAgent } = auditRequestContext(req)
    await recordAudit({
      userId: user.userId,
      action:
        action === 'approve'
          ? 'observer_fallback_approved'
          : 'observer_fallback_rejected',
      entityType: 'submission',
      entityId: submissionId,
      newValues: {
        candidate_id: candidate.id,
        reason: reason ?? null,
        source: action === 'approve' ? 'observer_fallback' : undefined,
      },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      submission_id: submissionId,
      selected_result: result.selectedResult ?? null,
    })
  } catch (error) {
    console.error('Error deciding on observer fallback:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

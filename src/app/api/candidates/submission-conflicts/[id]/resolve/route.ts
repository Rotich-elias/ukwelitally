import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { getCandidateProfile } from '@/lib/candidate-restrictions'
import { resolveSubmissionConflict } from '@/lib/fallback'
import { recordAudit, auditRequestContext } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/candidates/submission-conflicts/[id]/resolve
 *
 * Resolve a conflict between an agent result and an approved observer
 * fallback.
 *
 * Body: { action: 'accept_agent' | 'keep_fallback', reason?: string }
 *
 * Nothing is deleted: the losing submission is kept and its review state is
 * updated so the history stays auditable.
 */
async function handlePost(req: NextRequest, context?: any) {
  try {
    const user = (req as any).user

    // A candidate makes the first decision; changing a result another
    // candidate approved is left to an administrator, who can resolve any
    // conflict.
    const isAdmin = user.role === 'admin'
    if (user.role !== 'candidate' && !isAdmin) {
      return NextResponse.json(
        { error: 'Only candidates and administrators can resolve submission conflicts' },
        { status: 403 }
      )
    }

    let candidate: Awaited<ReturnType<typeof getCandidateProfile>> = null
    if (!isAdmin) {
      candidate = await getCandidateProfile(user.userId)
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }

      if (candidate.access_status !== 'active') {
        return NextResponse.json(
          { error: 'Your subscription is not active. Contact an administrator to restore access.' },
          { status: 403 }
        )
      }
    }

    const params = await Promise.resolve(context?.params ?? {})
    const conflictId = parseInt(params?.id)
    if (!conflictId || conflictId <= 0) {
      return NextResponse.json({ error: 'Invalid conflict id' }, { status: 400 })
    }

    const body = await req.json()
    const action = body?.action
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : null

    if (action !== 'accept_agent' && action !== 'keep_fallback') {
      return NextResponse.json(
        { error: 'action must be either accept_agent or keep_fallback' },
        { status: 400 }
      )
    }

    const result = await resolveSubmissionConflict({
      conflictId,
      candidateId: candidate?.id ?? null,
      asAdmin: isAdmin,
      actorId: user.userId,
      action,
      reason,
    })

    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : 409
      return NextResponse.json({ error: result.message, code: result.code }, { status })
    }

    const { ipAddress, userAgent } = auditRequestContext(req)
    await recordAudit({
      userId: user.userId,
      action: `submission_conflict_${action}`,
      entityType: 'discrepancy',
      entityId: conflictId,
      newValues: { candidate_id: candidate?.id ?? null, as_admin: isAdmin, reason: reason ?? null },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({ success: true, message: result.message })
  } catch (error) {
    console.error('Error resolving submission conflict:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

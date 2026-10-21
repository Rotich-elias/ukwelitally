import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import {
  formatNairobi,
  getAgentWindowContext,
  getObserverWindowContext,
} from '@/lib/submissionWindow'
import { getObserverAssignments } from '@/lib/observer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/submissions/window
 *
 * The reporting window that governs the logged in agent or observer, together
 * with the state of their account. Agents and observers can always log in and
 * use the rest of their dashboard: only submitting a result is blocked while
 * the window is closed.
 */
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user
    const { searchParams } = new URL(req.url)

    if (user.role !== 'agent' && user.role !== 'observer') {
      return NextResponse.json(
        { error: 'Only agents and observers can read a reporting window' },
        { status: 403 }
      )
    }

    const account = await queryOne<{ active: boolean }>(
      'SELECT active FROM users WHERE id = $1',
      [user.userId]
    )

    const accountActive = account?.active === true

    if (user.role === 'agent') {
      const context = await getAgentWindowContext(user.userId)
      if (!context) {
        return NextResponse.json(
          { error: 'Agent profile not found', window: null },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        account_active: accountActive,
        kind: 'agent',
        window: {
          status: context.evaluation.status,
          can_submit: context.evaluation.canSubmit && accountActive,
          message: accountActive
            ? context.evaluation.message
            : 'Your account is not active. Contact your candidate to restore it.',
          opens_at: context.evaluation.opensAt
            ? context.evaluation.opensAt.toISOString()
            : null,
          closes_at: context.evaluation.closesAt
            ? context.evaluation.closesAt.toISOString()
            : null,
          opens_at_display: formatNairobi(context.evaluation.opensAt),
          closes_at_display: formatNairobi(context.evaluation.closesAt),
        },
      })
    }

    // Observers: the window follows the position and station they are
    // assigned to.
    const assignments = await getObserverAssignments(user.userId)
    if (assignments.length === 0) {
      return NextResponse.json({
        success: true,
        account_active: accountActive,
        kind: 'observer',
        window: {
          status: 'closed',
          can_submit: false,
          message: 'You do not have an active observer assignment.',
          opens_at: null,
          closes_at: null,
          opens_at_display: null,
          closes_at_display: null,
        },
      })
    }

    const assignment = assignments[0]
    // Observers report a position rather than a single candidate. The
    // observer picks the race they are reporting, and the window that
    // governs it is the one of the candidates running that race in their
    // area.
    const requestedPosition = searchParams.get('position')
    const position = requestedPosition || 'president'

    const context = await getObserverWindowContext(
      user.userId,
      assignment.polling_station_id,
      position
    )

    return NextResponse.json({
      success: true,
      account_active: accountActive,
      kind: 'observer',
      window: {
        status: context.evaluation.status,
        can_submit: context.evaluation.canSubmit && accountActive,
        message: accountActive
          ? context.evaluation.message
          : 'Your account is not active. Contact an administrator to restore it.',
        opens_at: context.evaluation.opensAt ? context.evaluation.opensAt.toISOString() : null,
        closes_at: context.evaluation.closesAt ? context.evaluation.closesAt.toISOString() : null,
        opens_at_display: formatNairobi(context.evaluation.opensAt),
        closes_at_display: formatNairobi(context.evaluation.closesAt),
      },
    })
  } catch (error) {
    console.error('Error fetching reporting window:', error)
    return NextResponse.json(
      { error: 'Failed to fetch the reporting window' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

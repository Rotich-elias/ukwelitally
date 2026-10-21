import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { getCandidateProfile } from '@/lib/candidate-restrictions'
import {
  applyWindowAction,
  evaluateWindow,
  formatNairobi,
  getWindowForCandidate,
  stationScopeCondition,
  type WindowAction,
} from '@/lib/submissionWindow'
import { recordAudit, auditRequestContext } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * The candidate controlled reporting window.
 *
 * GET  /api/candidates/submission-window  -> current state and summary
 * POST /api/candidates/submission-window  -> open / close / schedule / cancel
 *
 * Only the candidate who owns the team can read or change their window.
 * Every transition is written to the audit trail.
 */

async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user

    if (user.role !== 'candidate') {
      return NextResponse.json(
        { error: 'Only candidates can access the reporting window' },
        { status: 403 }
      )
    }

    const candidate = await getCandidateProfile(user.userId)
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    const window = await getWindowForCandidate(candidate.id, candidate.position)
    const evaluation = evaluateWindow(window)

    const scope = stationScopeCondition(candidate.position, candidate)
    const scopeParams = scope.params
    // The scope binds at most one parameter, so the parameters that follow it
    // start right after it.
    const candidateIndex = scopeParams.length + 1
    const positionIndex = scopeParams.length + 2

    const counts = await queryOne<{
      agent_primary: number
      observer_alternative: number
      awaiting_review: number
      approved_fallback: number
      rejected_fallback: number
      stations_without_agent: number
      stations_with_conflicts: number
      total_stations: number
    }>(
      `WITH scope_stations AS (
         SELECT ps.id FROM polling_stations ps WHERE ${scope.clause}
       ),
       agent_stations AS (
         SELECT DISTINCT s.polling_station_id
           FROM submissions s
          WHERE s.submission_origin = 'agent'
            AND s.submission_type = 'primary'
            AND s.candidate_id = $${candidateIndex}
       ),
       observer_subs AS (
         SELECT s.id, s.review_status, s.polling_station_id
           FROM submissions s
           JOIN results r ON r.submission_id = s.id
          WHERE s.submission_origin = 'observer'
            AND r.position = $${positionIndex}
            AND s.polling_station_id IN (SELECT id FROM scope_stations)
       )
       SELECT
         (SELECT COUNT(*) FROM submissions s
           WHERE s.submission_origin = 'agent'
             AND s.submission_type = 'primary'
             AND s.candidate_id = $${candidateIndex}) AS agent_primary,
         (SELECT COUNT(*) FROM observer_subs) AS observer_alternative,
         (SELECT COUNT(*) FROM observer_subs WHERE review_status = 'pending_review') AS awaiting_review,
         (SELECT COUNT(*) FROM observer_subs WHERE review_status = 'approved_fallback') AS approved_fallback,
         (SELECT COUNT(*) FROM observer_subs WHERE review_status = 'rejected_fallback') AS rejected_fallback,
         (SELECT COUNT(*) FROM scope_stations WHERE id NOT IN (SELECT polling_station_id FROM agent_stations)) AS stations_without_agent,
         (SELECT COUNT(*) FROM discrepancies d
           WHERE d.status IN ('open', 'investigating')
             AND d.discrepancy_type = 'agent_vs_backup'
             AND d.polling_station_id IN (SELECT id FROM scope_stations)) AS stations_with_conflicts,
         (SELECT COUNT(*) FROM scope_stations) AS total_stations`,
      [...scopeParams, candidate.id, candidate.position]
    )

    const affected = await queryOne<{ agents: number; observers: number }>(
      `SELECT
         (SELECT COUNT(*) FROM agents a JOIN users u ON u.id = a.user_id
           WHERE a.candidate_id = $${candidateIndex} AND u.active = TRUE) AS agents,
         (SELECT COUNT(DISTINCT oa.user_id) FROM observer_assignments oa
           JOIN polling_stations ps ON ps.id = oa.polling_station_id
          WHERE oa.status = 'active' AND ${scope.clause}) AS observers`,
      [...scopeParams, candidate.id]
    )

    return NextResponse.json({
      success: true,
      window: {
        id: window?.id ?? null,
        status: evaluation.status,
        can_submit: evaluation.canSubmit,
        message: evaluation.message,
        opens_at: evaluation.opensAt ? evaluation.opensAt.toISOString() : null,
        closes_at: evaluation.closesAt ? evaluation.closesAt.toISOString() : null,
        opens_at_display: formatNairobi(evaluation.opensAt),
        closes_at_display: formatNairobi(evaluation.closesAt),
        opened_at: window?.opened_at ?? null,
        closed_at: window?.closed_at ?? null,
      },
      access_status: candidate.access_status,
      scope: {
        position: candidate.position,
        county_id: candidate.county_id ?? null,
        constituency_id: candidate.constituency_id ?? null,
        ward_id: candidate.ward_id ?? null,
      },
      summary: {
        agent_primary: Number(counts?.agent_primary || 0),
        observer_alternative: Number(counts?.observer_alternative || 0),
        awaiting_review: Number(counts?.awaiting_review || 0),
        approved_fallback: Number(counts?.approved_fallback || 0),
        rejected_fallback: Number(counts?.rejected_fallback || 0),
        stations_without_agent: Number(counts?.stations_without_agent || 0),
        stations_with_conflicts: Number(counts?.stations_with_conflicts || 0),
        total_stations: Number(counts?.total_stations || 0),
        agents_affected: Number(affected?.agents || 0),
        observers_affected: Number(affected?.observers || 0),
      },
    })
  } catch (error) {
    console.error('Error fetching submission window:', error)
    return NextResponse.json({ error: 'Failed to fetch the reporting window' }, { status: 500 })
  }
}

async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user

    if (user.role !== 'candidate') {
      return NextResponse.json(
        { error: 'Only candidates can control their reporting window' },
        { status: 403 }
      )
    }

    const candidate = await getCandidateProfile(user.userId)
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    const body = await req.json()
    const action = body?.action as WindowAction

    if (!['open', 'close', 'schedule', 'cancel_schedule'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be one of open, close, schedule or cancel_schedule' },
        { status: 400 }
      )
    }

    if (candidate.access_status !== 'active') {
      return NextResponse.json(
        {
          error:
            'Your subscription is not active. An administrator has to restore your access before you can control result submission.',
        },
        { status: 403 }
      )
    }

    const before = await getWindowForCandidate(candidate.id, candidate.position)

    const result = await applyWindowAction({
      candidateId: candidate.id,
      position: candidate.position,
      action,
      actorId: user.userId,
      opensAt: body?.opens_at ?? null,
      closesAt: body?.closes_at ?? null,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, errors: result.errors },
        { status: 400 }
      )
    }

    const actionNames: Record<WindowAction, string> = {
      open: 'submission_window_opened',
      close: 'submission_window_closed',
      schedule: 'submission_window_scheduled',
      cancel_schedule: 'submission_window_schedule_cancelled',
    }

    const { ipAddress, userAgent } = auditRequestContext(req)

    await recordAudit({
      userId: user.userId,
      action: actionNames[action],
      entityType: 'submission_window',
      entityId: result.window?.id ?? null,
      oldValues: before
        ? {
            status: before.status,
            opens_at: before.opens_at,
            closes_at: before.closes_at,
          }
        : null,
      newValues: {
        status: result.window?.status,
        opens_at: result.window?.opens_at,
        closes_at: result.window?.closes_at,
        candidate_id: candidate.id,
        position: candidate.position,
      },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      message: result.evaluation.message,
      window: {
        id: result.window?.id ?? null,
        status: result.evaluation.status,
        can_submit: result.evaluation.canSubmit,
        message: result.evaluation.message,
        opens_at: result.evaluation.opensAt ? result.evaluation.opensAt.toISOString() : null,
        closes_at: result.evaluation.closesAt ? result.evaluation.closesAt.toISOString() : null,
        opens_at_display: formatNairobi(result.evaluation.opensAt),
        closes_at_display: formatNairobi(result.evaluation.closesAt),
      },
    })
  } catch (error) {
    console.error('Error updating submission window:', error)
    return NextResponse.json({ error: 'Failed to update the reporting window' }, { status: 500 })
  }
}

export const GET = withAuth(handleGet as any)
export const POST = withAuth(handlePost as any)

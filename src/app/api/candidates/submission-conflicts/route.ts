import { NextRequest, NextResponse } from 'next/server'
import { queryMany } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { getCandidateProfile } from '@/lib/candidate-restrictions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/candidates/submission-conflicts
 *
 * Conflicts between an agent result and a candidate approved observer
 * fallback, scoped to the candidate's own electoral area.
 */
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user

    // An administrator sees every conflict, so they can decide the ones a
    // candidate may not: changing a result another candidate approved.
    const isAdmin = user.role === 'admin'
    if (user.role !== 'candidate' && !isAdmin) {
      return NextResponse.json(
        { error: 'Only candidates and administrators can view submission conflicts' },
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

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get('status')
    const status =
      statusParam === 'resolved' || statusParam === 'all' ? statusParam : 'open'

    const scope = !candidate
      ? { clause: '1=1', params: [] as any[] }
      : candidate.position === 'mca' && candidate.ward_id
        ? { clause: 'ps.ward_id = $1', params: [candidate.ward_id] }
        : candidate.position === 'mp' && candidate.constituency_id
          ? { clause: 'ps.constituency_id = $1', params: [candidate.constituency_id] }
          : ['governor', 'senator', 'women_rep'].includes(candidate.position) &&
              candidate.county_id
            ? { clause: 'ps.county_id = $1', params: [candidate.county_id] }
            : { clause: '1=1', params: [] as any[] }

    const statusCondition =
      status === 'all' ? '' : "AND d.status IN ('open', 'investigating')"

    const conflicts = await queryMany(
      `SELECT
         d.id,
         d.polling_station_id,
         d.position,
         d.primary_submission_id,
         d.backup_submission_id,
         d.discrepancy_type,
         d.variance_percentage,
         d.details,
         d.status,
         d.resolved_by,
         d.resolved_at,
         d.resolution_notes,
         d.created_at,
         ps.name as polling_station_name,
         ps.code as polling_station_code,
         w.name as ward_name,
         con.name as constituency_name,
         co.name as county_name,
         agent_user.full_name as agent_name,
         observer_user.full_name as observer_name,
         sel.source as selected_source,
         sel.submission_id as selected_submission_id,
         sel.approved_by as selected_approved_by,
         approver.full_name as approved_by_name
       FROM discrepancies d
       JOIN polling_stations ps ON ps.id = d.polling_station_id
       LEFT JOIN wards w ON w.id = ps.ward_id
       LEFT JOIN constituencies con ON con.id = ps.constituency_id
       LEFT JOIN counties co ON co.id = ps.county_id
       LEFT JOIN submissions agent_sub ON agent_sub.id = d.primary_submission_id
       LEFT JOIN users agent_user ON agent_user.id = agent_sub.user_id
       LEFT JOIN submissions observer_sub ON observer_sub.id = d.backup_submission_id
       LEFT JOIN users observer_user ON observer_user.id = observer_sub.user_id
       LEFT JOIN selected_results sel
         ON sel.polling_station_id = d.polling_station_id
        AND sel.position = d.position
       LEFT JOIN users approver ON approver.id = sel.approved_by
       WHERE d.discrepancy_type = 'agent_vs_backup'
         AND ${scope.clause}
         -- Only the candidate's own race: an MCA candidate must not see the
         -- presidential or governor conflicts of the stations in their ward.
         AND ($${scope.params.length + 1}::text IS NULL OR d.position = $${scope.params.length + 1})
         ${statusCondition}
       ORDER BY d.created_at DESC
       LIMIT 200`,
      [...scope.params, candidate?.position ?? null]
    )

    // Whether the viewer may resolve the conflict themselves. A candidate
    // may only change a result they approved (or one nobody approved); the
    // rest is shown with a note that an administrator decides.
    const withPermissions = conflicts.map(({ selected_approved_by, ...conflict }: any) => ({
      ...conflict,
      can_resolve:
        isAdmin || selected_approved_by === null || selected_approved_by === user.userId,
    }))

    return NextResponse.json({
      success: true,
      conflicts: withPermissions,
      count: withPermissions.length,
    })
  } catch (error) {
    console.error('Error fetching submission conflicts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch submission conflicts' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

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

    if (user.role !== 'candidate') {
      return NextResponse.json(
        { error: 'Only candidates can view submission conflicts' },
        { status: 403 }
      )
    }

    const candidate = await getCandidateProfile(user.userId)
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get('status')
    const status =
      statusParam === 'resolved' || statusParam === 'all' ? statusParam : 'open'

    const scope =
      candidate.position === 'mca' && candidate.ward_id
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
         sel.submission_id as selected_submission_id
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
       WHERE d.discrepancy_type = 'agent_vs_backup'
         AND ${scope.clause}
         ${statusCondition}
       ORDER BY d.created_at DESC
       LIMIT 100`,
      scope.params
    )

    return NextResponse.json({ success: true, conflicts, count: conflicts.length })
  } catch (error) {
    console.error('Error fetching submission conflicts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch submission conflicts' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

import { NextRequest, NextResponse } from 'next/server'
import { queryMany, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { getCandidateRestrictions } from '@/lib/candidate-restrictions'

// GET /api/polling-stations/reporting-status - Get all polling stations with submission status
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user

    // Block agents from viewing this data
    if (user.role === 'agent') {
      return NextResponse.json({ error: 'Unauthorized. Agents cannot view polling station reporting status.' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    let countyId = searchParams.get('county_id')
    let constituencyId = searchParams.get('constituency_id')
    let wardId = searchParams.get('ward_id')
    const statusFilter = searchParams.get('status') || 'all' // all, submitted, not_submitted
    let position = searchParams.get('position')

    // Volunteers may only view the presidential race.
    if (user.role === 'observer') {
      position = 'president'
    }

    // A candidate is scoped to their own race and electoral area, no matter
    // what the query string says.
    if (user.role === 'candidate') {
      const restrictions = await getCandidateRestrictions(user.userId)
      if (restrictions) {
        position = restrictions.position
        if (restrictions.position === 'mca') {
          countyId = null
          constituencyId = null
          wardId = restrictions.ward_id ? String(restrictions.ward_id) : null
        } else if (restrictions.position === 'mp') {
          countyId = null
          constituencyId = restrictions.constituency_id
            ? String(restrictions.constituency_id)
            : null
          wardId = null
        } else if (
          restrictions.position === 'governor' ||
          restrictions.position === 'senator' ||
          restrictions.position === 'women_rep'
        ) {
          countyId = restrictions.county_id ? String(restrictions.county_id) : null
          constituencyId = null
          wardId = null
        }
      }
    }

    console.log('[Reporting Status] Request params:', {
      countyId,
      constituencyId,
      wardId,
      statusFilter,
      position,
    })

    const locationParams: any[] = []
    let whereClause = 'WHERE 1=1'
    let paramIndex = 1

    // Apply location filters
    if (wardId) {
      locationParams.push(parseInt(wardId))
      whereClause += ` AND ps.ward_id = $${paramIndex++}`
    } else if (constituencyId) {
      locationParams.push(parseInt(constituencyId))
      whereClause += ` AND w.constituency_id = $${paramIndex++}`
    } else if (countyId) {
      locationParams.push(parseInt(countyId))
      whereClause += ` AND const.county_id = $${paramIndex++}`
    }

    // Submissions are attached to a candidate, so a station only counts as
    // reported for a race when a candidate of that position submitted there.
    const submissionPositionClause = position
      ? `AND s.candidate_id IN (
           SELECT id FROM candidates WHERE position = $${paramIndex}
         )`
      : ''
    const scopedParams = position
      ? [...locationParams, position]
      : locationParams

    // Apply status filter
    let havingClause = ''
    if (statusFilter === 'submitted') {
      havingClause = 'HAVING COUNT(s.id) > 0'
    } else if (statusFilter === 'not_submitted') {
      havingClause = 'HAVING COUNT(s.id) = 0'
    }

    const sql = `
      SELECT
        ps.id,
        ps.code,
        ps.name,
        ps.registered_voters,
        w.name as ward_name,
        const.name as constituency_name,
        co.name as county_name,
        COUNT(s.id) as submission_count,
        MAX(CASE WHEN s.status = 'verified' THEN 1 ELSE 0 END) as has_verified,
        MAX(CASE WHEN s.status = 'pending' THEN 1 ELSE 0 END) as has_pending,
        MAX(CASE WHEN s.status = 'flagged' THEN 1 ELSE 0 END) as has_flagged,
        MAX(CASE WHEN s.status = 'rejected' THEN 1 ELSE 0 END) as has_rejected,
        MAX(s.submitted_at) as last_submitted_at,
        SUM(CASE WHEN s.status = 'verified' THEN 1 ELSE 0 END) as verified_count
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      LEFT JOIN submissions s ON ps.id = s.polling_station_id
        AND s.superseded_by_submission_id IS NULL
        ${submissionPositionClause}
      ${whereClause}
      GROUP BY ps.id, ps.code, ps.name, ps.registered_voters, w.name, const.name, co.name
      ${havingClause}
      ORDER BY
        CASE
          WHEN COUNT(s.id) = 0 THEN 1  -- Not submitted first
          WHEN MAX(CASE WHEN s.status = 'flagged' THEN 1 ELSE 0 END) = 1 THEN 2  -- Flagged second
          WHEN MAX(CASE WHEN s.status = 'pending' THEN 1 ELSE 0 END) = 1 THEN 3  -- Pending third
          WHEN MAX(CASE WHEN s.status = 'verified' THEN 1 ELSE 0 END) = 1 THEN 4  -- Verified last
          ELSE 5
        END,
        ps.code ASC
    `

    const stations = await queryMany(sql, scopedParams)

    // Get total count of all stations in the area (without status filter)
    const totalCountSql = `
      SELECT COUNT(DISTINCT ps.id) as total
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      ${whereClause}
    `
    const totalCountResult = await queryOne<{ total: number }>(totalCountSql, locationParams)
    const totalStationsInArea = Number(totalCountResult?.total || 0)

    console.log('[Reporting Status] Location filters:', { countyId, constituencyId, wardId })
    console.log('[Reporting Status] Total stations in area:', totalStationsInArea)

    // Get count of stations with submissions (without status filter)
    const submittedCountSql = `
      SELECT COUNT(*) as total
      FROM (
        SELECT ps.id
        FROM polling_stations ps
        JOIN wards w ON ps.ward_id = w.id
        JOIN constituencies const ON w.constituency_id = const.id
        JOIN counties co ON const.county_id = co.id
        LEFT JOIN submissions s ON ps.id = s.polling_station_id
        AND s.superseded_by_submission_id IS NULL
        ${submissionPositionClause}
        ${whereClause}
        GROUP BY ps.id
        HAVING COUNT(s.id) > 0
      ) as stations_with_submissions
    `
    const submittedCountResult = await queryOne<{ total: number }>(submittedCountSql, scopedParams)
    const totalSubmitted = Number(submittedCountResult?.total || 0)

    console.log('[Reporting Status] Submitted stations:', totalSubmitted)
    console.log('[Reporting Status] Not submitted:', totalStationsInArea - totalSubmitted)

    // Get verified, pending, and flagged counts (from all stations, not filtered)
    const statusCountsSql = `
      SELECT
        COUNT(DISTINCT CASE WHEN s.status = 'verified' THEN ps.id END) as verified,
        COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN ps.id END) as pending,
        COUNT(DISTINCT CASE WHEN s.status = 'flagged' THEN ps.id END) as flagged
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      LEFT JOIN submissions s ON ps.id = s.polling_station_id
        AND s.superseded_by_submission_id IS NULL
        ${submissionPositionClause}
      ${whereClause}
    `
    const statusCountsResult = await queryOne<{ verified: number; pending: number; flagged: number }>(statusCountsSql, scopedParams)

    return NextResponse.json({
      success: true,
      stations,
      summary: {
        total_stations: totalStationsInArea,
        submitted_stations: totalSubmitted,
        verified_stations: Number(statusCountsResult?.verified || 0),
        pending_stations: Number(statusCountsResult?.pending || 0),
        flagged_stations: Number(statusCountsResult?.flagged || 0),
        not_submitted_stations: totalStationsInArea - totalSubmitted,
        reporting_percentage: totalStationsInArea > 0 ? (totalSubmitted / totalStationsInArea) * 100 : 0,
      },
    })
  } catch (error) {
    console.error('Error fetching polling stations reporting status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

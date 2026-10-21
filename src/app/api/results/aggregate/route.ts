import { NextRequest, NextResponse } from 'next/server'
import { queryMany, queryOne } from '@/lib/db'
import { getCandidateRestrictions } from '@/lib/candidate-restrictions'
import { buildCandidateBreakdown, computeReportingPercentage, computeTurnout } from '@/lib/aggregation'
import { getFileUrl } from '@/lib/storage'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '@/lib/jwtSecret'

const JWT_SECRET = getJwtSecret()

export const dynamic = 'force-dynamic'

// GET /api/results/aggregate?county_id=1&position=president
// GET /api/results/aggregate?level=ward&location_id=123&position=president (legacy)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    let position = searchParams.get('position') || 'president'

    // Check if user is authenticated and get their role
    let userRole = 'public'
    let userId: number | null = null
    let candidateRestrictions = null

    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7)
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }
        userRole = decoded.role
        userId = decoded.userId

        // Force volunteers (observers) to only view presidential results
        if (userRole === 'observer') {
          position = 'president'
        }

        // If user is a candidate, get their location restrictions
        if (userRole === 'candidate') {
          candidateRestrictions = await getCandidateRestrictions(userId)
        }
      } catch (error) {
        // Invalid token, treat as public access
        console.error('Invalid token:', error)
      }
    }

    // Support both new filtering approach and legacy level-based approach
    let countyId = searchParams.get('county_id')
    let constituencyId = searchParams.get('constituency_id')
    let wardId = searchParams.get('ward_id')
    let pollingStationId = searchParams.get('polling_station_id')

    // Legacy support
    const level = searchParams.get('level')
    const locationId = searchParams.get('location_id')

    // If using legacy approach, convert to new filtering
    let actualCountyId = countyId
    let actualConstituencyId = constituencyId
    let actualWardId = wardId
    let actualPollingStationId = pollingStationId

    if (level && locationId) {
      switch (level) {
        case 'county':
          actualCountyId = locationId
          break
        case 'constituency':
          actualConstituencyId = locationId
          break
        case 'ward':
          actualWardId = locationId
          break
        case 'station':
          actualPollingStationId = locationId
          break
      }
    }

    // Apply candidate location restrictions
    if (candidateRestrictions) {
      switch (candidateRestrictions.position) {
        case 'mca':
          // MCA can only see their ward
          actualWardId = candidateRestrictions.ward_id ? String(candidateRestrictions.ward_id) : null
          actualConstituencyId = null
          actualCountyId = null
          actualPollingStationId = null
          break

        case 'mp':
          // MP can only see their constituency
          actualConstituencyId = candidateRestrictions.constituency_id ? String(candidateRestrictions.constituency_id) : null
          actualCountyId = null
          actualWardId = null
          actualPollingStationId = null
          break

        case 'governor':
        case 'senator':
        case 'women_rep':
          // Governor/Senator/Women Rep can only see their county
          actualCountyId = candidateRestrictions.county_id ? String(candidateRestrictions.county_id) : null
          actualConstituencyId = null
          actualWardId = null
          actualPollingStationId = null
          break

        case 'president':
          // President can see all - no restrictions
          break
      }
    }

    // Build the location filter shared by every query below.
    // The location id is bound as a parameter; `paramIndex` is the placeholder
    // number to use, which differs per query depending on whether the query
    // also binds the position.
    const locationParam: number | null = (() => {
      if (actualPollingStationId) return parseInt(actualPollingStationId)
      if (actualWardId) return parseInt(actualWardId)
      if (actualConstituencyId) return parseInt(actualConstituencyId)
      if (actualCountyId) return parseInt(actualCountyId)
      return null
    })()

    const locationColumn = (() => {
      if (actualPollingStationId) return 'ps.id'
      if (actualWardId) return 'w.id'
      if (actualConstituencyId) return 'const.id'
      if (actualCountyId) return 'co.id'
      return null
    })()

    /**
     * Build the SQL fragment restricting the query to the selected location.
     */
    const buildLocationClause = (paramIndex: number): string => {
      if (!locationColumn || locationParam === null) return ''
      return `AND ${locationColumn} = $${paramIndex}`
    }

    /**
     * Build the parameter list for a query that binds the position as $1 and
     * optionally the location as $2. The location parameter is only included
     * when the query actually references it.
     */
    const buildScopedParams = (): any[] => {
      const params: any[] = [position]
      if (locationColumn && locationParam !== null) params.push(locationParam)
      return params
    }

    /**
     * Build the parameter list for a query that binds only the location.
     */
    const buildLocationParams = (): any[] => {
      if (locationColumn && locationParam !== null) return [locationParam]
      return []
    }

    // ------------------------------------------------------------------
    // Totals query.
    //
    // This aggregates over the selected result of every polling station in
    // the requested area. The selected result is either a verified agent
    // primary result or a candidate approved observer fallback, so a station
    // is never counted twice.
    //
    // It deliberately does NOT join candidate_votes: joining that table
    // fans out one result row into one row per candidate, which would
    // multiply the vote totals by the number of candidates.
    // ------------------------------------------------------------------
    const totalsSql = `
      WITH scoped_results AS (
        SELECT
          r.id AS result_id,
          r.registered_voters,
          r.total_votes_cast,
          r.valid_votes,
          r.rejected_votes,
          s.polling_station_id
        FROM selected_results sel
        JOIN submissions s ON s.id = sel.submission_id
        JOIN results r ON s.id = r.submission_id AND r.position = $1
        JOIN polling_stations ps ON s.polling_station_id = ps.id
        JOIN wards w ON ps.ward_id = w.id
        JOIN constituencies const ON w.constituency_id = const.id
        JOIN counties co ON const.county_id = co.id
        WHERE sel.position = $1
          AND s.status = 'verified'
          ${buildLocationClause(2)}
      )
      SELECT
        COUNT(DISTINCT polling_station_id) AS stations_reporting,
        COALESCE(SUM(total_votes_cast), 0) AS total_votes_cast,
        COALESCE(SUM(valid_votes), 0) AS total_valid_votes,
        COALESCE(SUM(rejected_votes), 0) AS total_rejected_votes,
        COALESCE(SUM(registered_voters), 0) AS reported_registered_voters
      FROM scoped_results
    `

    const totalsResult = await queryMany(totalsSql, buildScopedParams())
    const totalsRow = totalsResult[0] || {}

    const stationsReporting = parseInt(totalsRow.stations_reporting) || 0
    const totalVotesCast = parseInt(totalsRow.total_votes_cast) || 0
    const totalValidVotes = parseInt(totalsRow.total_valid_votes) || 0
    const totalRejectedVotes = parseInt(totalsRow.total_rejected_votes) || 0
    const reportedRegisteredVoters = parseInt(totalsRow.reported_registered_voters) || 0

    // How the selected results were produced: an agent primary result or a
    // candidate approved observer fallback. The two are never mixed up.
    const sourceSql = `
      SELECT
        COUNT(*) FILTER (WHERE sel.source = 'agent_primary') AS agent_primary,
        COUNT(*) FILTER (WHERE sel.source = 'observer_fallback') AS observer_fallback
      FROM selected_results sel
      JOIN submissions s ON s.id = sel.submission_id
      JOIN results r ON s.id = r.submission_id AND r.position = $1
      JOIN polling_stations ps ON s.polling_station_id = ps.id
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      WHERE sel.position = $1
        AND s.status = 'verified'
        ${buildLocationClause(2)}
    `
    const sourceResult = await queryMany(sourceSql, buildScopedParams())
    const sourceRow = sourceResult[0] || {}

    // Total counts of all stations in the area (without status filter)
    const totalStatsSql = `
      SELECT
        COUNT(DISTINCT ps.id) as total_stations,
        COALESCE(SUM(ps.registered_voters), 0) as total_registered_voters
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      WHERE 1=1 ${buildLocationClause(1)}
    `

    const totalStatsResult = await queryMany(totalStatsSql, buildLocationParams())
    const totalStationsInArea = parseInt(totalStatsResult[0]?.total_stations) || 0
    const totalRegisteredVotersInArea = parseInt(totalStatsResult[0]?.total_registered_voters) || 0

    // Get count of stations with ANY submissions (not just verified).
    // This matches the logic from the polling-stations/reporting-status API.
    const submittedCountSql = `
      SELECT COUNT(*) as total
      FROM (
        SELECT ps.id
        FROM polling_stations ps
        JOIN wards w ON ps.ward_id = w.id
        JOIN constituencies const ON w.constituency_id = const.id
        JOIN counties co ON const.county_id = co.id
        LEFT JOIN submissions s ON ps.id = s.polling_station_id
        WHERE 1=1 ${buildLocationClause(1)}
        GROUP BY ps.id
        HAVING COUNT(s.id) > 0
      ) as stations_with_submissions
    `

    const submittedStationsResult = await queryMany(submittedCountSql, buildLocationParams())
    const stationsWithSubmissions = parseInt(submittedStationsResult[0]?.total) || 0

    // ------------------------------------------------------------------
    // Candidate breakdown query.
    //
    // Each candidate_votes row belongs to exactly one result, so grouping by
    // candidate_name produces a correct per-candidate vote sum. The shared
    // vote totals are NOT read from these rows - they come from the totals
    // query above - so that every candidate is measured against the same
    // denominator.
    // ------------------------------------------------------------------
    const candidateSql = `
      WITH candidate_meta AS (
        SELECT DISTINCT ON (resolved_name, position)
          resolved_name,
          position,
          profile_photo,
          candidate_number,
          county_id,
          constituency_id,
          ward_id
        FROM (
          SELECT
            COALESCE(u.full_name, c.full_name) AS resolved_name,
            c.position,
            c.profile_photo,
            c.candidate_number,
            c.county_id,
            c.constituency_id,
            c.ward_id
          FROM candidates c
          LEFT JOIN users u ON c.user_id = u.id
          WHERE c.is_placeholder = false
        ) named_candidates
        WHERE resolved_name IS NOT NULL
        ORDER BY resolved_name, position, candidate_number NULLS LAST
      )
      SELECT
        cv.candidate_name,
        MAX(cv.party_name) as party_name,
        SUM(cv.votes) as total_votes,
        COUNT(DISTINCT s.polling_station_id) as stations_reporting,
        cm.profile_photo,
        cm.candidate_number,
        cm.position as candidate_position,
        cm.resolved_name as official_name,
        co_cand.name as candidate_county,
        const_cand.name as candidate_constituency,
        w_cand.name as candidate_ward
      FROM selected_results sel
      JOIN submissions s ON s.id = sel.submission_id
      JOIN results r ON s.id = r.submission_id AND r.position = $1
      JOIN candidate_votes cv ON r.id = cv.result_id
      JOIN polling_stations ps ON s.polling_station_id = ps.id
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      LEFT JOIN candidate_meta cm ON cm.resolved_name = cv.candidate_name AND cm.position = $1
      LEFT JOIN counties co_cand ON cm.county_id = co_cand.id
      LEFT JOIN constituencies const_cand ON cm.constituency_id = const_cand.id
      LEFT JOIN wards w_cand ON cm.ward_id = w_cand.id
      WHERE sel.position = $1
        AND s.status = 'verified'
        ${buildLocationClause(2)}
      GROUP BY cv.candidate_name, cm.profile_photo, cm.candidate_number, cm.position, cm.resolved_name, co_cand.name, const_cand.name, w_cand.name
    `

    const rawRows = await queryMany(candidateSql, buildScopedParams())

    const candidateRows = rawRows.map((row) => ({
      candidate_name: row.candidate_name,
      party_name: row.party_name || 'Independent',
      total_votes: parseInt(row.total_votes) || 0,
      stations_reporting: parseInt(row.stations_reporting) || 0,
      profile_photo: row.profile_photo ? getFileUrl(row.profile_photo) : null,
      candidate_number: row.candidate_number,
      position: row.candidate_position,
      official_name: row.official_name,
      electoral_area:
        row.candidate_ward || row.candidate_constituency || row.candidate_county || 'National',
    }))

    // Every candidate is scored against the same total valid votes so the
    // percentages are directly comparable.
    const results = buildCandidateBreakdown(candidateRows, {
      total_votes_cast: totalVotesCast,
      total_valid_votes: totalValidVotes,
      total_rejected_votes: totalRejectedVotes,
      reported_registered_voters: reportedRegisteredVoters,
      stations_reporting: stationsReporting,
    }).map((row) => ({
      ...row,
      polling_stations_count: row.stations_reporting,
    }))

    const reportingPercentage = computeReportingPercentage(
      stationsWithSubmissions,
      totalStationsInArea
    )
    const turnoutPercentage = computeTurnout(totalVotesCast, reportedRegisteredVoters)

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total_votes_cast: totalVotesCast,
        registered_voters: totalRegisteredVotersInArea, // Total from ALL stations
        rejected_votes: totalRejectedVotes,
        turnout_percentage: turnoutPercentage, // Average from reported stations
        total_stations: totalStationsInArea, // All stations in area
        stations_reported: stationsWithSubmissions, // Stations with ANY submission (matches polling stations view)
        reporting_percentage: reportingPercentage,
        // Where the counted results came from.
        agent_primary_results: parseInt(sourceRow.agent_primary) || 0,
        observer_fallback_results: parseInt(sourceRow.observer_fallback) || 0,
      },
    })
  } catch (error) {
    console.error('Error aggregating results:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

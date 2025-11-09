import { NextRequest, NextResponse } from 'next/server'
import { queryMany } from '@/lib/db'
import { AggregatedResult } from '@/types/database'
import { getCandidateRestrictions } from '@/lib/candidate-restrictions'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const dynamic = 'force-dynamic'

// GET /api/results/aggregate?county_id=1&position=president
// GET /api/results/aggregate?level=ward&location_id=123&position=president (legacy)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const position = searchParams.get('position') || 'president'

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

    // Build query with flexible filtering
    const whereConditionsForStats: string[] = []
    const whereConditionsForResults: string[] = []
    const locationParams: any[] = []

    if (actualPollingStationId) {
      whereConditionsForStats.push(`ps.id = $1`)
      whereConditionsForResults.push(`ps.id = $2`) // $1 is position in results query
      locationParams.push(parseInt(actualPollingStationId))
    } else if (actualWardId) {
      whereConditionsForStats.push(`w.id = $1`)
      whereConditionsForResults.push(`w.id = $2`) // $1 is position in results query
      locationParams.push(parseInt(actualWardId))
    } else if (actualConstituencyId) {
      whereConditionsForStats.push(`const.id = $1`)
      whereConditionsForResults.push(`const.id = $2`) // $1 is position in results query
      locationParams.push(parseInt(actualConstituencyId))
    } else if (actualCountyId) {
      whereConditionsForStats.push(`co.id = $1`)
      whereConditionsForResults.push(`co.id = $2`) // $1 is position in results query
      locationParams.push(parseInt(actualCountyId))
    }

    const whereClauseForStats = whereConditionsForStats.length > 0 ? `AND ${whereConditionsForStats.join(' AND ')}` : ''
    const whereClauseForResults = whereConditionsForResults.length > 0 ? `AND ${whereConditionsForResults.join(' AND ')}` : ''

    // For results query, we need both position and location params
    const resultsParams: any[] = [position, ...locationParams]

    // Debug logging
    console.log('=== AGGREGATE API DEBUG ===')
    console.log('Position:', position)
    console.log('actualConstituencyId:', actualConstituencyId, 'type:', typeof actualConstituencyId)
    console.log('locationParams:', locationParams, 'types:', locationParams.map(p => typeof p))
    console.log('resultsParams:', resultsParams, 'types:', resultsParams.map(p => typeof p))
    console.log('whereClauseForStats:', whereClauseForStats)
    console.log('whereClauseForResults:', whereClauseForResults)
    console.log('=========================')

    // First, get the total counts for all stations in the area
    const totalStatsSql = `
      SELECT
        COUNT(DISTINCT ps.id) as total_stations,
        SUM(ps.registered_voters) as total_registered_voters
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      WHERE 1=1 ${whereClauseForStats}
    `

    const totalStatsResult = await queryMany(totalStatsSql, locationParams) // Use location params only
    const totalStationsInArea = parseInt(totalStatsResult[0]?.total_stations) || 0
    const totalRegisteredVotersInArea = parseInt(totalStatsResult[0]?.total_registered_voters) || 0

    // Get candidate results from verified submissions
    const sql = `
      SELECT
        cv.candidate_name,
        cv.party_name,
        SUM(cv.votes) as total_votes,
        SUM(r.registered_voters) as reported_registered_voters,
        SUM(r.total_votes_cast) as total_votes_cast,
        SUM(r.valid_votes) as total_valid_votes,
        SUM(r.rejected_votes) as total_rejected_votes,
        COUNT(DISTINCT s.polling_station_id) as stations_reporting,
        c.profile_photo,
        c.candidate_number,
        c.position as candidate_position,
        c.full_name as official_name,
        co_cand.name as candidate_county,
        const_cand.name as candidate_constituency,
        w_cand.name as candidate_ward
      FROM submissions s
      JOIN results r ON s.id = r.submission_id AND r.position = $1
      JOIN candidate_votes cv ON r.id = cv.result_id
      JOIN polling_stations ps ON s.polling_station_id = ps.id
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      LEFT JOIN candidates c ON cv.candidate_name = c.full_name AND c.position = $1
      LEFT JOIN counties co_cand ON c.county_id = co_cand.id
      LEFT JOIN constituencies const_cand ON c.constituency_id = const_cand.id
      LEFT JOIN wards w_cand ON c.ward_id = w_cand.id
      WHERE s.status = 'verified' AND s.submission_type = 'primary' ${whereClauseForResults}
      GROUP BY cv.candidate_name, cv.party_name, c.profile_photo, c.candidate_number, c.position, c.full_name, co_cand.name, const_cand.name, w_cand.name
    `

    const rawResults = await queryMany(sql, resultsParams)

    // Process and structure results
    if (rawResults.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        summary: {
          total_votes_cast: 0,
          registered_voters: totalRegisteredVotersInArea,
          rejected_votes: 0,
          turnout_percentage: 0,
          total_stations: totalStationsInArea,
          stations_reported: 0,
          reporting_percentage: 0,
        },
      })
    }

    // Calculate totals from first row (aggregated values are same across all rows)
    const firstRow = rawResults[0]
    const reportedRegisteredVoters = parseInt(firstRow.reported_registered_voters) || 0
    const totalVotesCast = parseInt(firstRow.total_votes_cast) || 0
    const totalValidVotes = parseInt(firstRow.total_valid_votes) || 0
    const totalRejectedVotes = parseInt(firstRow.total_rejected_votes) || 0
    const stationsReporting = parseInt(firstRow.stations_reporting) || 0

    // Map candidate results
    const results = rawResults.map((row) => ({
      candidate_name: row.candidate_name,
      party_name: row.party_name || 'Independent',
      total_votes: parseInt(row.total_votes) || 0,
      percentage: totalValidVotes > 0 ? ((parseInt(row.total_votes) || 0) / totalValidVotes) * 100 : 0,
      polling_stations_count: stationsReporting,
      profile_photo: row.profile_photo,
      candidate_number: row.candidate_number,
      position: row.candidate_position,
      official_name: row.official_name,
      electoral_area: row.candidate_ward || row.candidate_constituency || row.candidate_county || 'National',
    })).sort((a, b) => b.total_votes - a.total_votes)

    // Calculate average turnout from reported stations only
    const averageTurnoutPercentage = reportedRegisteredVoters > 0 ? (totalVotesCast / reportedRegisteredVoters) * 100 : 0
    const reportingPercentage = totalStationsInArea > 0 ? (stationsReporting / totalStationsInArea) * 100 : 0

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total_votes_cast: totalVotesCast,
        registered_voters: totalRegisteredVotersInArea, // Total from ALL stations
        rejected_votes: totalRejectedVotes,
        turnout_percentage: averageTurnoutPercentage, // Average from reported stations
        total_stations: totalStationsInArea, // All stations in area
        stations_reported: stationsReporting,
        reporting_percentage: reportingPercentage,
      },
    })
  } catch (error) {
    console.error('Error aggregating results:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

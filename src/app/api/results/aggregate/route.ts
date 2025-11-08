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
          // Governor/Senator can only see their county
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
    const params: any[] = [position]
    const locationParams: any[] = []
    const whereConditions: string[] = []

    if (actualPollingStationId) {
      whereConditions.push(`ps.id = $${locationParams.length + 1}`)
      const id = parseInt(actualPollingStationId)
      locationParams.push(id)
      params.push(id)
    } else if (actualWardId) {
      whereConditions.push(`w.id = $${locationParams.length + 1}`)
      const id = parseInt(actualWardId)
      locationParams.push(id)
      params.push(id)
    } else if (actualConstituencyId) {
      whereConditions.push(`const.id = $${locationParams.length + 1}`)
      const id = parseInt(actualConstituencyId)
      locationParams.push(id)
      params.push(id)
    } else if (actualCountyId) {
      whereConditions.push(`co.id = $${locationParams.length + 1}`)
      const id = parseInt(actualCountyId)
      locationParams.push(id)
      params.push(id)
    }

    const whereClause = whereConditions.length > 0 ? `AND ${whereConditions.join(' AND ')}` : ''

    // Debug logging
    console.log('=== AGGREGATE API DEBUG ===')
    console.log('Position:', position)
    console.log('actualConstituencyId:', actualConstituencyId, 'type:', typeof actualConstituencyId)
    console.log('locationParams:', locationParams, 'types:', locationParams.map(p => typeof p))
    console.log('params:', params, 'types:', params.map(p => typeof p))
    console.log('whereClause:', whereClause)
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
      WHERE 1=1 ${whereClause}
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
        COUNT(DISTINCT s.polling_station_id) as stations_reporting
      FROM submissions s
      JOIN results r ON s.id = r.submission_id AND r.position = $1
      JOIN candidate_votes cv ON r.id = cv.result_id
      JOIN polling_stations ps ON s.polling_station_id = ps.id
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      WHERE s.status = 'verified' AND s.submission_type = 'primary' ${whereClause}
      GROUP BY cv.candidate_name, cv.party_name
    `

    const rawResults = await queryMany(sql, params)

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

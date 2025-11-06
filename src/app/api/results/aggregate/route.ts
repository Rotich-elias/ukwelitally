import { NextRequest, NextResponse } from 'next/server'
import { queryMany } from '@/lib/db'
import { AggregatedResult } from '@/types/database'

export const dynamic = 'force-dynamic'

// GET /api/results/aggregate?level=ward&location_id=123&position=president
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const level = searchParams.get('level') || 'constituency'
    const locationId = searchParams.get('location_id')
    const position = searchParams.get('position') || 'president'

    if (!locationId) {
      return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
    }

    // Build aggregation query based on level
    let sql = ''
    let groupByLocation = ''
    let locationJoin = ''
    let locationFilter = ''

    switch (level) {
      case 'station':
        sql = `
          SELECT
            ps.id as location_id,
            ps.name as location_name,
            'station' as level,
            r.position,
            cv.candidate_name,
            cv.party_name,
            SUM(cv.votes) as total_votes,
            SUM(r.registered_voters) as total_registered_voters,
            SUM(r.total_votes_cast) as total_votes_cast,
            SUM(r.valid_votes) as total_valid_votes,
            SUM(r.rejected_votes) as total_rejected_votes,
            COUNT(DISTINCT s.id) as stations_reporting,
            1 as total_stations
          FROM polling_stations ps
          LEFT JOIN submissions s ON ps.id = s.polling_station_id AND s.status = 'verified' AND s.submission_type = 'primary'
          LEFT JOIN results r ON s.id = r.submission_id AND r.position = $2
          LEFT JOIN candidate_votes cv ON r.id = cv.result_id
          WHERE ps.id = $1
          GROUP BY ps.id, ps.name, r.position, cv.candidate_name, cv.party_name
        `
        break

      case 'ward':
        sql = `
          SELECT
            w.id as location_id,
            w.name as location_name,
            'ward' as level,
            r.position,
            cv.candidate_name,
            cv.party_name,
            SUM(cv.votes) as total_votes,
            SUM(r.registered_voters) as total_registered_voters,
            SUM(r.total_votes_cast) as total_votes_cast,
            SUM(r.valid_votes) as total_valid_votes,
            SUM(r.rejected_votes) as total_rejected_votes,
            COUNT(DISTINCT s.id) as stations_reporting,
            COUNT(DISTINCT ps.id) as total_stations
          FROM wards w
          LEFT JOIN polling_stations ps ON w.id = ps.ward_id
          LEFT JOIN submissions s ON ps.id = s.polling_station_id AND s.status = 'verified' AND s.submission_type = 'primary'
          LEFT JOIN results r ON s.id = r.submission_id AND r.position = $2
          LEFT JOIN candidate_votes cv ON r.id = cv.result_id
          WHERE w.id = $1
          GROUP BY w.id, w.name, r.position, cv.candidate_name, cv.party_name
        `
        break

      case 'constituency':
        sql = `
          SELECT
            c.id as location_id,
            c.name as location_name,
            'constituency' as level,
            r.position,
            cv.candidate_name,
            cv.party_name,
            SUM(cv.votes) as total_votes,
            SUM(r.registered_voters) as total_registered_voters,
            SUM(r.total_votes_cast) as total_votes_cast,
            SUM(r.valid_votes) as total_valid_votes,
            SUM(r.rejected_votes) as total_rejected_votes,
            COUNT(DISTINCT s.id) as stations_reporting,
            COUNT(DISTINCT ps.id) as total_stations
          FROM constituencies c
          LEFT JOIN polling_stations ps ON c.id = ps.constituency_id
          LEFT JOIN submissions s ON ps.id = s.polling_station_id AND s.status = 'verified' AND s.submission_type = 'primary'
          LEFT JOIN results r ON s.id = r.submission_id AND r.position = $2
          LEFT JOIN candidate_votes cv ON r.id = cv.result_id
          WHERE c.id = $1
          GROUP BY c.id, c.name, r.position, cv.candidate_name, cv.party_name
        `
        break

      case 'county':
        sql = `
          SELECT
            co.id as location_id,
            co.name as location_name,
            'county' as level,
            r.position,
            cv.candidate_name,
            cv.party_name,
            SUM(cv.votes) as total_votes,
            SUM(r.registered_voters) as total_registered_voters,
            SUM(r.total_votes_cast) as total_votes_cast,
            SUM(r.valid_votes) as total_valid_votes,
            SUM(r.rejected_votes) as total_rejected_votes,
            COUNT(DISTINCT s.id) as stations_reporting,
            COUNT(DISTINCT ps.id) as total_stations
          FROM counties co
          LEFT JOIN polling_stations ps ON co.id = ps.county_id
          LEFT JOIN submissions s ON ps.id = s.polling_station_id AND s.status = 'verified' AND s.submission_type = 'primary'
          LEFT JOIN results r ON s.id = r.submission_id AND r.position = $2
          LEFT JOIN candidate_votes cv ON r.id = cv.result_id
          WHERE co.id = $1
          GROUP BY co.id, co.name, r.position, cv.candidate_name, cv.party_name
        `
        break

      default:
        return NextResponse.json({ error: 'Invalid level' }, { status: 400 })
    }

    const rawResults = await queryMany(sql, [locationId, position])

    // Process and structure results
    if (rawResults.length === 0) {
      return NextResponse.json({
        level,
        location_id: locationId,
        location_name: 'Unknown',
        position,
        candidate_votes: [],
        total_registered_voters: 0,
        total_votes_cast: 0,
        total_valid_votes: 0,
        total_rejected_votes: 0,
        turnout_percentage: 0,
        stations_reporting: 0,
        total_stations: 0,
      })
    }

    const firstRow = rawResults[0]
    const locationName = firstRow.location_name
    const totalRegisteredVoters = parseInt(firstRow.total_registered_voters) || 0
    const totalVotesCast = parseInt(firstRow.total_votes_cast) || 0
    const totalValidVotes = parseInt(firstRow.total_valid_votes) || 0
    const totalRejectedVotes = parseInt(firstRow.total_rejected_votes) || 0
    const stationsReporting = parseInt(firstRow.stations_reporting) || 0
    const totalStations = parseInt(firstRow.total_stations) || 0

    // Aggregate candidate votes
    const candidateVotesMap = new Map<string, { candidate_name: string; party_name: string | null; total_votes: number }>()

    rawResults.forEach((row) => {
      if (row.candidate_name) {
        const key = row.candidate_name
        const existing = candidateVotesMap.get(key)
        const votes = parseInt(row.total_votes) || 0

        if (existing) {
          existing.total_votes += votes
        } else {
          candidateVotesMap.set(key, {
            candidate_name: row.candidate_name,
            party_name: row.party_name,
            total_votes: votes,
          })
        }
      }
    })

    const candidateVotes = Array.from(candidateVotesMap.values())
      .map((cv) => ({
        ...cv,
        percentage: totalValidVotes > 0 ? (cv.total_votes / totalValidVotes) * 100 : 0,
      }))
      .sort((a, b) => b.total_votes - a.total_votes)

    const turnoutPercentage =
      totalRegisteredVoters > 0 ? (totalVotesCast / totalRegisteredVoters) * 100 : 0

    const aggregatedResult: AggregatedResult = {
      position: position as any,
      level: level as any,
      location_id: parseInt(locationId),
      location_name: locationName,
      candidate_votes: candidateVotes,
      total_registered_voters: totalRegisteredVoters,
      total_votes_cast: totalVotesCast,
      total_valid_votes: totalValidVotes,
      total_rejected_votes: totalRejectedVotes,
      turnout_percentage: turnoutPercentage,
      stations_reporting: stationsReporting,
      total_stations: totalStations,
    }

    return NextResponse.json(aggregatedResult)
  } catch (error) {
    console.error('Error aggregating results:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

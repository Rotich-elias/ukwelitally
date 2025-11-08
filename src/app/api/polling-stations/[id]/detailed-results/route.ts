import { NextRequest, NextResponse } from 'next/server'
import { queryMany, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'

// GET /api/polling-stations/[id]/detailed-results - Get detailed results for a specific polling station
async function handleGet(req: NextRequest, context?: any) {
  try {
    const user = (req as any).user

    // Block agents from viewing this data
    if (user.role === 'agent') {
      return NextResponse.json({ error: 'Unauthorized. Agents cannot view detailed polling station results.' }, { status: 403 })
    }

    // Extract polling station ID
    let pollingStationId: number

    if (context && context.params) {
      // Next.js 15 - params might be a Promise
      const params = await Promise.resolve(context.params)
      pollingStationId = parseInt(params.id)
    } else {
      // Fallback - try to extract from URL
      const url = new URL(req.url)
      const pathParts = url.pathname.split('/')
      const idIndex = pathParts.indexOf('polling-stations') + 1
      pollingStationId = parseInt(pathParts[idIndex])
    }

    // Validate polling station ID
    if (isNaN(pollingStationId) || pollingStationId <= 0) {
      return NextResponse.json({ error: 'Invalid polling station ID' }, { status: 400 })
    }

    console.log('[Detailed Results] Fetching polling station:', pollingStationId)

    // Get polling station info
    const pollingStation = await queryOne(
      `SELECT
        ps.*,
        w.name as ward_name,
        const.name as constituency_name,
        co.name as county_name
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      WHERE ps.id = $1`,
      [pollingStationId]
    )

    if (!pollingStation) {
      return NextResponse.json({ error: 'Polling station not found' }, { status: 404 })
    }

    console.log('[Detailed Results] Polling station found:', pollingStation.name)

    // Get all submissions for this polling station
    console.log('[Detailed Results] Fetching submissions...')
    const submissions = await queryMany(
      `SELECT
        s.*,
        u.full_name as submitter_name,
        u.email as submitter_email,
        u.phone as submitter_phone,
        c.full_name as candidate_name,
        c.party_name as candidate_party,
        c.position as candidate_position,
        r.id as result_id,
        r.registered_voters,
        r.total_votes_cast,
        r.valid_votes,
        r.rejected_votes,
        r.validation_errors,
        (
          SELECT cv.votes
          FROM candidate_votes cv
          WHERE cv.result_id = r.id
          AND cv.candidate_name = c.full_name
          LIMIT 1
        ) as votes_received,
        COALESCE(
          json_agg(
            json_build_object(
              'id', sp.id,
              'photo_type', sp.photo_type,
              'file_path', '/api/uploads' || sp.file_path
            )
          ) FILTER (WHERE sp.id IS NOT NULL),
          '[]'
        ) as photos,
        (
          SELECT json_agg(
            json_build_object(
              'id', review_data.id,
              'reviewer_name', review_data.reviewer_name,
              'action', review_data.action,
              'review_notes', review_data.review_notes,
              'created_at', review_data.created_at
            ) ORDER BY review_data.created_at DESC
          )
          FROM (
            SELECT
              sr.id,
              ru.full_name as reviewer_name,
              sr.action,
              sr.review_notes,
              sr.created_at
            FROM submission_reviews sr
            JOIN users ru ON sr.reviewer_id = ru.id
            WHERE sr.submission_id = s.id
          ) as review_data
        ) as reviews
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN candidates c ON s.candidate_id = c.id
      LEFT JOIN results r ON s.id = r.submission_id
      LEFT JOIN submission_photos sp ON s.id = sp.submission_id
      WHERE s.polling_station_id = $1
      GROUP BY s.id, u.id, c.id, r.id
      ORDER BY
        CASE s.status
          WHEN 'verified' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'flagged' THEN 3
          WHEN 'rejected' THEN 4
          ELSE 5
        END,
        s.submitted_at DESC`,
      [pollingStationId]
    )

    console.log('[Detailed Results] Submissions fetched:', submissions.length)

    // Calculate aggregate results from verified submissions
    const verifiedSubmissions = submissions.filter((s: any) => s.status === 'verified')
    console.log('[Detailed Results] Verified submissions:', verifiedSubmissions.length)

    let aggregateResults = null
    if (verifiedSubmissions.length > 0) {
      // Get all candidate votes from verified submissions
      const resultIds = verifiedSubmissions.map((s: any) => s.id).join(',')

      const candidateVotesSql = `
        SELECT
          cv.candidate_name,
          cv.party_name,
          SUM(cv.votes) as total_votes
        FROM candidate_votes cv
        JOIN results r ON cv.result_id = r.id
        WHERE r.submission_id IN (${resultIds})
        GROUP BY cv.candidate_name, cv.party_name
        ORDER BY total_votes DESC
      `

      const candidateVotesData = await queryMany<{ candidate_name: string; party_name: string; total_votes: number }>(candidateVotesSql, [])

      const totalVotesCast = verifiedSubmissions.reduce((sum: number, sub: any) => sum + (sub.total_votes_cast || 0), 0)
      const rejectedVotes = verifiedSubmissions.reduce((sum: number, sub: any) => sum + (sub.rejected_votes || 0), 0)

      aggregateResults = {
        total_votes_cast: totalVotesCast,
        rejected_votes: rejectedVotes,
        candidates: candidateVotesData.map((cv) => ({
          candidate_name: cv.candidate_name,
          party_name: cv.party_name,
          total_votes: Number(cv.total_votes),
          percentage: totalVotesCast > 0 ? (Number(cv.total_votes) / totalVotesCast) * 100 : 0,
        })),
      }
    }

    return NextResponse.json({
      success: true,
      polling_station: pollingStation,
      submissions,
      aggregate_results: aggregateResults,
      submission_count: submissions.length,
      verified_count: verifiedSubmissions.length,
    })
  } catch (error) {
    console.error('[Detailed Results] Error fetching detailed polling station results:', error)
    console.error('[Detailed Results] Stack trace:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

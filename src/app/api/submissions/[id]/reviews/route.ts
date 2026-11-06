import { NextRequest, NextResponse } from 'next/server'
import { queryMany, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'

// GET /api/submissions/[id]/reviews - Get reviews for a submission
async function handleGet(
  req: NextRequest,
  context?: any
) {
  try {
    const user = (req as any).user

    // Extract params
    let submissionId: number

    if (context && context.params) {
      const params = await Promise.resolve(context.params)
      submissionId = parseInt(params.id)
    } else {
      const url = new URL(req.url)
      const pathParts = url.pathname.split('/')
      const idIndex = pathParts.indexOf('submissions') + 1
      submissionId = parseInt(pathParts[idIndex])
    }

    if (isNaN(submissionId) || submissionId <= 0) {
      return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 })
    }

    const submission = await queryOne<{
      id: number
      user_id: number
      candidate_id: number | null
      scope_candidate_id: number | null
      polling_station_id: number
      ward_id: number | null
      constituency_id: number | null
      county_id: number | null
    }>(
      `SELECT s.id, s.user_id, s.candidate_id, s.scope_candidate_id,
              s.polling_station_id, ps.ward_id, ps.constituency_id, ps.county_id
         FROM submissions s
         JOIN polling_stations ps ON ps.id = s.polling_station_id
        WHERE s.id = $1`,
      [submissionId]
    )

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // The review history contains reviewer identities and notes. It is not
    // public: an administrator sees every review, a candidate only sees the
    // submissions in the race and area they own, and an agent or observer
    // only sees the history of a submission they submitted themselves.
    let allowed = user.role === 'admin'

    if (!allowed && user.role === 'candidate') {
      const candidate = await queryOne<{
        id: number
        position: string
        county_id: number | null
        constituency_id: number | null
        ward_id: number | null
      }>(
        `SELECT id, position, county_id, constituency_id, ward_id
           FROM candidates
          WHERE user_id = $1 AND access_status = 'active'`,
        [user.userId]
      )

      if (candidate) {
        allowed =
          submission.candidate_id === candidate.id ||
          submission.scope_candidate_id === candidate.id ||
          candidate.position === 'president' ||
          (['governor', 'senator', 'women_rep'].includes(candidate.position) &&
            submission.county_id === candidate.county_id) ||
          (candidate.position === 'mp' &&
            submission.constituency_id === candidate.constituency_id) ||
          (candidate.position === 'mca' && submission.ward_id === candidate.ward_id)
      }
    }

    if (!allowed && (user.role === 'agent' || user.role === 'observer')) {
      allowed = submission.user_id === user.userId
    }

    if (!allowed) {
      return NextResponse.json(
        { error: 'You do not have access to this submission.' },
        { status: 403 }
      )
    }

    // Fetch reviews
    const reviews = await queryMany(
      `SELECT
        sr.*,
        u.full_name as reviewer_name
       FROM submission_reviews sr
       JOIN users u ON sr.reviewer_id = u.id
       WHERE sr.submission_id = $1
       ORDER BY sr.created_at DESC`,
      [submissionId]
    )

    return NextResponse.json({
      success: true,
      reviews,
    })
  } catch (error) {
    console.error('Error fetching reviews:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

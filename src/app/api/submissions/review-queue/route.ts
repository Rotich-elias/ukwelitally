import { NextRequest, NextResponse } from 'next/server'
import { queryMany, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { getEvidenceUrl } from '@/lib/storage'
import { candidateCanSeeSubmissionSql, redactSubmitterContact } from '@/lib/submissionAccess'

// The queue is sorted by urgency; a page this size covers any realistic
// backlog without letting one request scan every submission in the country.
const MAX_QUEUE_ROWS = 500

// GET /api/submissions/review-queue - Get submissions needing admin review
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user

    // Only admins and candidates (system users) can access review queue
    if (user.role !== 'admin' && user.role !== 'candidate') {
      return NextResponse.json({ error: 'Unauthorized. Only admins and candidates can review submissions.' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') || 'all' // all, pending, flagged, anomalies

    let statusClause = ''
    const params: any[] = []

    switch (filter) {
      case 'pending':
        statusClause = "s.status = 'pending'"
        break
      case 'flagged':
        statusClause = "s.status = 'flagged'"
        break
      case 'anomalies':
        statusClause = "s.has_discrepancy = TRUE"
        break
      case 'all':
        statusClause = "(s.status IN ('pending', 'flagged') OR s.has_discrepancy = TRUE)"
        break
      default:
        statusClause = "(s.status IN ('pending', 'flagged') OR s.has_discrepancy = TRUE)"
    }

    // A candidate sees their own team's submissions and the observer
    // submissions of their race and area, never a rival team's. An admin sees
    // everything.
    let viewerCandidateId: number | null = null
    let scopeClause = ''
    if (user.role === 'candidate') {
      const own = await queryOne<{ id: number }>(
        `SELECT id FROM candidates WHERE user_id = $1 AND access_status = 'active'`,
        [user.userId]
      )
      if (!own) {
        return NextResponse.json({ success: true, submissions: [], count: 0 })
      }
      viewerCandidateId = own.id
      params.push(own.id)
      scopeClause = ` AND EXISTS (
        SELECT 1 FROM candidates c2
        WHERE c2.id = $${params.length}
          AND ${candidateCanSeeSubmissionSql('s', 'ps', 'c2')}
      )`
    }

    const whereClause = `WHERE ${statusClause}${scopeClause}`

    const sql = `
      SELECT
        s.*,
        u.full_name as submitter_name,
        u.email as submitter_email,
        u.phone as submitter_phone,
        ps.name as polling_station_name,
        ps.code as polling_station_code,
        w.name as ward_name,
        const.name as constituency_name,
        co.name as county_name,
        c.full_name as candidate_name,
        c.party_name as candidate_party,
        COUNT(sp.id) as photo_count,
        r.registered_voters,
        r.total_votes_cast,
        r.valid_votes,
        r.rejected_votes,
        r.validation_errors,
        COALESCE(
          json_agg(
            json_build_object(
              'id', sp.id,
              'photo_type', sp.photo_type,
              'file_path', sp.file_path
            )
          ) FILTER (WHERE sp.id IS NOT NULL),
          '[]'
        ) as photos
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN polling_stations ps ON s.polling_station_id = ps.id
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies const ON w.constituency_id = const.id
      JOIN counties co ON const.county_id = co.id
      LEFT JOIN candidates c ON s.candidate_id = c.id
      LEFT JOIN submission_photos sp ON s.id = sp.submission_id
      LEFT JOIN results r ON s.id = r.submission_id
      ${whereClause}
      GROUP BY s.id, u.id, ps.id, w.id, const.id, co.id, c.id, r.id
      ORDER BY
        CASE
          WHEN s.has_discrepancy THEN 1
          WHEN s.status = 'flagged' THEN 2
          WHEN s.status = 'pending' THEN 3
          ELSE 4
        END,
        s.submitted_at DESC
      LIMIT ${MAX_QUEUE_ROWS}
    `

    const submissions = await queryMany(sql, params)

    // The evidence of a submission is private, so it is served through the
    // authorized evidence route instead of the public upload route.
    const withPhotoUrls = submissions.map((submission: any) => ({
      ...redactSubmitterContact(submission, { role: user.role, candidateId: viewerCandidateId }),
      photos: (submission.photos || []).map((photo: any) => ({
        ...photo,
        file_path: getEvidenceUrl(photo.id),
      })),
    }))

    return NextResponse.json({
      success: true,
      submissions: withPhotoUrls,
      count: withPhotoUrls.length,
    })
  } catch (error) {
    console.error('Error fetching review queue:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

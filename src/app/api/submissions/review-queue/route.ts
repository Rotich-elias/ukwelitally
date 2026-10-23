import { NextRequest, NextResponse } from 'next/server'
import { queryMany } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { getEvidenceUrl } from '@/lib/storage'

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

    // A candidate only sees submissions from their own team or inside their
    // electoral scope. An admin sees everything.
    let scopeClause = ''
    if (user.role === 'candidate') {
      params.push(user.userId)
      scopeClause = ` AND EXISTS (
        SELECT 1 FROM candidates c2
        WHERE c2.user_id = $${params.length}
          AND (
            s.candidate_id = c2.id
            OR s.scope_candidate_id = c2.id
            OR c2.position = 'president'
            OR (c2.position IN ('governor','senator','women_rep') AND ps.county_id = c2.county_id)
            OR (c2.position = 'mp' AND const.id = c2.constituency_id)
            OR (c2.position = 'mca' AND w.id = c2.ward_id)
          )
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
    `

    const submissions = await queryMany(sql, params)

    // The evidence of a submission is private, so it is served through the
    // authorized evidence route instead of the public upload route.
    const withPhotoUrls = submissions.map((submission: any) => ({
      ...submission,
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
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

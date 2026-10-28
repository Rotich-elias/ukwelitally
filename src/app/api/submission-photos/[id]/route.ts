import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getStorage, contentTypeFromKey } from '@/lib/storage'
import { verifyToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/submission-photos/:id - Serve a piece of submission evidence.
 *
 * Evidence is private. It is served here instead of the public upload route
 * so that a leaked id does not expose it: the requester has to be the
 * submitter, the candidate whose team owns the submission, or an administrator.
 *
 * The request may carry the bearer token or the session cookie. A browser
 * <img> request cannot carry a bearer token, but it does send the session
 * cookie, so the images on the dashboards work.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const photoId = parseInt(params?.id)
    if (!photoId || photoId <= 0) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 })
    }

    const user = await authenticate(req)
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const photo = await queryOne<{
      id: number
      file_path: string
      submission_id: number
      submitted_by: number
      candidate_id: number
      candidate_user_id: number | null
      scope_candidate_id: number | null
      scope_candidate_user_id: number | null
    }>(
      `SELECT sp.id, sp.file_path, sp.submission_id,
              s.user_id as submitted_by,
              s.candidate_id,
              s.scope_candidate_id,
              c.user_id as candidate_user_id,
              sc.user_id as scope_candidate_user_id
         FROM submission_photos sp
         JOIN submissions s ON s.id = sp.submission_id
         LEFT JOIN candidates c ON c.id = s.candidate_id
         LEFT JOIN candidates sc ON sc.id = s.scope_candidate_id
        WHERE sp.id = $1`,
      [photoId]
    )

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // The submitter, the candidate of the team and administrators may read
    // the evidence.
    let allowed =
      user.role === 'admin' ||
      photo.submitted_by === user.userId ||
      (photo.candidate_user_id !== null && photo.candidate_user_id === user.userId) ||
      (photo.scope_candidate_user_id !== null &&
        photo.scope_candidate_user_id === user.userId)

    // A candidate can review submissions inside their electoral scope, so they
    // must be able to see the evidence of those submissions too. This is the
    // same scope the review queue and the review action enforce. Without it
    // the queue renders a submission whose images are all 403.
    if (!allowed && user.role === 'candidate') {
      const scope = await queryOne<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM submissions s
           JOIN polling_stations ps ON ps.id = s.polling_station_id
           JOIN wards w ON w.id = ps.ward_id
           JOIN constituencies con ON con.id = w.constituency_id
           JOIN candidates c ON c.user_id = $1
           WHERE s.id = $2
             AND (
               s.candidate_id = c.id
               OR s.scope_candidate_id = c.id
               OR c.position = 'president'
               OR (c.position IN ('governor','senator','women_rep') AND ps.county_id = c.county_id)
               OR (c.position = 'mp' AND con.id = c.constituency_id)
               OR (c.position = 'mca' AND w.id = c.ward_id)
             )
         ) AS allowed`,
        [user.userId, photo.submission_id]
      )
      allowed = !!scope?.allowed
    }

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const key = (photo.file_path || '').replace(/^\/+/, '')
    if (!key) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    const storage = getStorage()
    const file = await storage.get(key)

    if (!file) {
      // The reference is in the database but the file is not in storage. The
      // record is kept, and the caller shows a placeholder.
      return NextResponse.json(
        { error: 'The stored file is no longer available' },
        { status: 404 }
      )
    }

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.contentType || contentTypeFromKey(key),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error serving submission evidence:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Resolve the user from the bearer token or the session cookie.
 */
async function authenticate(
  req: NextRequest
): Promise<{ userId: number; role: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.substring(7))
    if (payload) return { userId: payload.userId, role: payload.role }
  }

  const cookie = req.cookies.get('ukwelitally_session')?.value
  if (cookie) {
    const payload = verifyToken(cookie)
    if (payload) return { userId: payload.userId, role: payload.role }
  }

  return null
}

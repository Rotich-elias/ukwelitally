import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getStorage, contentTypeFromKey } from '@/lib/storage'
import { authenticateRequest } from '@/lib/authenticate'
import { candidateCanSeeSubmissionSql } from '@/lib/submissionAccess'

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const photoId = parseInt(id)
    if (!photoId || photoId <= 0) {
      return NextResponse.json({ error: 'Invalid photo id' }, { status: 400 })
    }

    // Evidence images are rendered by <img> tags, which cannot send an
    // Authorization header, so this read-only endpoint also accepts the
    // httpOnly session cookie.
    const user = await authenticateRequest(req, { allowCookie: true })
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

    // A candidate also sees the evidence of the submissions the review queue
    // shows them: observer submissions of their race and area. A rival team's
    // evidence stays private. This is the same rule the queue applies.
    if (!allowed && user.role === 'candidate') {
      const scope = await queryOne<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM submissions s
           JOIN polling_stations ps ON ps.id = s.polling_station_id
           JOIN candidates c ON c.user_id = $1 AND c.access_status = 'active'
           WHERE s.id = $2
             AND ${candidateCanSeeSubmissionSql('s', 'ps', 'c')}
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



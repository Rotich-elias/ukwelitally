import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { extractTokenFromHeader, verifyToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const SESSION_COOKIE = 'ukwelitally_session'

// POST /api/auth/logout - End the session.
//
// Clearing the cookie alone left the token valid for its full 7 days: it is
// also kept in the browser's local storage and sent as a bearer token. The
// account's token version is therefore raised, which revokes every token
// issued to it (authenticateRequest compares the version on each request).
// This signs the account out on all of its devices.
export async function POST(request: NextRequest) {
  const token =
    extractTokenFromHeader(request.headers.get('authorization')) ||
    request.cookies.get(SESSION_COOKIE)?.value ||
    null

  const decoded = token ? verifyToken(token) : null
  if (decoded) {
    try {
      // Only revoke the version the token carries, so replaying an old,
      // already revoked token cannot sign the user out again.
      await query(
        `UPDATE users
            SET token_version = token_version + 1
          WHERE id = $1 AND token_version = $2`,
        [decoded.userId, decoded.tokenVersion ?? 1]
      )
    } catch (error) {
      // Logging out must still clear the cookie if the database is down.
      console.error('Could not revoke tokens on logout:', error)
    }
  }

  const response = NextResponse.json({ message: 'Logged out successfully' })

  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}

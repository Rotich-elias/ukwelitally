import { NextRequest } from 'next/server'
import { queryOne } from '@/lib/db'
import { extractTokenFromHeader, verifyToken } from '@/lib/auth'
import type { UserRole } from '@/types/database'

export interface AuthenticatedUser {
  userId: number
  email: string
  role: UserRole
  tokenVersion: number
}

/**
 * Authenticate an API request and re-check the account against the database.
 *
 * A JWT signature only proves that the token was issued by this application.
 * It does not prove that the account is still active, still has the same
 * role, or has not had its password reset. Those checks happen here on every
 * authenticated request, using the token_version column added in migration
 * 026. This makes deactivation and password resets take effect immediately
 * instead of waiting up to seven days for the token to expire.
 *
 * API routes require the bearer token. The httpOnly session cookie is used by
 * the page middleware and by read-only evidence images; accepting it here
 * would turn every state-changing API into a cookie-authenticated request and
 * expand the CSRF surface.
 */
export async function authenticateRequest(
  request: NextRequest,
  options: { allowCookie?: boolean } = {}
): Promise<AuthenticatedUser | null> {
  let token = extractTokenFromHeader(request.headers.get('authorization'))

  // Read-only endpoints that are requested by an <img> tag cannot send an
  // Authorization header. They may opt in to the httpOnly session cookie.
  if (!token && options.allowCookie) {
    token = request.cookies.get('ukwelitally_session')?.value ?? null
  }

  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  try {
    const user = await queryOne<{
      id: number
      email: string
      role: UserRole
      active: boolean
      token_version: number | null
    }>(
      `SELECT id, email, role, active, token_version
         FROM users
        WHERE id = $1`,
      [payload.userId]
    )

    if (!user || !user.active) return null

    // The database is the source of truth for the role. A token issued before
    // a demotion must not keep the old privileges.
    if (user.role !== payload.role) return null

    const currentVersion = user.token_version ?? 1
    const tokenVersion = payload.tokenVersion ?? 1
    if (tokenVersion !== currentVersion) return null

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: currentVersion,
    }
  } catch (error) {
    console.error('Authentication database check failed:', error)
    return null
  }
}

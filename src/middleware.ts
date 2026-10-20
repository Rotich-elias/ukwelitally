import { NextResponse, NextRequest } from 'next/server'
import { verifyJwtEdge } from '@/lib/jwt-edge'

/**
 * Route protection for dashboard pages.
 *
 * The dashboards are client components that read the token from localStorage,
 * so without this middleware an unauthenticated visitor could download the
 * dashboard HTML and JS bundles. The middleware checks the session cookie and
 * redirects to /login when it is missing, invalid, or the wrong role.
 *
 * API routes keep their own authorization checks - this is defense in depth
 * for page routes, not a replacement for them.
 */

const SESSION_COOKIE = 'ukwelitally_session'

/**
 * Role requirements for dashboard route prefixes, most specific first.
 * A role of null means "any authenticated user".
 */
const PROTECTED_ROUTES: Array<{ prefix: string; roles: string[] | null }> = [
  { prefix: '/dashboard/admin/review-submissions', roles: ['admin', 'candidate'] },
  { prefix: '/dashboard/admin/volunteer-management', roles: ['admin'] },
  { prefix: '/dashboard/admin', roles: ['admin'] },
  { prefix: '/dashboard/candidate/manage-agents', roles: ['candidate'] },
  { prefix: '/dashboard/candidate', roles: ['candidate'] },
  { prefix: '/dashboard/agent', roles: ['agent'] },
  { prefix: '/dashboard/observer', roles: ['observer'] },
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const rule = PROTECTED_ROUTES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/')
  )
  if (!rule) return NextResponse.next()

  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const secret = process.env.JWT_SECRET
  if (!secret) {
    // Without a secret the token cannot be validated, so fail closed.
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const payload = await verifyJwtEdge(token, secret)
  if (!payload) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete(SESSION_COOKIE)
    return response
  }

  if (rule.roles && !rule.roles.includes(payload.role)) {
    // Authenticated but not permitted for this dashboard. Send the user to
    // their own dashboard rather than a dead-end page.
    const home = new URL(`/dashboard/${payload.role}`, req.url)
    return NextResponse.redirect(home)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}

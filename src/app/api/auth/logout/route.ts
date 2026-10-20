import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/auth/logout - Clear the session cookie
export async function POST() {
  const response = NextResponse.json({ message: 'Logged out successfully' })

  response.cookies.set('ukwelitally_session', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}

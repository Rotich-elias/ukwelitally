import { NextRequest, NextResponse } from 'next/server'
import { queryOne, query } from '@/lib/db'
import { verifyPassword, generateToken, sanitizeUser } from '@/lib/auth'
import { loginSchema } from '@/lib/validation'
import { checkRateLimit, getClientIp, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'
import { User } from '@/types/database'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Throttle repeated login attempts per client to slow brute force attacks.
    const ip = getClientIp(request)
    const limit = checkRateLimit(
      rateLimitKey('login', ip),
      RATE_LIMITS.login.limit,
      RATE_LIMITS.login.windowMs
    )

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many login attempts. Please try again later.',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfterSeconds) },
        }
      )
    }

    // Parse request body
    const body = await request.json()

    // Validate input
    const validationResult = loginSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.errors,
        },
        { status: 400 }
      )
    }

    const { email, password } = validationResult.data

    // Find user by email
    const user = await queryOne<User>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    )

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Check if user is active
    if (!user.active) {
      return NextResponse.json(
        { error: 'Account is deactivated. Please contact support.' },
        { status: 403 }
      )
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash)
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        'user_login',
        'user',
        user.id,
        request.headers.get('x-forwarded-for') || 'unknown',
      ]
    )

    const response = NextResponse.json({
      message: 'Login successful',
      user: sanitizeUser(user),
      token,
    })

    // Also set an httpOnly session cookie so route middleware can verify the
    // session before serving a protected page.
    response.cookies.set('ukwelitally_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days, matching the JWT expiry
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

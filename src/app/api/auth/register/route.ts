import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import { hashPassword, normalizePhoneNumber, sanitizeUser, generateToken } from '@/lib/auth'
import { registerUserSchema } from '@/lib/validation'
import { checkRateLimit, getClientIp, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'
import { User } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/register - Create a user account.
 *
 * Public self registration is disabled: the /register page redirects to
 * /login and directs users to contact an administrator. This endpoint is
 * therefore restricted to authenticated admins, which prevents anyone from
 * minting an account with the admin role (or any other role) for themselves.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify the caller is an authenticated admin.
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required. Only administrators can create accounts.' },
        { status: 401 }
      )
    }

    const { verifyToken } = await import('@/lib/auth')
    const payload = verifyToken(authHeader.substring(7))
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      )
    }

    if (payload.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden. Only administrators can create accounts.' },
        { status: 403 }
      )
    }

    // Throttle account creation per client.
    const ip = getClientIp(request)
    const limit = checkRateLimit(
      rateLimitKey('register', ip),
      RATE_LIMITS.register.limit,
      RATE_LIMITS.register.windowMs
    )

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many registration attempts. Please try again later.',
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
    const validationResult = registerUserSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.errors,
        },
        { status: 400 }
      )
    }

    const data = validationResult.data

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(data.phone)

    // Check if user already exists
    const existingUser = await queryOne<User>(
      'SELECT id FROM users WHERE email = $1 OR phone = $2 OR id_number = $3',
      [data.email, normalizedPhone, data.id_number]
    )

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email, phone, or ID number already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(data.password)

    // Insert user
    const result = await queryOne<User>(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, phone, full_name, role, verified, active, created_at`,
      [
        data.email,
        normalizedPhone,
        passwordHash,
        data.full_name,
        data.role,
        data.id_number,
      ]
    )

    if (!result) {
      throw new Error('Failed to create user')
    }

    // Generate JWT token
    const token = generateToken({
      userId: result.id,
      email: result.email,
      role: result.role,
    })

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        result.id,
        'user_registered',
        'user',
        result.id,
        JSON.stringify({ role: result.role }),
        request.headers.get('x-forwarded-for') || 'unknown',
      ]
    )

    return NextResponse.json(
      {
        message: 'User registered successfully',
        user: sanitizeUser(result),
        token,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

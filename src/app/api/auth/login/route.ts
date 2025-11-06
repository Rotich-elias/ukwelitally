import { NextRequest, NextResponse } from 'next/server'
import { queryOne, query } from '@/lib/db'
import { verifyPassword, generateToken, sanitizeUser } from '@/lib/auth'
import { loginSchema } from '@/lib/validation'
import { User } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
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

    return NextResponse.json({
      message: 'Login successful',
      user: sanitizeUser(user),
      token,
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

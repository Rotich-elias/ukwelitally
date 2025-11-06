import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import { hashPassword, normalizePhoneNumber, sanitizeUser, generateToken } from '@/lib/auth'
import { registerUserSchema } from '@/lib/validation'
import { User } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
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

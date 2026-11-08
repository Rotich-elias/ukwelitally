import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { checkRateLimit, getClientIp, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/volunteers - Register a new volunteer from landing page
export async function POST(req: NextRequest) {
  try {
    // This endpoint is public, so throttle submissions per client to prevent
    // spam from flooding the volunteer review queue.
    const ip = getClientIp(req)
    const limit = checkRateLimit(
      rateLimitKey('volunteer_register', ip),
      RATE_LIMITS.volunteerRegister.limit,
      RATE_LIMITS.volunteerRegister.windowMs
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

    const body = await req.json()
    const { 
      full_name, 
      email, 
      phone, 
      id_number, 
      county_id, 
      constituency_id, 
      ward_id, 
      polling_station_id,
      password,
    } = body

    // Validate required fields
    if (!full_name || !email || !phone || !id_number) {
      return NextResponse.json(
        { error: 'Full name, email, phone, and ID number are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate phone format (Kenyan)
    const phoneRegex = /^(\+254|0)[17]\d{8}$/
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Use Kenyan format: +254... or 07...' },
        { status: 400 }
      )
    }

    // Validate ID number (Kenyan)
    const idRegex = /^\d{7,8}$/
    if (!idRegex.test(id_number)) {
      return NextResponse.json(
        { error: 'Invalid ID number format. Must be 7-8 digits' },
        { status: 400 }
      )
    }

    // A volunteer may choose their password now so that the account can be
    // used as soon as an administrator approves the registration. The
    // password is optional for backwards compatibility: registrations without
    // one still get a generated password at approval time.
    let passwordHash: string | null = null
    if (password !== undefined && password !== null && String(password).length > 0) {
      const candidatePassword = String(password)
      if (candidatePassword.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters long' },
          { status: 400 }
        )
      }
      if (!/[A-Z]/.test(candidatePassword) || !/[a-z]/.test(candidatePassword) || !/[0-9]/.test(candidatePassword)) {
        return NextResponse.json(
          { error: 'Password must contain an uppercase letter, a lowercase letter and a number' },
          { status: 400 }
        )
      }
      passwordHash = await hashPassword(candidatePassword)
    }

    // Check if volunteer already exists with same email, phone, or ID
    const existingVolunteer = await queryOne(
      `SELECT id FROM volunteer_registrations 
       WHERE email = $1 OR phone = $2 OR id_number = $3`,
      [email, phone, id_number]
    )

    if (existingVolunteer) {
      return NextResponse.json(
        { error: 'A volunteer with this email, phone, or ID number already exists' },
        { status: 409 }
      )
    }

    // Create volunteer registration. The hash is never returned: the public
    // response only carries the id and status needed by the form.
    const volunteer = await queryOne(
      `INSERT INTO volunteer_registrations 
       (full_name, email, phone, id_number, county_id, constituency_id, ward_id, polling_station_id, status, password_hash, password_set_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
       RETURNING id, full_name, status`,
      [
        full_name.trim(),
        email.toLowerCase().trim(),
        phone.trim(),
        id_number.trim(),
        county_id || null,
        constituency_id || null,
        ward_id || null,
        polling_station_id || null,
        passwordHash,
        passwordHash ? new Date() : null,
      ]
    )

    // Log the registration
    await query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, $4)`,
      [
        'volunteer_registered',
        'volunteer_registration',
        volunteer?.id,
        JSON.stringify({
          full_name,
          email,
          phone,
          id_number,
          location: { county_id, constituency_id, ward_id, polling_station_id },
          self_service_password: Boolean(passwordHash),
        }),
      ]
    )

    return NextResponse.json(
      { 
        message: 'Volunteer registration submitted successfully! We will contact you soon.',
        volunteer: {
          id: volunteer?.id,
          full_name: volunteer?.full_name,
          status: volunteer?.status
        }
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating volunteer registration:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
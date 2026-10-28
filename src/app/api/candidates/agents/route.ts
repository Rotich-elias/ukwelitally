import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { hashPassword, normalizeEmail, normalizePhoneNumber } from '@/lib/auth'
import { getAssignmentScope, isStationInScope, describeScope } from '@/lib/agentScope'
import { checkRateLimit, getClientIp, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '@/lib/jwtSecret'

const JWT_SECRET = getJwtSecret()

export const dynamic = 'force-dynamic'

// GET - List candidate's agents
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    if (decoded.role !== 'candidate') {
      return NextResponse.json({ error: 'Forbidden - Candidate access only' }, { status: 403 })
    }

    // Get candidate profile
    const candidate = await queryOne(
      'SELECT id FROM candidates WHERE user_id = $1',
      [decoded.userId]
    )

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    // Get all agents for this candidate
    const result = await query(
      `SELECT
        a.id as agent_id,
        a.is_primary,
        a.polling_station_id,
        a.created_at,
        u.id as user_id,
        u.email,
        u.phone,
        u.full_name,
        u.active,
        ps.name as station_name,
        ps.code as station_code,
        w.name as ward_name,
        const.name as constituency_name,
        co.name as county_name
      FROM agents a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN polling_stations ps ON a.polling_station_id = ps.id
      LEFT JOIN wards w ON ps.ward_id = w.id
      LEFT JOIN constituencies const ON w.constituency_id = const.id
      LEFT JOIN counties co ON const.county_id = co.id
      WHERE a.candidate_id = $1
      ORDER BY a.created_at DESC`,
      [candidate.id]
    )

    return NextResponse.json({
      success: true,
      data: result.rows,
    })
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }
}

// POST - Create new agent
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    if (decoded.role !== 'candidate') {
      return NextResponse.json({ error: 'Forbidden - Candidate access only' }, { status: 403 })
    }

    // Throttle bulk agent creation so a compromised candidate account cannot
    // be used to mass-create accounts.
    const ip = getClientIp(request)
    const limit = checkRateLimit(
      rateLimitKey('agentCreate', ip),
      RATE_LIMITS.agentCreate.limit,
      RATE_LIMITS.agentCreate.windowMs
    )
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many agents created. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    // Get candidate profile
    const candidate = await queryOne(
      'SELECT id FROM candidates WHERE user_id = $1',
      [decoded.userId]
    )

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const { email, phone, full_name, id_number, password, polling_station_id, is_primary } = body

    // Validate required fields
    if (!email || !phone || !full_name || !id_number || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    // The station has to be inside the candidate's own scope, which comes
    // from their race and electoral area. The interface only shows those
    // stations, but the API decides.
    let scope = null
    if (polling_station_id) {
      scope = await getAssignmentScope(decoded.userId)

      if (!scope) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }

      const allowed = await isStationInScope(scope, polling_station_id)
      if (!allowed) {
        return NextResponse.json(
          {
            error: `You can only assign agents to ${describeScope(scope)}. This station is outside your electoral area.`,
          },
          { status: 403 }
        )
      }
    }

    // Normalize email and phone
    const normalizedEmail = normalizeEmail(email)
    const normalizedPhone = normalizePhoneNumber(phone)

    // Check if user exists
    const existingUser = await queryOne(
      'SELECT id FROM users WHERE email = $1 OR phone = $2 OR id_number = $3',
      [normalizedEmail, normalizedPhone, id_number]
    )

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email, phone, or ID number already exists' },
        { status: 409 }
      )
    }

    // Enforce limits within this candidate's own team: max 1 primary agent and
    // max 2 backup agents per polling station. Another team at the same
    // station has its own allocation, so it can never use up this team's
    // slots.
    if (polling_station_id) {
      if (is_primary !== false) {
        const existingPrimary = await queryOne(
          `SELECT COUNT(*) as cnt FROM agents
            WHERE candidate_id = $1 AND polling_station_id = $2 AND is_primary = TRUE`,
          [candidate.id, polling_station_id]
        )
        if (parseInt(existingPrimary?.cnt) >= 1) {
          return NextResponse.json(
            { error: 'Only 1 primary agent allowed per polling station for your team. Add the agent as a backup agent instead.' },
            { status: 409 }
          )
        }
      } else {
        const existingBackups = await queryOne(
          `SELECT COUNT(*) as cnt FROM agents
            WHERE candidate_id = $1 AND polling_station_id = $2 AND is_primary = FALSE`,
          [candidate.id, polling_station_id]
        )
        if (parseInt(existingBackups?.cnt) >= 2) {
          return NextResponse.json(
            { error: 'Maximum 2 backup agents allowed per polling station for your team.' },
            { status: 409 }
          )
        }
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const newUser = await queryOne(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
       VALUES ($1, $2, $3, $4, 'agent', $5, true, true)
       RETURNING id, email, phone, full_name, role, created_at`,
      [normalizedEmail, normalizedPhone, passwordHash, full_name, id_number]
    )

    if (!newUser) {
      throw new Error('Failed to create user')
    }

    // Create agent profile
    const agent = await queryOne(
      `INSERT INTO agents (user_id, candidate_id, polling_station_id, is_primary)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [newUser.id, candidate.id, polling_station_id || null, is_primary !== false]
    )

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        decoded.userId,
        'agent_created',
        'agent',
        agent.id,
        JSON.stringify({ agent_id: agent.id, candidate_id: candidate.id }),
        request.headers.get('x-forwarded-for') || 'unknown',
      ]
    )

    return NextResponse.json(
      {
        success: true,
        message: 'Agent created successfully',
        data: { ...newUser, agent_id: agent.id },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating agent:', error)
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
  }
}

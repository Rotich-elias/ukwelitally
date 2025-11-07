import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { hashPassword, normalizePhoneNumber } from '@/lib/auth'
import { getCandidateRestrictions, canAccessLocation } from '@/lib/candidate-restrictions'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

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

    // Get candidate restrictions and validate polling station location
    if (polling_station_id) {
      const restrictions = await getCandidateRestrictions(decoded.userId)

      if (restrictions && restrictions.position !== 'president') {
        // Get polling station location
        const station = await queryOne(
          `SELECT ps.id, w.id as ward_id, const.id as constituency_id, co.id as county_id
           FROM polling_stations ps
           JOIN wards w ON ps.ward_id = w.id
           JOIN constituencies const ON w.constituency_id = const.id
           JOIN counties co ON const.county_id = co.id
           WHERE ps.id = $1`,
          [polling_station_id]
        )

        if (!station) {
          return NextResponse.json(
            { error: 'Polling station not found' },
            { status: 404 }
          )
        }

        // Check if candidate can access this station's location
        const canAccess = canAccessLocation(restrictions, {
          county_id: station.county_id,
          constituency_id: station.constituency_id,
          ward_id: station.ward_id,
        })

        if (!canAccess) {
          return NextResponse.json(
            {
              error: `You can only assign agents to polling stations within your electoral area. This station is outside your ${restrictions.position === 'mca' ? 'ward' : restrictions.position === 'mp' ? 'constituency' : 'county'}.`
            },
            { status: 403 }
          )
        }
      }
    }

    // Normalize phone
    const normalizedPhone = normalizePhoneNumber(phone)

    // Check if user exists
    const existingUser = await queryOne(
      'SELECT id FROM users WHERE email = $1 OR phone = $2 OR id_number = $3',
      [email, normalizedPhone, id_number]
    )

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email, phone, or ID number already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const newUser = await queryOne(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
       VALUES ($1, $2, $3, $4, 'agent', $5, true, true)
       RETURNING id, email, phone, full_name, role, created_at`,
      [email, normalizedPhone, passwordHash, full_name, id_number]
    )

    if (!newUser) {
      throw new Error('Failed to create user')
    }

    // Create agent profile
    const agent = await queryOne(
      `INSERT INTO agents (user_id, candidate_id, polling_station_id, is_primary)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [newUser.id, candidate.id, polling_station_id || null, is_primary || true]
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

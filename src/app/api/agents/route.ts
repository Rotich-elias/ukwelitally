import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, queryMany } from '@/lib/db'
import { withRole } from '@/middleware/auth'
import { Agent, Candidate } from '@/types/database'

// GET /api/agents - List agents (filtered by candidate for candidates)
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user
    const { searchParams } = new URL(req.url)
    const candidateId = searchParams.get('candidate_id')

    let agents: Agent[]

    if (user.role === 'admin') {
      // Admin can see all agents
      const sql = candidateId
        ? 'SELECT * FROM agents WHERE candidate_id = $1 ORDER BY created_at DESC'
        : 'SELECT * FROM agents ORDER BY created_at DESC'
      agents = await queryMany<Agent>(sql, candidateId ? [candidateId] : [])
    } else if (user.role === 'candidate') {
      // Candidate can only see their own agents
      const candidate = await queryOne<Candidate>(
        'SELECT id FROM candidates WHERE user_id = $1',
        [user.userId]
      )
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }
      agents = await queryMany<Agent>(
        'SELECT * FROM agents WHERE candidate_id = $1 ORDER BY created_at DESC',
        [candidate.id]
      )
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    return NextResponse.json({ agents })
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/agents - Register a new agent (candidate or admin only)
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    const body = await req.json()
    const { user_id, polling_station_id, is_primary = true } = body

    // Get candidate ID
    let candidateId: number
    if (user.role === 'candidate') {
      const candidate = await queryOne<Candidate>(
        'SELECT id FROM candidates WHERE user_id = $1',
        [user.userId]
      )
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }
      candidateId = candidate.id
    } else {
      // Admin can specify candidate_id
      if (!body.candidate_id) {
        return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 })
      }
      candidateId = body.candidate_id
    }

    // Verify user exists and has agent role
    const targetUser = await queryOne(
      'SELECT id, role FROM users WHERE id = $1',
      [user_id]
    )
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (targetUser.role !== 'agent') {
      return NextResponse.json({ error: 'User must have agent role' }, { status: 400 })
    }

    // Check if agent already exists
    const existingAgent = await queryOne(
      'SELECT id FROM agents WHERE user_id = $1',
      [user_id]
    )
    if (existingAgent) {
      return NextResponse.json({ error: 'Agent already registered' }, { status: 409 })
    }

    // Check if primary agent already exists for this station
    if (is_primary && polling_station_id) {
      const existingPrimary = await queryOne(
        'SELECT id FROM agents WHERE polling_station_id = $1 AND is_primary = TRUE AND candidate_id = $2',
        [polling_station_id, candidateId]
      )
      if (existingPrimary) {
        return NextResponse.json(
          { error: 'Primary agent already assigned to this polling station' },
          { status: 409 }
        )
      }
    }

    // Create agent
    const agent = await queryOne<Agent>(
      `INSERT INTO agents (user_id, candidate_id, polling_station_id, is_primary)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, candidateId, polling_station_id, is_primary]
    )

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        'agent_registered',
        'agent',
        agent?.id,
        JSON.stringify({ polling_station_id, is_primary }),
      ]
    )

    return NextResponse.json({ agent }, { status: 201 })
  } catch (error) {
    console.error('Error creating agent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRole(['candidate', 'admin'], handleGet as any)
export const POST = withRole(['candidate', 'admin'], handlePost as any)

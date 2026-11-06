import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, queryMany } from '@/lib/db'
import { withRole } from '@/middleware/auth'
import { Agent, Candidate } from '@/types/database'
import { getAssignmentScope, isStationInScope, describeScope } from '@/lib/agentScope'
import { checkRateLimit, getClientIp, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'

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
//
// This is the legacy assignment endpoint. The candidate dashboard uses
// /api/candidates/agents, which also creates the login account. This route
// assigns an existing agent account, so it applies the same scope, access and
// allocation rules instead of trusting the request body.
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    const body = await req.json()
    const { user_id, polling_station_id, is_primary = true } = body

    const targetUserId = Number(user_id)
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    const stationId = Number(polling_station_id)
    if (!Number.isInteger(stationId) || stationId <= 0) {
      return NextResponse.json({ error: 'polling_station_id is required' }, { status: 400 })
    }

    // Throttle bulk assignment so a compromised account cannot mass-assign
    // agents, and so the allocation counters cannot be probed quickly.
    const ip = getClientIp(req)
    const limit = checkRateLimit(
      rateLimitKey('agentAssign', `${user.userId}:${ip}`),
      RATE_LIMITS.agentCreate.limit,
      RATE_LIMITS.agentCreate.windowMs
    )
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many agent assignments. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    // Get candidate ID
    let candidateId: number
    if (user.role === 'candidate') {
      const candidate = await queryOne<{ id: number; access_status: string }>(
        'SELECT id, access_status FROM candidates WHERE user_id = $1',
        [user.userId]
      )
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }
      if (candidate.access_status !== 'active') {
        return NextResponse.json(
          { error: 'Your subscription is not active. Contact an administrator to restore access.' },
          { status: 403 }
        )
      }
      candidateId = candidate.id

      // The station must be inside the candidate's own electoral scope.
      const scope = await getAssignmentScope(user.userId)
      if (!scope) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }
      const allowed = await isStationInScope(scope, stationId)
      if (!allowed) {
        return NextResponse.json(
          {
            error: `You can only assign agents to ${describeScope(scope)}. This station is outside your electoral area.`,
          },
          { status: 403 }
        )
      }
    } else {
      // Admin can specify candidate_id
      if (!body.candidate_id) {
        return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 })
      }
      candidateId = Number(body.candidate_id)
      if (!Number.isInteger(candidateId) || candidateId <= 0) {
        return NextResponse.json({ error: 'Invalid candidate_id' }, { status: 400 })
      }
    }

    // Verify user exists and has agent role
    const targetUser = await queryOne<{ id: number; role: string; active: boolean }>(
      'SELECT id, role, active FROM users WHERE id = $1',
      [targetUserId]
    )
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (targetUser.role !== 'agent') {
      return NextResponse.json({ error: 'User must have agent role' }, { status: 400 })
    }
    if (!targetUser.active) {
      return NextResponse.json({ error: 'This agent account is deactivated' }, { status: 400 })
    }

    // Check if agent already exists
    const existingAgent = await queryOne(
      'SELECT id FROM agents WHERE user_id = $1',
      [targetUserId]
    )
    if (existingAgent) {
      return NextResponse.json({ error: 'Agent already registered' }, { status: 409 })
    }

    // A candidate team may have at most one primary and two backup agents at
    // a station. The limit is per candidate, so another team at the same
    // station keeps its own allocation.
    if (is_primary) {
      const existingPrimary = await queryOne(
        'SELECT id FROM agents WHERE polling_station_id = $1 AND is_primary = TRUE AND candidate_id = $2',
        [stationId, candidateId]
      )
      if (existingPrimary) {
        return NextResponse.json(
          { error: 'Primary agent already assigned to this polling station' },
          { status: 409 }
        )
      }
    } else {
      const existingBackups = await queryOne<{ cnt: string }>(
        `SELECT COUNT(*) as cnt FROM agents
          WHERE candidate_id = $1 AND polling_station_id = $2 AND is_primary = FALSE`,
        [candidateId, stationId]
      )
      if (parseInt(existingBackups?.cnt ?? '0', 10) >= 2) {
        return NextResponse.json(
          { error: 'Maximum 2 backup agents allowed per polling station for your team.' },
          { status: 409 }
        )
      }
    }

    // Create agent
    const agent = await queryOne<Agent>(
      `INSERT INTO agents (user_id, candidate_id, polling_station_id, is_primary)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [targetUserId, candidateId, stationId, is_primary]
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
        JSON.stringify({ polling_station_id: stationId, is_primary }),
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

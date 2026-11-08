import { NextRequest, NextResponse } from 'next/server'
import { queryMany, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import {
  createOpinionPoll,
  getCandidateProfileForUser,
  isPollManager,
  parsePollInput,
  type OpinionPoll,
} from '@/lib/polls'

export const dynamic = 'force-dynamic'

// GET /api/polls - Polls the signed in candidate or administrator can manage.
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user
    if (!isPollManager(user.role)) {
      return NextResponse.json({ error: 'Only candidates and administrators can manage polls' }, { status: 403 })
    }

    let sql = `
      SELECT p.*, u.full_name AS creator_name, c.full_name AS candidate_name,
             COUNT(DISTINCT o.id)::int AS option_count,
             COUNT(DISTINCT v.id)::int AS total_votes
        FROM opinion_polls p
        LEFT JOIN users u ON u.id = p.created_by
        LEFT JOIN candidates c ON c.id = p.candidate_id
        LEFT JOIN opinion_poll_options o ON o.poll_id = p.id
        LEFT JOIN opinion_poll_votes v ON v.poll_id = p.id
       WHERE p.status <> 'archived'
    `
    const params: any[] = []

    if (user.role === 'candidate') {
      const candidate = await getCandidateProfileForUser(user.userId)
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }
      sql += ' AND (p.created_by = $1 OR p.candidate_id = $2)'
      params.push(user.userId, candidate.id)
    }

    sql += ' GROUP BY p.id, u.full_name, c.full_name ORDER BY p.created_at DESC LIMIT 100'

    const polls = await queryMany<OpinionPoll & { option_count: number; total_votes: number }>(sql, params)

    return NextResponse.json({
      polls: polls.map((poll) => ({
        ...poll,
        share_path: `/polls/${poll.slug}`,
      })),
    })
  } catch (error) {
    console.error('Error fetching opinion polls:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/polls - Create an opinion poll with its options.
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    if (!isPollManager(user.role)) {
      return NextResponse.json({ error: 'Only candidates and administrators can create polls' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const parsed = parsePollInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    let candidateId: number | null = null
    if (user.role === 'candidate') {
      const candidate = await getCandidateProfileForUser(user.userId)
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }
      candidateId = candidate.id
    } else if (body.candidate_id !== undefined && body.candidate_id !== null) {
      const candidate = await queryOne<{ id: number }>(
        'SELECT id FROM candidates WHERE id = $1 AND is_placeholder = FALSE',
        [body.candidate_id]
      )
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
      }
      candidateId = candidate.id
    }

    const poll = await createOpinionPoll({
      ...parsed.value,
      createdBy: user.userId,
      candidateId,
      isPublic: body.is_public !== false,
    })

    return NextResponse.json(
      {
        message: 'Opinion poll created',
        poll,
        share_path: `/polls/${poll.slug}`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating opinion poll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withAuth(handleGet as any)
export const POST = withAuth(handlePost as any)

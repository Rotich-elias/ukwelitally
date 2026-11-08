import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import {
  getCandidateProfileForUser,
  getPollById,
  isPollManager,
  type OpinionPoll,
} from '@/lib/polls'

export const dynamic = 'force-dynamic'

async function loadManagedPoll(user: any, id: number): Promise<
  | { poll: OpinionPoll; candidateId: number | null }
  | { error: NextResponse }
> {
  if (!isPollManager(user.role)) {
    return { error: NextResponse.json({ error: 'Only candidates and administrators can manage polls' }, { status: 403 }) }
  }

  const poll = await queryOne<OpinionPoll>('SELECT * FROM opinion_polls WHERE id = $1', [id])
  if (!poll) {
    return { error: NextResponse.json({ error: 'Poll not found' }, { status: 404 }) }
  }

  if (user.role === 'admin') {
    return { poll, candidateId: null }
  }

  const candidate = await getCandidateProfileForUser(user.userId)
  if (!candidate) {
    return { error: NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 }) }
  }

  if (poll.created_by !== user.userId && poll.candidate_id !== candidate.id) {
    return { error: NextResponse.json({ error: 'You can only manage your own polls' }, { status: 403 }) }
  }

  return { poll, candidateId: candidate.id }
}

async function handleGet(req: NextRequest, context: any) {
  try {
    const user = (req as any).user
    const params = await Promise.resolve(context?.params)
    const id = parseInt(params?.id)
    if (!id) return NextResponse.json({ error: 'Invalid poll id' }, { status: 400 })

    const loaded = await loadManagedPoll(user, id)
    if ('error' in loaded) return loaded.error

    const poll = await getPollById(id)
    return NextResponse.json({ poll })
  } catch (error) {
    console.error('Error fetching opinion poll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handlePatch(req: NextRequest, context: any) {
  try {
    const user = (req as any).user
    const params = await Promise.resolve(context?.params)
    const id = parseInt(params?.id)
    if (!id) return NextResponse.json({ error: 'Invalid poll id' }, { status: 400 })

    const loaded = await loadManagedPoll(user, id)
    if ('error' in loaded) return loaded.error

    const body = await req.json()
    const updates: string[] = []
    const values: any[] = []
    let index = 1

    if (body.title !== undefined) {
      const title = String(body.title).trim()
      if (title.length < 3 || title.length > 200) {
        return NextResponse.json({ error: 'Poll title must be between 3 and 200 characters' }, { status: 400 })
      }
      updates.push(`title = $${index++}`)
      values.push(title)
    }

    if (body.description !== undefined) {
      updates.push(`description = $${index++}`)
      values.push(String(body.description || '').trim() || null)
    }

    if (body.ends_at !== undefined) {
      if (body.ends_at === null || body.ends_at === '') {
        updates.push(`ends_at = $${index++}`)
        values.push(null)
      } else {
        const parsed = new Date(body.ends_at)
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ error: 'Invalid poll end date' }, { status: 400 })
        }
        updates.push(`ends_at = $${index++}`)
        values.push(parsed.toISOString())
      }
    }

    if (body.status !== undefined) {
      const status = String(body.status)
      if (!['draft', 'open', 'closed', 'archived'].includes(status)) {
        return NextResponse.json({ error: 'Invalid poll status' }, { status: 400 })
      }
      updates.push(`status = $${index++}`)
      values.push(status)
      updates.push(status === 'open' ? 'closed_at = NULL' : 'closed_at = COALESCE(closed_at, NOW())')
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    updates.push('updated_at = NOW()')
    values.push(id)

    await queryOne(
      `UPDATE opinion_polls SET ${updates.join(', ')} WHERE id = $${index} RETURNING id`,
      values
    )

    const poll = await getPollById(id)
    return NextResponse.json({ message: 'Opinion poll updated', poll })
  } catch (error) {
    console.error('Error updating opinion poll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleDelete(req: NextRequest, context: any) {
  try {
    const user = (req as any).user
    const params = await Promise.resolve(context?.params)
    const id = parseInt(params?.id)
    if (!id) return NextResponse.json({ error: 'Invalid poll id' }, { status: 400 })

    const loaded = await loadManagedPoll(user, id)
    if ('error' in loaded) return loaded.error

    // Archive instead of delete so the votes and the poll remain available to
    // an administrator. A reset is the only operation that removes poll rows,
    // and it archives them first.
    await queryOne(
      `UPDATE opinion_polls
          SET status = 'archived', closed_at = COALESCE(closed_at, NOW()), updated_at = NOW()
        WHERE id = $1
        RETURNING id`,
      [id]
    )

    return NextResponse.json({ message: 'Opinion poll archived' })
  } catch (error) {
    console.error('Error archiving opinion poll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withAuth(handleGet as any)
export const PATCH = withAuth(handlePatch as any)
export const DELETE = withAuth(handleDelete as any)

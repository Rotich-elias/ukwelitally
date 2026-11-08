import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { withRole } from '@/middleware/auth'
import {
  getResetPreview,
  listArchives,
  resetElectionData,
  resetOpinionPollData,
  type ResetKind,
} from '@/lib/reset'

export const dynamic = 'force-dynamic'

const CONFIRMATIONS: Record<ResetKind, string> = {
  election: 'RESET ELECTION DATA',
  opinion_polls: 'RESET OPINION POLLS',
}

function isResetKind(value: unknown): value is ResetKind {
  return value === 'election' || value === 'opinion_polls'
}

// GET /api/admin/reset - Preview the data a reset would archive and remove.
async function handleGet(req: NextRequest) {
  try {
    const [election, opinionPolls, archives] = await Promise.all([
      getResetPreview('election'),
      getResetPreview('opinion_polls'),
      listArchives(10),
    ])

    return NextResponse.json({ previews: [election, opinionPolls], archives })
  } catch (error) {
    console.error('Error loading reset preview:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/reset - Archive and remove election or opinion poll data.
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    const body = await req.json()
    const kind = body.kind

    if (!isResetKind(kind)) {
      return NextResponse.json(
        { error: 'kind must be either "election" or "opinion_polls"' },
        { status: 400 }
      )
    }

    if (String(body.confirmation || '').trim().toUpperCase() !== CONFIRMATIONS[kind]) {
      return NextResponse.json(
        { error: `Type "${CONFIRMATIONS[kind]}" to confirm this reset` },
        { status: 400 }
      )
    }

    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null
    const label =
      typeof body.label === 'string' && body.label.trim()
        ? body.label.trim().slice(0, 200)
        : kind === 'election'
          ? `Election data reset ${new Date().toISOString()}`
          : `Opinion poll reset ${new Date().toISOString()}`

    const result =
      kind === 'election'
        ? await resetElectionData({ actorId: user.userId, label, notes })
        : await resetOpinionPollData({ actorId: user.userId, label, notes })

    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        kind === 'election' ? 'election_data_reset' : 'opinion_poll_data_reset',
        'data_archive',
        result.archiveId,
        JSON.stringify({ counts: result.counts, label, notes }),
      ]
    )

    return NextResponse.json({
      message:
        kind === 'election'
          ? 'Election data archived and reset.'
          : 'Opinion poll data archived and reset.',
      archive_id: result.archiveId,
      counts: result.counts,
    })
  } catch (error) {
    console.error('Error resetting data:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRole(['admin'], handleGet as any)
export const POST = withRole(['admin'], handlePost as any)

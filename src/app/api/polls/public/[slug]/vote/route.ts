import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { getClientIp, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'
import { checkSharedRateLimit } from '@/lib/sharedRateLimit'
import {
  getPollBySlug,
  isPollOpen,
  maxVotesPerAddress,
  toPublicPoll,
  voterFingerprint,
} from '@/lib/polls'

export const dynamic = 'force-dynamic'

// POST /api/polls/public/[slug]/vote - Cast one vote in a public poll.
export async function POST(req: NextRequest, context: any) {
  try {
    const ip = getClientIp(req)
    const limit = await checkSharedRateLimit(
      rateLimitKey('poll_vote', ip),
      RATE_LIMITS.pollVote.limit,
      RATE_LIMITS.pollVote.windowMs
    )
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many votes from this connection. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const params = await Promise.resolve(context?.params)
    const slug = params?.slug
    if (!slug) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const optionId = parseInt(body.option_id)
    if (!optionId) {
      return NextResponse.json({ error: 'Choose an option before voting' }, { status: 400 })
    }

    const poll = await getPollBySlug(slug)
    if (!poll || !poll.is_public || poll.status === 'archived' || poll.status === 'draft') {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    if (!isPollOpen(poll)) {
      return NextResponse.json({ error: 'This poll is closed' }, { status: 403 })
    }

    const option = poll.options.find((entry) => entry.id === optionId)
    if (!option) {
      return NextResponse.json({ error: 'That option does not belong to this poll' }, { status: 400 })
    }

    // The browser contributes a random key stored locally, so a shared IP
    // (office, campus, mobile carrier NAT) does not prevent other people from
    // voting. The key is combined with the address and user agent and hashed;
    // the raw address is never stored.
    const voterKey = typeof body.voter_key === 'string' ? body.voter_key.slice(0, 128) : ''
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 500)
    const fingerprint = voterFingerprint(
      poll.slug,
      `${ip}:${voterKey}`,
      userAgent
    )
    const ipHash = crypto.createHash('sha256').update(`${ip}`).digest('hex')

    // The browser key above is chosen by the client, so on its own it lets one
    // address vote again and again with a fresh key each time. This cap is
    // counted in the database, so unlike the in-memory rate limit it holds
    // across server instances and cold starts. It is generous because mobile
    // carriers put many people behind one address.
    const fromAddress = await queryOne<{ votes: number }>(
      `SELECT COUNT(*)::int AS votes
         FROM opinion_poll_votes
        WHERE poll_id = $1 AND ip_hash = $2`,
      [poll.id, ipHash]
    )
    if ((fromAddress?.votes ?? 0) >= maxVotesPerAddress()) {
      return NextResponse.json(
        { error: 'Too many votes in this poll from this connection.' },
        { status: 429 }
      )
    }

    const inserted = await queryOne<{ id: number }>(
      `INSERT INTO opinion_poll_votes
         (poll_id, option_id, voter_fingerprint, ip_hash, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (poll_id, voter_fingerprint) DO NOTHING
       RETURNING id`,
      [poll.id, optionId, fingerprint, ipHash, userAgent]
    )

    if (!inserted) {
      return NextResponse.json(
        { error: 'You have already voted in this poll', already_voted: true },
        { status: 409 }
      )
    }

    const updated = await getPollBySlug(slug)

    return NextResponse.json({
      message: 'Vote recorded',
      poll: updated ? { ...toPublicPoll(updated), is_open: isPollOpen(updated) } : null,
    })
  } catch (error) {
    console.error('Error recording poll vote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

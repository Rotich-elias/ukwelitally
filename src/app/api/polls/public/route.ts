import { NextRequest, NextResponse } from 'next/server'
import { getClientIp, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'
import { checkSharedRateLimit } from '@/lib/sharedRateLimit'
import { createOpinionPoll, parsePollInput, toPublicPoll } from '@/lib/polls'

export const dynamic = 'force-dynamic'

/**
 * POST /api/polls/public - Create an opinion poll without an account.
 *
 * Anyone can create a public poll. The endpoint is intentionally limited to
 * creating a public, open poll: it never attaches a candidate, never creates
 * a draft, and cannot touch an existing poll. Management (closing, archiving)
 * stays with candidates and administrators.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const limit = await checkSharedRateLimit(
      rateLimitKey('poll_create', ip),
      RATE_LIMITS.pollCreate.limit,
      RATE_LIMITS.pollCreate.windowMs
    )
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many polls from this connection. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const body = await req.json().catch(() => ({}))

    // Honeypot: a real person never fills a hidden field. Reject quietly
    // enough that a bot cannot learn which field gave it away.
    if (typeof body?.website === 'string' && body.website.trim() !== '') {
      return NextResponse.json({ error: 'Unable to create this poll' }, { status: 400 })
    }

    const parsed = parsePollInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const poll = await createOpinionPoll({
      ...parsed.value,
      createdBy: null,
      candidateId: null,
      isPublic: true,
      randomSlug: true,
    })

    return NextResponse.json(
      {
        message: 'Opinion poll created',
        poll: toPublicPoll(poll),
        share_path: `/polls/${poll.slug}`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating public opinion poll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getPollBySlug, isPollOpen } from '@/lib/polls'

export const dynamic = 'force-dynamic'

// GET /api/polls/public/[slug] - Public poll details and live counts.
export async function GET(_req: NextRequest, context: any) {
  try {
    const params = await Promise.resolve(context?.params)
    const slug = params?.slug
    if (!slug) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    const poll = await getPollBySlug(slug)
    if (!poll || !poll.is_public || poll.status === 'archived' || poll.status === 'draft') {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    return NextResponse.json({
      poll: {
        ...poll,
        is_open: isPollOpen(poll),
      },
    })
  } catch (error) {
    console.error('Error fetching public poll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

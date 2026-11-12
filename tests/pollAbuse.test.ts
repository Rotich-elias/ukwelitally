import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

/**
 * Public opinion polls can be used without an account, so:
 * - one address may not stuff a poll by sending a fresh voter key each time;
 * - a community poll cannot claim an official-looking address;
 * - the public payload does not reveal who created a poll.
 */

const executed: Array<{ text: string; params?: any[] }> = []
let votesFromAddress = 0
let insertedSlug = ''

const POLL = {
  id: 3,
  slug: 'who-will-win',
  title: 'Who will win?',
  description: null,
  created_by: 42,
  candidate_id: null,
  status: 'open',
  is_public: true,
  starts_at: '2026-01-01T00:00:00Z',
  ends_at: null,
  closed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  creator_name: 'Secret Creator',
  candidate_name: null,
}

function run(text: string, params?: any[]) {
  executed.push({ text, params })
  let rows: any[] = []
  if (/FROM opinion_polls p[\s\S]*WHERE p\.id/.test(text) && insertedSlug) {
    // The freshly created community poll, reloaded after the insert.
    rows = [{ ...POLL, id: 4, slug: insertedSlug, created_by: null, creator_name: null }]
  } else if (/FROM opinion_polls p/.test(text)) rows = [POLL]
  else if (/FROM opinion_poll_options/.test(text)) {
    rows = [
      { id: 1, poll_id: 3, label: 'A', description: null, sort_order: 0, votes: 0 },
      { id: 2, poll_id: 3, label: 'B', description: null, sort_order: 1, votes: 0 },
    ]
  } else if (/COUNT\(\*\)::int AS votes/.test(text)) rows = [{ votes: votesFromAddress }]
  else if (/INSERT INTO opinion_poll_votes/.test(text)) rows = [{ id: 99 }]
  else if (/INSERT INTO opinion_polls/.test(text)) {
    insertedSlug = params![0]
    rows = [{ ...POLL, id: 4, slug: params![0], created_by: null }]
  }
  return { rows, rowCount: rows.length }
}

vi.mock('@/lib/db', () => {
  const client = { query: vi.fn(async (t: string, p?: any[]) => run(t, p)) }
  return {
    query: vi.fn(async (t: string, p?: any[]) => run(t, p)),
    queryOne: vi.fn(async (t: string, p?: any[]) => run(t, p).rows[0] ?? null),
    queryMany: vi.fn(async (t: string, p?: any[]) => run(t, p).rows),
    transaction: vi.fn(async (cb: (c: any) => Promise<any>) => cb(client)),
  }
})

const { POST: vote } = await import('@/app/api/polls/public/[slug]/vote/route')
const { POST: createPoll } = await import('@/app/api/polls/public/route')
const { GET: getPoll } = await import('@/app/api/polls/public/[slug]/route')

let ipCounter = 0
function post(path: string, body: unknown) {
  // A fresh address per request keeps the in-memory rate limiter out of the
  // way, so these tests exercise the database cap.
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` },
    body: JSON.stringify(body),
  })
}

const ctx = { params: Promise.resolve({ slug: 'who-will-win' }) }

beforeEach(() => {
  executed.length = 0
  votesFromAddress = 0
  delete process.env.POLL_MAX_VOTES_PER_IP
})

describe('public poll voting', () => {
  it('records a vote while the address is under the cap', async () => {
    const res = await vote(post('/api/polls/public/who-will-win/vote', { option_id: 1, voter_key: 'k1' }), ctx)
    expect(res.status).toBe(200)
  })

  it('refuses further votes from an address at the cap, whatever voter key it sends', async () => {
    votesFromAddress = 25
    const res = await vote(
      post('/api/polls/public/who-will-win/vote', { option_id: 1, voter_key: crypto.randomUUID() }),
      ctx
    )
    expect(res.status).toBe(429)
    expect(executed.some((q) => /INSERT INTO opinion_poll_votes/.test(q.text))).toBe(false)
  })

  it('lets the cap be configured', async () => {
    process.env.POLL_MAX_VOTES_PER_IP = '3'
    votesFromAddress = 3
    const res = await vote(post('/api/polls/public/who-will-win/vote', { option_id: 1 }), ctx)
    expect(res.status).toBe(429)
  })

  it('does not reveal who created the poll', async () => {
    const res = await vote(post('/api/polls/public/who-will-win/vote', { option_id: 1 }), ctx)
    const body = await res.json()
    expect(body.poll.created_by).toBeUndefined()
    expect(body.poll.creator_name).toBeUndefined()
  })
})

describe('community polls', () => {
  it('get a random address, so a title cannot claim an official-looking URL', async () => {
    const res = await createPoll(
      post('/api/polls/public', {
        title: 'IEBC official presidential results',
        options: ['A', 'B'],
      })
    )
    expect(res.status).toBe(201)
    expect(insertedSlug).toMatch(/^iebc-official-presidential-results-[0-9a-f]{8}$/)
    const body = await res.json()
    expect(body.poll.is_community).toBe(true)
    expect(body.poll.created_by).toBeUndefined()
  })

  it('are flagged as community polls in the public payload', async () => {
    const res = await getPoll(new NextRequest('http://localhost/api/polls/public/who-will-win'), ctx)
    const body = await res.json()
    expect(body.poll.is_community).toBe(false) // created by an account
    expect(body.poll.creator_name).toBeUndefined()
  })
})

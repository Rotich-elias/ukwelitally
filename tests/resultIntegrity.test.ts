import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

/**
 * Integrity of the published tally.
 *
 * - A candidate may only review their own team's submissions; a geographic
 *   check let rivals approve or reject each other's results.
 * - Figures are type-checked, may never be negative, and figures that fail
 *   validation are never selected as a station's result, even when the
 *   submission was approved before the figures were entered.
 */

interface Handler {
  match: RegExp
  rows: (text: string, params?: any[]) => any[]
}

const handlers: Handler[] = []
const executed: Array<{ text: string; params?: any[] }> = []
let caller: { userId: number; role: string; email: string } | null = null

function run(text: string, params?: any[]) {
  executed.push({ text, params })
  const handler = handlers.find((h) => h.match.test(text))
  const rows = handler ? handler.rows(text, params) : []
  return { rows, rowCount: rows.length }
}

vi.mock('@/lib/authenticate', () => ({
  authenticateRequest: vi.fn(async () => caller),
}))

vi.mock('@/lib/db', () => {
  const client = { query: vi.fn(async (t: string, p?: any[]) => run(t, p)) }
  return {
    query: vi.fn(async (t: string, p?: any[]) => run(t, p)),
    queryOne: vi.fn(async (t: string, p?: any[]) => run(t, p).rows[0] ?? null),
    queryMany: vi.fn(async (t: string, p?: any[]) => run(t, p).rows),
    transaction: vi.fn(async (cb: (c: any) => Promise<any>) => cb(client)),
  }
})

vi.mock('@/lib/confidence', () => ({
  recalculateSubmissionConfidence: vi.fn(async () => undefined),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => 1),
  notifyAdmins: vi.fn(async () => undefined),
  notifySubmissionOwner: vi.fn(async () => undefined),
}))

const { POST: reviewPost } = await import('@/app/api/submissions/[id]/review/route')
const { POST: resultsPost } = await import('@/app/api/results/route')

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ran(pattern: RegExp) {
  return executed.some((q) => pattern.test(q.text))
}

const OWN_CANDIDATE = { id: 10, access_status: 'active' }

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: 500,
    candidate_id: OWN_CANDIDATE.id,
    user_id: 300,
    polling_station_id: 7,
    status: 'pending',
    verified_at: null,
    submission_origin: 'agent',
    submission_type: 'primary',
    supersedes_submission_id: null,
    superseded_by_submission_id: null,
    ...overrides,
  }
}

describe('submission review', () => {
  let sub: Record<string, unknown>
  let results: Array<{ is_valid: boolean }>

  beforeEach(() => {
    handlers.length = 0
    executed.length = 0
    caller = { userId: 100, role: 'candidate', email: 'c@test.local' }
    sub = submission()
    results = [{ is_valid: true }]
    handlers.push(
      { match: /SELECT \* FROM submissions WHERE id/, rows: () => [sub] },
      { match: /FROM candidates WHERE user_id/, rows: () => [OWN_CANDIDATE] },
      { match: /SELECT is_valid FROM results/, rows: () => results },
      // The old location-only check: the rival's station is inside the
      // candidate's area, so it said yes. The fix must not rely on it.
      { match: /SELECT EXISTS/, rows: () => [{ allowed: true }] }
    )
  })

  const review = (action: string) =>
    reviewPost(post('/api/submissions/500/review', { action }), {
      params: Promise.resolve({ id: '500' }),
    })

  for (const action of ['approve', 'reject', 'request_revision']) {
    it(`refuses to let a candidate ${action} a rival team's submission`, async () => {
      sub = submission({ candidate_id: 99 })
      const res = await review(action)
      expect(res.status).toBe(403)
      expect(ran(/UPDATE submissions/)).toBe(false)
      expect(ran(/selected_results/)).toBe(false)
    })
  }

  it("lets a candidate approve their own team's valid submission", async () => {
    const res = await review('approve')
    expect(res.status).toBe(200)
    expect(ran(/UPDATE submissions\s+SET status = \$1/)).toBe(true)
  })

  it('refuses to approve a submission with no figures', async () => {
    results = []
    const res = await review('approve')
    expect(res.status).toBe(400)
    expect(ran(/UPDATE submissions/)).toBe(false)
  })

  it('refuses to let a candidate approve figures that failed validation', async () => {
    results = [{ is_valid: false }]
    const res = await review('approve')
    expect(res.status).toBe(400)
  })

  it('lets an admin approve figures that failed validation as a manual override', async () => {
    caller = { userId: 1, role: 'admin', email: 'a@test.local' }
    sub = submission({ candidate_id: 99 })
    results = [{ is_valid: false }]
    const res = await review('approve')
    expect(res.status).toBe(200)
  })

  it('refuses to review a version that was replaced by a correction', async () => {
    sub = submission({ superseded_by_submission_id: 501 })
    const res = await review('approve')
    expect(res.status).toBe(409)
  })
})

describe('result entry', () => {
  let sub: Record<string, unknown>

  const valid = {
    submission_id: 500,
    position: 'mp',
    registered_voters: 200,
    total_votes_cast: 100,
    valid_votes: 95,
    rejected_votes: 5,
    candidate_votes: [
      { candidate_name: 'A', votes: 60 },
      { candidate_name: 'B', votes: 35 },
    ],
  }

  beforeEach(() => {
    handlers.length = 0
    executed.length = 0
    // An admin avoids the reporting-window machinery, which is tested
    // elsewhere; the figure handling is the same for every role.
    caller = { userId: 1, role: 'admin', email: 'a@test.local' }
    sub = submission({ status: 'verified' })
    handlers.push(
      { match: /SELECT \* FROM submissions WHERE id/, rows: () => [sub] },
      { match: /SELECT registered_voters FROM polling_stations/, rows: () => [{ registered_voters: 200 }] },
      { match: /SELECT c\.position FROM candidates/, rows: () => [{ position: 'mp' }] },
      { match: /INSERT INTO results/, rows: () => [{ id: 900 }] }
    )
  })

  it('refuses negative votes', async () => {
    const res = await resultsPost(
      post('/api/results', {
        ...valid,
        valid_votes: 95,
        candidate_votes: [
          { candidate_name: 'Rival', votes: -5000 },
          { candidate_name: 'Us', votes: 5095 },
        ],
      })
    )
    expect(res.status).toBe(400)
    expect(ran(/INSERT INTO results/)).toBe(false)
  })

  it('refuses figures sent as text', async () => {
    const res = await resultsPost(
      post('/api/results', { ...valid, total_votes_cast: '070000', valid_votes: '07000' })
    )
    expect(res.status).toBe(400)
    expect(ran(/INSERT INTO results/)).toBe(false)
  })

  it('checks turnout against the station register, not the submitted one', async () => {
    const res = await resultsPost(
      post('/api/results', {
        ...valid,
        registered_voters: 1_000_000,
        total_votes_cast: 900,
        valid_votes: 900,
        rejected_votes: 0,
        candidate_votes: [{ candidate_name: 'A', votes: 900 }],
      })
    )
    expect(res.status).toBeLessThan(500)
    const insert = executed.find((q) => /INSERT INTO results/.test(q.text))
    expect(insert?.params?.[3]).toBe(200) // the station's register
    expect(insert?.params?.[7]).toBe(false) // turnout above the register is invalid
  })

  it('does not select invalid figures for an already approved submission, and flags it', async () => {
    const res = await resultsPost(
      post('/api/results', { ...valid, total_votes_cast: 300, valid_votes: 295 })
    )
    expect(res.status).toBeLessThan(500)
    expect(ran(/INSERT INTO selected_results/)).toBe(false)
    expect(ran(/UPDATE submissions SET status = 'flagged'/)).toBe(true)
  })

  it('selects valid figures for an approved submission', async () => {
    const res = await resultsPost(post('/api/results', valid))
    expect(res.status).toBeLessThan(500)
    expect(ran(/INSERT INTO selected_results/)).toBe(true)
  })

  it('ignores manually_verified from a non-admin', async () => {
    caller = { userId: 300, role: 'candidate', email: 'c@test.local' }
    sub = submission({ status: 'verified', user_id: 300 })
    await resultsPost(post('/api/results', { ...valid, manually_verified: true }))
    const insert = executed.find((q) => /INSERT INTO results/.test(q.text))
    expect(insert?.params?.[9]).toBe(false)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Resolving an agent-versus-fallback conflict rewrites the station's selected
 * result, so it must only select a result that may count, and must be final.
 */

const executed: Array<{ text: string; params?: any[] }> = []
let conflict: Record<string, unknown>
let submissions: Array<Record<string, unknown>>

function run(text: string, params?: any[]) {
  executed.push({ text, params })
  let rows: any[] = []
  if (/FROM discrepancies/.test(text)) rows = [conflict]
  else if (/FROM candidates c/.test(text)) rows = [{ '?column?': 1 }] // in scope
  else if (/FROM submissions\s+WHERE id = ANY/.test(text)) rows = submissions
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

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => 1),
  notifyAdmins: vi.fn(async () => undefined),
  notifySubmissionOwner: vi.fn(async () => undefined),
}))

const { resolveSubmissionConflict } = await import('@/lib/fallback')

const AGENT = { id: 1, status: 'verified', submission_origin: 'agent', submission_type: 'primary', superseded_by_submission_id: null }
const OBSERVER = { id: 2, status: 'pending', submission_origin: 'observer', submission_type: 'primary', superseded_by_submission_id: null }

const resolve = (action: 'accept_agent' | 'keep_fallback') =>
  resolveSubmissionConflict({ conflictId: 9, candidateId: 10, actorId: 100, action })

const selected = () => executed.some((q) => /INSERT INTO selected_results/.test(q.text))

describe('resolveSubmissionConflict', () => {
  beforeEach(() => {
    executed.length = 0
    conflict = { id: 9, polling_station_id: 7, position: 'president', primary_submission_id: 1, backup_submission_id: 2, status: 'open' }
    submissions = [AGENT, OBSERVER]
  })

  it('accepts an approved, current agent result', async () => {
    const result = await resolve('accept_agent')
    expect(result.ok).toBe(true)
    expect(selected()).toBe(true)
  })

  it('treats a conflict resolved in favour of the agent as final', async () => {
    conflict.status = 'confirmed_error'
    const result = await resolve('keep_fallback')
    expect(result.ok).toBe(false)
    expect(result.code).toBe('already_resolved')
    expect(selected()).toBe(false)
  })

  it('refuses to accept an agent result that is not approved', async () => {
    submissions = [{ ...AGENT, status: 'pending' }, OBSERVER]
    const result = await resolve('accept_agent')
    expect(result.ok).toBe(false)
    expect(selected()).toBe(false)
  })

  it('refuses to accept an agent result that was replaced by a correction', async () => {
    submissions = [{ ...AGENT, superseded_by_submission_id: 3 }, OBSERVER]
    expect((await resolve('accept_agent')).ok).toBe(false)
    expect(selected()).toBe(false)
  })

  it('refuses to keep a "fallback" that is really another agent result', async () => {
    submissions = [AGENT, { ...OBSERVER, submission_origin: 'agent' }]
    const result = await resolve('keep_fallback')
    expect(result.ok).toBe(false)
    expect(selected()).toBe(false)
  })

  it('keeps a real observer fallback', async () => {
    const result = await resolve('keep_fallback')
    expect(result.ok).toBe(true)
    expect(selected()).toBe(true)
  })
})

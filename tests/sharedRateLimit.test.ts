import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The shared limiter counts in Postgres so all server instances see the same
 * count, and falls back to the in-memory limit when the database is not
 * available.
 */

const calls: Array<{ text: string; params?: any[] }> = []
let dbCount: number | Error = 1

vi.mock('@/lib/db', () => ({
  queryOne: vi.fn(async (text: string, params?: any[]) => {
    calls.push({ text, params })
    if (dbCount instanceof Error) throw dbCount
    return { count: dbCount, reset_at_ms: String(Date.now() + 60_000) }
  }),
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
}))

const { checkSharedRateLimit } = await import('@/lib/sharedRateLimit')

let n = 0
const freshKey = () => `test:${++n}:203.0.113.1`

beforeEach(() => {
  calls.length = 0
  dbCount = 1
})

describe('checkSharedRateLimit', () => {
  it('blocks when the shared count is over the limit, even if this instance has seen nothing', async () => {
    dbCount = 11 // ten requests already counted on other instances
    const result = await checkSharedRateLimit(freshKey(), 10, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('allows while the shared count is within the limit', async () => {
    dbCount = 3
    const result = await checkSharedRateLimit(freshKey(), 10, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(7)
  })

  it('stores a hash of the key, never the IP or email in it', async () => {
    const key = 'login:203.0.113.1:user@example.com'
    await checkSharedRateLimit(key, 10, 60_000)
    expect(calls[0].params![0]).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(calls[0].params)).not.toContain('user@example.com')
  })

  it('falls back to the in-memory limit when the database fails', async () => {
    dbCount = new Error('relation "rate_limit_buckets" does not exist')
    const key = freshKey()
    const first = await checkSharedRateLimit(key, 1, 60_000)
    const second = await checkSharedRateLimit(key, 1, 60_000)
    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(false)
  })

  it('refuses a flood on this instance without touching the database', async () => {
    const key = freshKey()
    await checkSharedRateLimit(key, 1, 60_000)
    calls.length = 0
    const result = await checkSharedRateLimit(key, 1, 60_000)
    expect(result.allowed).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

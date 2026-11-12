import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

/**
 * The public polling-station list returned every station in the country
 * when called without a filter. A filter is now required and the result is
 * capped.
 */

const executed: Array<{ text: string; params?: any[] }> = []

vi.mock('@/lib/authenticate', () => ({ authenticateRequest: vi.fn(async () => null) }))

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    return { rows: [], rowCount: 0 }
  }),
  queryOne: vi.fn(async () => null),
}))

const { GET } = await import('@/app/api/locations/polling-stations/route')

beforeEach(() => {
  executed.length = 0
})

describe('GET /api/locations/polling-stations', () => {
  it('refuses a request without a ward, constituency or county', async () => {
    const res = await GET(new NextRequest('http://localhost/api/locations/polling-stations'))
    expect(res.status).toBe(400)
    expect(executed).toHaveLength(0)
  })

  it('lists the stations of a ward, with a row cap', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/locations/polling-stations?ward_id=1400')
    )
    expect(res.status).toBe(200)
    expect(executed[0].text).toMatch(/LIMIT \d+/)
    expect(executed[0].params).toEqual(['1400'])
  })
})

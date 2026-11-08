import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Location filters on the ballot candidate listing.
 *
 * The admin table shows every ballot candidate by default. Filtering it in the
 * browser is not enough: the page may hold thousands of rows, and the position
 * and electoral area are known to the API. These tests pin down that
 * `county_id`, `constituency_id` and `ward_id` become part of the SQL query
 * and that malformed ids are ignored instead of reaching PostgreSQL.
 */

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

interface QueryHandler {
  match: RegExp
  handler: (text: string, params?: any[]) => any
}

const handlers: QueryHandler[] = []
const executed: Array<{ text: string; params?: any[] }> = []

function respond(rows: any[]) {
  return { rows, rowCount: rows.length }
}

function emptyResult() {
  return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] }
}

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    for (const entry of handlers) {
      if (entry.match.test(text)) {
        const result = entry.handler(text, params)
        return result && result.rows ? result : respond(result || [])
      }
    }
    return emptyResult()
  }),
  queryOne: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    for (const entry of handlers) {
      if (entry.match.test(text)) {
        const result = entry.handler(text, params)
        const rows = result && result.rows ? result.rows : result || []
        return rows[0] || null
      }
    }
    return null
  }),
  queryMany: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    for (const entry of handlers) {
      if (entry.match.test(text)) {
        const result = entry.handler(text, params)
        const rows = result && result.rows ? result.rows : result || []
        return Array.isArray(rows) ? rows : []
      }
    }
    return []
  }),
}))

import { generateToken } from '@/lib/auth'
import { GET as ballotGet } from '@/app/api/ballot-candidates/route'

const ADMIN = { id: 1, role: 'admin' as const }

function token(user: { id: number; role: string }) {
  return generateToken({
    userId: user.id,
    email: `${user.role}@test.local`,
    role: user.role as any,
  })
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { authorization: `Bearer ${token(ADMIN)}` },
  })
}

function listQuery() {
  return executed.find((entry) => /FROM candidates c/.test(entry.text))
}

beforeEach(() => {
  handlers.length = 0
  executed.length = 0
  // The authentication helper re-checks the account in the database.
  handlers.push({
    match: /SELECT id, email, role, active, token_version[\s\S]*FROM users/,
    handler: () => [
      {
        id: ADMIN.id,
        email: 'admin@test.local',
        role: 'admin',
        active: true,
        token_version: 1,
      },
    ],
  })
  handlers.push({
    match: /FROM candidates c/,
    handler: () => [],
  })
})

describe('GET /api/ballot-candidates location filters', () => {
  it('filters by position, county, constituency and ward', async () => {
    const response = await ballotGet(
      request(
        '/api/ballot-candidates?position=mca&county_id=28&constituency_id=150&ward_id=1181'
      )
    )

    expect(response.status).toBe(200)
    const query = listQuery()
    expect(query).toBeDefined()
    expect(query!.text).toContain('c.position = $1')
    expect(query!.text).toContain('c.county_id = $2')
    expect(query!.text).toContain('c.constituency_id = $3')
    expect(query!.text).toContain('c.ward_id = $4')
    expect(query!.params).toEqual(['mca', 28, 150, 1181])
  })

  it('filters by a single location level', async () => {
    await ballotGet(request('/api/ballot-candidates?ward_id=3505'))

    const query = listQuery()
    expect(query).toBeDefined()
    expect(query!.text).toContain('c.ward_id = $1')
    expect(query!.params).toEqual([3505])
  })

  it('ignores location ids that are not positive integers', async () => {
    await ballotGet(
      request(
        '/api/ballot-candidates?county_id=abc&constituency_id=-3&ward_id=0'
      )
    )

    const query = listQuery()
    expect(query).toBeDefined()
    expect(query!.text).not.toContain('AND c.county_id =')
    expect(query!.text).not.toContain('AND c.constituency_id =')
    expect(query!.text).not.toContain('AND c.ward_id =')
    expect(query!.params).toEqual([])
  })

  it('returns every ballot candidate when no filters are supplied', async () => {
    await ballotGet(request('/api/ballot-candidates'))

    const query = listQuery()
    expect(query).toBeDefined()
    expect(query!.text).toContain('c.is_system_user = false')
    expect(query!.text).toContain('c.is_placeholder = false')
    expect(query!.params).toEqual([])
  })
})

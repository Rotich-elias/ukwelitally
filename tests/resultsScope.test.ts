import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Reporting scope of results and polling station endpoints.
 *
 * A submission belongs to one candidate and therefore to one race. Counting
 * every submission at a polling station lets a presidential submission mark
 * the same station as reported for an MCA race, which inflates the MCA
 * dashboard. These tests pin down that the position is part of the counting
 * scope, and that a candidate cannot escape their own race by changing the
 * query string.
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

const client = {
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
        return rows
      }
    }
    return []
  }),
  transaction: vi.fn(async (callback: (c: any) => Promise<any>) => callback(client)),
}))

import { generateToken } from '@/lib/auth'
import { GET as aggregateGet } from '@/app/api/results/aggregate/route'
import { GET as reportingStatusGet } from '@/app/api/polling-stations/reporting-status/route'
import { GET as detailedResultsGet } from '@/app/api/polling-stations/[id]/detailed-results/route'

const ADMIN = { id: 1, role: 'admin' as const }
const CANDIDATE = { id: 10, role: 'candidate' as const }

function token(user: { id: number; role: string }) {
  return generateToken({
    userId: user.id,
    email: `${user.role}@test.local`,
    role: user.role as any,
  })
}

function request(path: string, user?: { id: number; role: string }) {
  return new NextRequest(`http://localhost${path}`, {
    headers: user ? { authorization: `Bearer ${token(user)}` } : {},
  })
}

function register(...entries: QueryHandler[]) {
  handlers.push(...entries)
}

function queriesMatching(pattern: RegExp) {
  return executed.filter((entry) => pattern.test(entry.text))
}

beforeEach(() => {
  handlers.length = 0
  executed.length = 0
})

describe('GET /api/results/aggregate', () => {
  function aggregateHandlers() {
    register(
      {
        match: /WITH scoped_results AS/,
        handler: () => [
          {
            stations_reporting: 0,
            total_votes_cast: 0,
            total_valid_votes: 0,
            total_rejected_votes: 0,
            reported_registered_voters: 0,
          },
        ],
      },
      {
        match: /COUNT\(\*\) FILTER \(WHERE sel\.source/,
        handler: () => [{ agent_primary: 0, observer_fallback: 0 }],
      },
      {
        match: /COUNT\(DISTINCT ps\.id\) as total_stations/,
        handler: () => [{ total_stations: 10, total_registered_voters: 1000 }],
      },
      {
        match: /as stations_with_submissions/,
        handler: () => [{ total: 1 }],
      },
      {
        match: /WITH candidate_meta AS/,
        handler: () => [],
      }
    )
  }

  it('counts only submissions from the requested position', async () => {
    aggregateHandlers()

    const response = await aggregateGet(request('/api/results/aggregate?position=mca&ward_id=5'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary.stations_reported).toBe(1)

    const [submittedQuery] = queriesMatching(/as stations_with_submissions/)
    expect(submittedQuery).toBeDefined()
    expect(submittedQuery.text).toContain('c.position = $1')
    expect(submittedQuery.params).toEqual(['mca', 5])
  })

  it('forces a candidate to their own position', async () => {
    register({
      match: /SELECT position, county_id, constituency_id, ward_id\s+FROM candidates/,
      handler: () => [
        { position: 'mca', county_id: 1, constituency_id: 2, ward_id: 5 },
      ],
    })
    aggregateHandlers()

    await aggregateGet(
      request('/api/results/aggregate?position=president&county_id=1', CANDIDATE)
    )

    const [submittedQuery] = queriesMatching(/as stations_with_submissions/)
    expect(submittedQuery).toBeDefined()
    expect(submittedQuery.params?.[0]).toBe('mca')
    expect(submittedQuery.params?.[1]).toBe(5)
  })
})

describe('GET /api/polling-stations/reporting-status', () => {
  function reportingHandlers() {
    register(
      {
        match: /COUNT\(s\.id\) as submission_count/,
        handler: () => [],
      },
      {
        match: /COUNT\(DISTINCT ps\.id\) as total/,
        handler: () => [{ total: 10 }],
      },
      {
        match: /as stations_with_submissions/,
        handler: () => [{ total: 1 }],
      },
      {
        match: /COUNT\(DISTINCT CASE WHEN s\.status = 'verified'/,
        handler: () => [{ verified: 1, pending: 0, flagged: 0 }],
      }
    )
  }

  it('filters station counts by position', async () => {
    reportingHandlers()

    const response = await reportingStatusGet(
      request('/api/polling-stations/reporting-status?position=mca&ward_id=5', ADMIN)
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary.submitted_stations).toBe(1)

    for (const pattern of [
      /COUNT\(s\.id\) as submission_count/,
      /as stations_with_submissions/,
      /COUNT\(DISTINCT CASE WHEN s\.status = 'verified'/,
    ]) {
      const [query] = queriesMatching(pattern)
      expect(query).toBeDefined()
      expect(query.text).toContain('candidates WHERE position')
      expect(query.params).toContain('mca')
    }

    // The unfiltered station total must not receive the position parameter.
    const [totalQuery] = queriesMatching(/COUNT\(DISTINCT ps\.id\) as total/)
    expect(totalQuery.params).toEqual([5])
  })

  it('forces a candidate to their own position and area', async () => {
    register({
      match: /SELECT position, county_id, constituency_id, ward_id\s+FROM candidates/,
      handler: () => [{ position: 'mca', county_id: 1, constituency_id: 2, ward_id: 5 }],
    })
    reportingHandlers()

    await reportingStatusGet(
      request('/api/polling-stations/reporting-status?position=president&county_id=1', CANDIDATE)
    )

    const [stationsQuery] = queriesMatching(/COUNT\(s\.id\) as submission_count/)
    expect(stationsQuery.params).toEqual([5, 'mca'])
  })
})

describe('GET /api/polling-stations/[id]/detailed-results', () => {
  it('limits submissions to the requested position', async () => {
    register(
      {
        match: /FROM polling_stations ps\s+JOIN wards/,
        handler: () => [
          {
            id: 55,
            name: 'Test Station',
            code: 'PS55',
            registered_voters: 900,
            ward_id: 5,
            constituency_id: 2,
            county_id: 1,
          },
        ],
      },
      {
        match: /FROM submissions s/,
        handler: () => [],
      }
    )

    const response = await detailedResultsGet(
      request('/api/polling-stations/55/detailed-results?position=mca', ADMIN),
      { params: Promise.resolve({ id: '55' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.submission_count).toBe(0)

    const [submissionsQuery] = queriesMatching(/FROM submissions s/)
    expect(submissionsQuery.text).toContain('c.position = $2')
    expect(submissionsQuery.params).toEqual([55, 'mca'])
  })
})

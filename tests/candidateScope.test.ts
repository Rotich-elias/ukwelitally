import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The candidate list used by agents and observers to enter votes.
 *
 * It must contain the candidates of the race the field user is assigned to,
 * not every candidate of that position in the country. An agent for a Sacho
 * ward candidate must never be offered Chepkorio ward candidates.
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
import { GET as candidatesGet } from '@/app/api/candidates/route'

const ADMIN = { id: 1, role: 'admin' as const }
const CANDIDATE = { id: 10, role: 'candidate' as const }
const AGENT = { id: 20, role: 'agent' as const }
const OBSERVER = { id: 30, role: 'observer' as const }

function token(user: { id: number; role: string }) {
  return generateToken({
    userId: user.id,
    email: `${user.role}@test.local`,
    role: user.role as any,
  })
}

function request(path: string, user: { id: number; role: string }) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { authorization: `Bearer ${token(user)}` },
  })
}

function register(...entries: QueryHandler[]) {
  handlers.push(...entries)
}

function listQueries() {
  return executed.filter((entry) => /WHERE c\.is_placeholder = false/.test(entry.text))
}

beforeEach(() => {
  handlers.length = 0
  executed.length = 0
  // The authentication helper re-checks the account in the database.
  handlers.push({
    match: /SELECT id, email, role, active, token_version[\s\S]*FROM users/,
    handler: (_text, params) => {
      const user = [ADMIN, CANDIDATE, AGENT, OBSERVER].find(
        (candidate) => candidate.id === params?.[0]
      )
      if (!user) return []
      return [
        {
          id: user.id,
          email: `${user.role}${user.id}@test.local`,
          role: user.role,
          active: true,
          token_version: 1,
        },
      ]
    },
  })
})

const SACHO_AGENT_SCOPE = {
  position: 'mca',
  county_id: 30,
  constituency_id: 159,
  ward_id: 3505,
  county_name: 'Baringo',
  constituency_name: 'Baringo Central',
  ward_name: 'Sacho',
  candidate_name: 'ZAKAYO KANDAGOR',
}

describe('GET /api/candidates', () => {
  it('scopes an agent to the ward of their candidate, ignoring the query string', async () => {
    register(
      {
        match: /FROM agents a[\s\S]*JOIN candidates c ON c\.id = a\.candidate_id/,
        handler: () => [SACHO_AGENT_SCOPE],
      },
      {
        match: /WHERE c\.is_placeholder = false/,
        handler: () => [],
      }
    )

    const response = await candidatesGet(
      request('/api/candidates?position=president&ward_id=999', AGENT)
    )

    expect(response.status).toBe(200)
    const [query] = listQueries()
    expect(query).toBeDefined()
    expect(query.text).toContain('c.position = $1')
    expect(query.text).toContain('c.ward_id = $2')
    expect(query.params).toEqual(['mca', '3505'])
  })

  it('scopes an observer to their station ward for the race they selected', async () => {
    register(
      {
        match: /FROM observer_assignments oa[\s\S]*JOIN polling_stations ps/,
        handler: () => [
          {
            ward_id: 3505,
            constituency_id: 159,
            county_id: 30,
            ward_name: 'Sacho',
            constituency_name: 'Baringo Central',
            county_name: 'Baringo',
          },
        ],
      },
      {
        match: /WHERE c\.is_placeholder = false/,
        handler: () => [],
      }
    )

    const response = await candidatesGet(
      request('/api/candidates?position=mca&ward_id=999', OBSERVER)
    )

    expect(response.status).toBe(200)
    const [query] = listQueries()
    expect(query).toBeDefined()
    expect(query.params).toEqual(['mca', '3505'])
  })

  it('scopes a candidate to their own race', async () => {
    register(
      {
        match: /SELECT position, county_id, constituency_id, ward_id\s+FROM candidates/,
        handler: () => [
          { position: 'mp', county_id: 1, constituency_id: 628, ward_id: null },
        ],
      },
      {
        match: /WHERE c\.is_placeholder = false/,
        handler: () => [],
      }
    )

    const response = await candidatesGet(
      request('/api/candidates?position=president&county_id=99', CANDIDATE)
    )

    expect(response.status).toBe(200)
    const [query] = listQueries()
    expect(query).toBeDefined()
    expect(query.params).toEqual(['mp', '628'])
  })

  it('returns no candidates when a field user has no active assignment', async () => {
    register({
      match: /FROM agents a[\s\S]*JOIN candidates c ON c\.id = a\.candidate_id/,
      handler: () => [],
    })

    const response = await candidatesGet(
      request('/api/candidates?position=mca', AGENT)
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.candidates).toEqual([])
    expect(listQueries()).toHaveLength(0)
  })

  it('includes ballot candidates and active account candidates', async () => {
    register(
      {
        match: /FROM agents a[\s\S]*JOIN candidates c ON c\.id = a\.candidate_id/,
        handler: () => [SACHO_AGENT_SCOPE],
      },
      {
        match: /WHERE c\.is_placeholder = false/,
        handler: () => [],
      }
    )

    await candidatesGet(request('/api/candidates?position=mca', AGENT))

    const [query] = listQueries()
    expect(query).toBeDefined()
    // Placeholder rows stay hidden, but the candidates with accounts are
    // ballot entries too and must be listed so their votes can be entered.
    expect(query.text).toContain('c.is_placeholder = false')
    expect(query.text).toContain('u.active = true')
    expect(query.text).not.toMatch(/WHERE c\.is_system_user = false/)
  })

  it('keeps the explicit filters for administrators', async () => {
    register({
      match: /WHERE c\.is_placeholder = false/,
      handler: () => [],
    })

    await candidatesGet(
      request('/api/candidates?position=mca&ward_id=1181', ADMIN)
    )

    const [query] = listQueries()
    expect(query).toBeDefined()
    expect(query.params).toEqual(['mca', '1181'])
  })
})

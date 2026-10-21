import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The scope a candidate may assign agents in.
 *
 * The scope follows from the candidate's own race and electoral area, so the
 * candidate never has to pick the county, constituency and ward they already
 * belong to. The same scope is applied on the server, so the list and the
 * assignment API can never disagree.
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
import {
  scopeLevelForPosition,
  isStationInScope,
  listAssignableStations,
  type AssignmentScope,
} from '@/lib/agentScope'
import { GET as stationsGet } from '@/app/api/candidates/stations/route'
import { POST as agentsPost } from '@/app/api/candidates/agents/route'

const CANDIDATE_USER = { id: 100, role: 'candidate' as const }

const WARD_SCOPE: AssignmentScope = {
  position: 'mca',
  level: 'ward',
  label: 'Changamwe Ward 1',
  county_id: 201,
  constituency_id: 628,
  ward_id: 2660,
  national: false,
}

function token(user: { id: number; role: string }) {
  return generateToken({
    userId: user.id,
    email: `${user.role}@test.local`,
    role: user.role as any,
  })
}

function request(path: string, user: { id: number; role: string }, init: any = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: init.method || 'GET',
    body: init.body,
    headers: {
      authorization: `Bearer ${token(user)}`,
      ...(init.headers || {}),
    },
  })
}

/** The candidate profile, per position. */
const CANDIDATES: Record<string, any> = {
  mca: {
    id: 10,
    user_id: 100,
    full_name: 'Ward Candidate',
    party_name: 'Party',
    position: 'mca',
    county_id: 201,
    constituency_id: 628,
    ward_id: 2660,
    access_status: 'active',
  },
  mp: {
    id: 11,
    user_id: 100,
    full_name: 'Constituency Candidate',
    party_name: 'Party',
    position: 'mp',
    county_id: 201,
    constituency_id: 628,
    ward_id: null,
    access_status: 'active',
  },
  governor: {
    id: 12,
    user_id: 100,
    full_name: 'County Candidate',
    party_name: 'Party',
    position: 'governor',
    county_id: 201,
    constituency_id: null,
    ward_id: null,
    access_status: 'active',
  },
  president: {
    id: 13,
    user_id: 100,
    full_name: 'National Candidate',
    party_name: 'Party',
    position: 'president',
    county_id: null,
    constituency_id: null,
    ward_id: null,
    access_status: 'active',
  },
}

let candidatePosition = 'mca'

function baseHandlers(overrides: QueryHandler[] = []) {
  handlers.length = 0
  handlers.push(...overrides)
  handlers.push(
    {
      // The candidate profile.
      match: /FROM candidates c\s+JOIN users u ON u\.id = c\.user_id/,
      handler: () => [CANDIDATES[candidatePosition]],
    },
    {
      // The candidate row the agent route looks up.
      match: /SELECT id FROM candidates WHERE user_id = \$1/,
      handler: () => [{ id: CANDIDATES[candidatePosition].id }],
    },
    {
      // The names of the area.
      match: /SELECT co\.name as county_name, con\.name as constituency_name, w\.name as ward_name/,
      handler: () => [
        { county_name: 'Mombasa County', constituency_name: 'Changamwe', ward_name: 'Changamwe Ward 1' },
      ],
    },
    {
      match: /FROM polling_stations ps\s+JOIN wards w ON ps\.ward_id = w\.id/,
      handler: () => [
        {
          id: 4447,
          name: 'In Scope Station',
          code: 'PS000001',
          registered_voters: 900,
          ward_id: 2660,
          ward_name: 'Changamwe Ward 1',
          constituency_id: 628,
          constituency_name: 'Changamwe',
          county_id: 201,
          county_name: 'Mombasa County',
        },
      ],
    },
    {
      // The scope check for a single station.
      match: /SELECT ps\.ward_id, w\.constituency_id, co\.id as county_id/,
      handler: () => [
        {
          id: 4447,
          name: 'In Scope Station',
          code: 'PS000001',
          registered_voters: 900,
          ward_id: 2660,
          constituency_id: 628,
          county_id: 201,
        },
      ],
    }
  )
  executed.length = 0
}

describe('scopeLevelForPosition', () => {
  it('gives each race the scope the database enforces', () => {
    expect(scopeLevelForPosition('mca')).toBe('ward')
    expect(scopeLevelForPosition('mp')).toBe('constituency')
    expect(scopeLevelForPosition('governor')).toBe('county')
    expect(scopeLevelForPosition('senator')).toBe('county')
    expect(scopeLevelForPosition('women_rep')).toBe('county')
    expect(scopeLevelForPosition('president')).toBe('national')
  })
})

describe('listAssignableStations', () => {
  beforeEach(() => {
    baseHandlers()
  })

  it('restricts a member of county assembly to the stations of their ward', async () => {
    const stations = await listAssignableStations(WARD_SCOPE)

    expect(stations).toHaveLength(1)
    const query = executed.find((entry) => /FROM polling_stations ps/.test(entry.text))
    expect(query?.text).toContain('ps.ward_id = $1')
    expect(query?.params?.[0]).toBe(2660)
  })

  it('restricts a member of parliament to the stations of their constituency', async () => {
    const stations = await listAssignableStations({
      ...WARD_SCOPE,
      level: 'constituency',
      ward_id: null,
    })

    expect(stations).toHaveLength(1)
    const query = executed.find((entry) => /FROM polling_stations ps/.test(entry.text))
    expect(query?.text).toContain('w.constituency_id = $1')
    expect(query?.params?.[0]).toBe(628)
  })

  it('restricts a county level candidate to the stations of their county', async () => {
    const stations = await listAssignableStations({
      ...WARD_SCOPE,
      level: 'county',
      constituency_id: null,
      ward_id: null,
    })

    expect(stations).toHaveLength(1)
    const query = executed.find((entry) => /FROM polling_stations ps/.test(entry.text))
    expect(query?.text).toContain('co.id = $1')
    expect(query?.params?.[0]).toBe(201)
  })

  it('lets a presidential candidate search the whole country', async () => {
    const stations = await listAssignableStations({
      ...WARD_SCOPE,
      level: 'national',
      label: 'All polling stations in the country',
      county_id: null,
      constituency_id: null,
      ward_id: null,
      national: true,
    })

    expect(stations).toHaveLength(1)
    const query = executed.find((entry) => /FROM polling_stations ps/.test(entry.text))
    // No scope condition, only the search.
    expect(query?.text).not.toContain('ps.ward_id = $1')
    expect(query?.text).not.toContain('w.constituency_id = $1')
    expect(query?.text).not.toContain('co.id = $1')
  })

  it('applies the search on the server', async () => {
    await listAssignableStations(WARD_SCOPE, { search: 'Youth' })

    const query = executed.find((entry) => /FROM polling_stations ps/.test(entry.text))
    expect(query?.text).toContain('ps.name ILIKE')
    expect(query?.params).toContain('%Youth%')
  })
})

describe('isStationInScope', () => {
  beforeEach(() => {
    baseHandlers()
  })

  it('accepts a station inside the scope', async () => {
    expect(await isStationInScope(WARD_SCOPE, 4447)).toBe(true)
  })

  it('refuses a station outside the scope', async () => {
    baseHandlers([
      {
        match: /SELECT ps\.ward_id, w\.constituency_id, co\.id as county_id/,
        handler: () => [
          {
            id: 4461,
            name: 'Out Of Scope Station',
            code: 'PS000015',
            registered_voters: 800,
            ward_id: 9999,
            constituency_id: 9999,
            county_id: 9999,
          },
        ],
      },
    ])

    expect(await isStationInScope(WARD_SCOPE, 4461)).toBe(false)
  })

  it('refuses a station that does not exist', async () => {
    baseHandlers([
      {
        match: /SELECT ps\.ward_id, w\.constituency_id, co\.id as county_id/,
        handler: () => [],
      },
    ])

    expect(await isStationInScope(WARD_SCOPE, 123456)).toBe(false)
  })

  it('accepts any station for a presidential candidate', async () => {
    expect(
      await isStationInScope(
        { ...WARD_SCOPE, level: 'national', national: true, ward_id: null },
        4461
      )
    ).toBe(true)
  })
})

describe('the assignable stations route', () => {
  beforeEach(() => {
    baseHandlers()
  })

  it('returns the scope of the candidate', async () => {
    const response = await stationsGet(request('/api/candidates/stations', CANDIDATE_USER) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.scope.level).toBe('ward')
    expect(body.scope.label).toBe('Changamwe Ward 1')
    expect(body.stations).toHaveLength(1)
  })

  it('refuses a user who is not a candidate', async () => {
    const response = await stationsGet(
      request('/api/candidates/stations', { id: 5, role: 'agent' }) as any
    )

    expect(response.status).toBe(403)
  })
})

describe('the agent assignment route', () => {
  beforeEach(() => {
    baseHandlers([
      {
        match: /SELECT id FROM users WHERE email = \$1 OR phone = \$2 OR id_number = \$3/,
        handler: () => [],
      },
      {
        match: /SELECT id FROM agents\s+WHERE candidate_id = \$1 AND polling_station_id = \$2 AND is_primary = TRUE/,
        handler: () => [],
      },
      {
        match: /INSERT INTO users/,
        handler: () => [{ id: 900, email: 'agent@test.local' }],
      },
      {
        match: /INSERT INTO agents/,
        handler: () => [{ id: 77 }],
      },
      {
        match: /INSERT INTO audit_logs/,
        handler: () => [{ id: 1 }],
      },
    ])
  })

  const payload = (stationId: number) => ({
    email: 'new-agent@test.local',
    phone: '+25471110001',
    full_name: 'New Agent',
    id_number: '9711001',
    password: 'TestPass123!',
    polling_station_id: stationId,
  })

  it('creates an agent for a station inside the scope', async () => {
    const response = await agentsPost(
      request('/api/candidates/agents', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify(payload(4447)),
        headers: { 'content-type': 'application/json' },
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.success).toBe(true)
  })

  it('refuses a station outside the scope', async () => {
    baseHandlers([
      {
        match: /SELECT ps\.ward_id, w\.constituency_id, co\.id as county_id/,
        handler: () => [
          {
            id: 4461,
            name: 'Out Of Scope Station',
            code: 'PS000015',
            registered_voters: 800,
            ward_id: 9999,
            constituency_id: 9999,
            county_id: 9999,
          },
        ],
      },
      {
        match: /SELECT id FROM users WHERE email = \$1 OR phone = \$2 OR id_number = \$3/,
        handler: () => [],
      },
      {
        match: /INSERT INTO users/,
        handler: () => [{ id: 900, email: 'agent@test.local' }],
      },
      {
        match: /INSERT INTO agents/,
        handler: () => [{ id: 77 }],
      },
    ])

    const response = await agentsPost(
      request('/api/candidates/agents', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify(payload(4461)),
        headers: { 'content-type': 'application/json' },
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatch(/outside your electoral area/)
  })

  it('refuses a second primary agent at the same station', async () => {
    baseHandlers([
      {
        match: /SELECT id FROM agents\s+WHERE candidate_id = \$1 AND polling_station_id = \$2 AND is_primary = TRUE/,
        handler: () => [{ id: 5 }],
      },
      {
        match: /SELECT id FROM users WHERE email = \$1 OR phone = \$2 OR id_number = \$3/,
        handler: () => [],
      },
    ])

    const response = await agentsPost(
      request('/api/candidates/agents', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify(payload(4447)),
        headers: { 'content-type': 'application/json' },
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toMatch(/primary agent/)
  })
})

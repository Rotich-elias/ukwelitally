import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The administration of the electoral geography.
 *
 * The wards and the polling stations could only be changed with a script
 * that connected to the database. These tests cover the rules the new admin
 * endpoints enforce: the codes stay unique, a ward follows its constituency,
 * a station follows its ward, and a record that something depends on is not
 * deleted.
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

vi.mock('@/lib/audit', () => ({
  recordAudit: vi.fn(async () => undefined),
  auditRequestContext: vi.fn(() => ({ ipAddress: null, userAgent: null })),
}))

import { generateToken } from '@/lib/auth'
import { parseCsv, LocationError } from '@/lib/locationAdmin'
import { GET as wardsGet, POST as wardsPost } from '@/app/api/admin/locations/wards/route'
import { PUT as wardPut, DELETE as wardDelete } from '@/app/api/admin/locations/wards/[id]/route'
import {
  GET as stationsGet,
  POST as stationsPost,
} from '@/app/api/admin/locations/polling-stations/route'
import {
  PUT as stationPut,
  DELETE as stationDelete,
} from '@/app/api/admin/locations/polling-stations/[id]/route'
import { POST as importPost } from '@/app/api/admin/locations/import/route'

const ADMIN = { id: 2, role: 'admin' as const }
const CANDIDATE = { id: 100, role: 'candidate' as const }

function token(user: { id: number; role: string }) {
  return generateToken({
    userId: user.id,
    email: `${user.role}@test.local`,
    role: user.role as any,
  })
}

function request(path: string, user?: { id: number; role: string }, init: any = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: init.method || 'GET',
    body: init.body,
    headers: {
      ...(user ? { authorization: `Bearer ${token(user)}` } : {}),
      ...(init.headers || {}),
    },
  })
}

const WARD = {
  id: 2660,
  code: 'W0001',
  name: 'Changamwe Ward 1',
  constituency_id: 628,
  county_id: 201,
  registered_voters: 0,
}

function baseHandlers(overrides: QueryHandler[] = []) {
  handlers.length = 0
  handlers.push(...overrides)
  handlers.push(
    {
      match: /SELECT id, county_id FROM constituencies WHERE id = \$1/,
      handler: () => [{ id: 628, county_id: 201 }],
    },
    {
      match: /SELECT id, constituency_id, county_id FROM wards WHERE id = \$1/,
      handler: () => [{ id: 2660, constituency_id: 628, county_id: 201 }],
    },
    {
      match: /SELECT id FROM wards WHERE code = \$1/,
      handler: () => [],
    },
    {
      match: /SELECT id FROM polling_stations WHERE code = \$1/,
      handler: () => [],
    },
    {
      match: /SELECT id, code, name, constituency_id, county_id, registered_voters FROM wards WHERE id = \$1/,
      handler: () => [WARD],
    },
    {
      match: /SELECT id, code, name FROM wards WHERE id = \$1/,
      handler: () => [WARD],
    },
    {
      match: /SELECT id, code, name FROM polling_stations WHERE id = \$1/,
      handler: () => [
        {
          id: 4447,
          code: 'PS000001',
          name: 'Test Station',
          ward_id: 2660,
          constituency_id: 628,
          county_id: 201,
          latitude: 1.1,
          longitude: 39.7,
          registered_voters: 900,
          location_radius: 500,
        },
      ],
    },
    {
      match: /SELECT id, code, name, ward_id, constituency_id, county_id, latitude, longitude,\s+registered_voters, location_radius\s+FROM polling_stations WHERE id = \$1/,
      handler: () => [
        {
          id: 4447,
          code: 'PS000001',
          name: 'Test Station',
          ward_id: 2660,
          constituency_id: 628,
          county_id: 201,
          latitude: 1.1,
          longitude: 39.7,
          registered_voters: 900,
          location_radius: 500,
        },
      ],
    },
    {
      match: /SELECT COUNT\(\*\) AS total FROM polling_stations WHERE ward_id = \$1/,
      handler: () => [{ total: 0 }],
    },
    {
      match: /SELECT COUNT\(\*\) AS total FROM submissions WHERE polling_station_id = \$1/,
      handler: () => [{ total: 0 }],
    },
    {
      match: /SELECT COUNT\(\*\) AS total FROM agents WHERE polling_station_id = \$1/,
      handler: () => [{ total: 0 }],
    },
    {
      match: /INSERT INTO wards/,
      handler: () => [WARD],
    },
    {
      match: /UPDATE wards/,
      handler: () => [WARD],
    },
    {
      match: /INSERT INTO polling_stations/,
      handler: () => [
        {
          id: 4447,
          code: 'PS000001',
          name: 'Test Station',
          ward_id: 2660,
          constituency_id: 628,
          county_id: 201,
          latitude: 1.1,
          longitude: 39.7,
          registered_voters: 900,
          location_radius: 500,
        },
      ],
    },
    {
      match: /UPDATE polling_stations/,
      handler: () => [
        {
          id: 4447,
          code: 'PS000001',
          name: 'Test Station',
          ward_id: 2660,
          constituency_id: 628,
          county_id: 201,
          latitude: 1.1,
          longitude: 39.7,
          registered_voters: 900,
          location_radius: 500,
        },
      ],
    },
    {
      match: /DELETE FROM wards/,
      handler: () => [],
    },
    {
      match: /DELETE FROM polling_stations/,
      handler: () => [],
    }
  )
  executed.length = 0
}

describe('the ward endpoints', () => {
  beforeEach(() => {
    baseHandlers()
  })

  it('refuses a user who is not an administrator', async () => {
    const response = await wardsGet(request('/api/admin/locations/wards', CANDIDATE) as any)

    expect(response.status).toBe(403)
  })

  it('lists the wards for an administrator', async () => {
    const response = await wardsGet(request('/api/admin/locations/wards', ADMIN) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.wards).toBeDefined()
  })

  it('creates a ward with the county of its constituency', async () => {
    const response = await wardsPost(
      request('/api/admin/locations/wards', ADMIN, {
        method: 'POST',
        body: JSON.stringify({
          code: 'W9001',
          name: 'Test Ward',
          constituency_id: 628,
          registered_voters: 1200,
        }),
        headers: { 'content-type': 'application/json' },
      }) as any
    )

    expect(response.status).toBe(201)

    const insert = executed.find((entry) => /INSERT INTO wards/.test(entry.text))
    expect(insert?.params?.[3]).toBe(201) // the county of the constituency
  })

  it('refuses a duplicate code', async () => {
    baseHandlers([
      {
        match: /SELECT id FROM wards WHERE code = \$1/,
        handler: () => [{ id: 5 }],
      },
    ])

    const response = await wardsPost(
      request('/api/admin/locations/wards', ADMIN, {
        method: 'POST',
        body: JSON.stringify({ code: 'W0001', name: 'Test Ward', constituency_id: 628 }),
        headers: { 'content-type': 'application/json' },
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('duplicate_code')
  })

  it('refuses a ward without a name', async () => {
    const response = await wardsPost(
      request('/api/admin/locations/wards', ADMIN, {
        method: 'POST',
        body: JSON.stringify({ code: 'W9002', name: '', constituency_id: 628 }),
        headers: { 'content-type': 'application/json' },
      }) as any
    )

    expect(response.status).toBe(400)
  })

  it('moves the polling stations with the ward', async () => {
    baseHandlers([
      {
        match: /SELECT id, code, name, constituency_id, county_id, registered_voters FROM wards WHERE id = \$1/,
        handler: () => [WARD],
      },
      {
        match: /SELECT id, county_id FROM constituencies WHERE id = \$1/,
        handler: () => [{ id: 700, county_id: 800 }],
      },
    ])

    const response = await wardPut(
      request('/api/admin/locations/wards/2660', ADMIN, {
        method: 'PUT',
        body: JSON.stringify({ constituency_id: 700 }),
        headers: { 'content-type': 'application/json' },
      }) as any,
      { params: { id: '2660' } }
    )

    expect(response.status).toBe(200)

    const stationUpdate = executed.find((entry) =>
      /UPDATE polling_stations/.test(entry.text)
    )
    expect(stationUpdate).toBeDefined()
    expect(stationUpdate?.params?.[0]).toBe(700)
    expect(stationUpdate?.params?.[1]).toBe(800)
  })

  it('refuses to delete a ward that still has polling stations', async () => {
    baseHandlers([
      {
        match: /SELECT COUNT\(\*\) AS total FROM polling_stations WHERE ward_id = \$1/,
        handler: () => [{ total: 4 }],
      },
    ])

    const response = await wardDelete(
      request('/api/admin/locations/wards/2660', ADMIN, { method: 'DELETE' }) as any,
      { params: { id: '2660' } }
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('has_dependents')
  })

  it('deletes a ward that nothing depends on', async () => {
    const response = await wardDelete(
      request('/api/admin/locations/wards/2660', ADMIN, { method: 'DELETE' }) as any,
      { params: { id: '2660' } }
    )

    expect(response.status).toBe(200)
    expect(executed.some((entry) => /DELETE FROM wards/.test(entry.text))).toBe(true)
  })
})

describe('the polling station endpoints', () => {
  beforeEach(() => {
    baseHandlers()
  })

  it('refuses a user who is not an administrator', async () => {
    const response = await stationsGet(
      request('/api/admin/locations/polling-stations', CANDIDATE) as any
    )

    expect(response.status).toBe(403)
  })

  it('creates a polling station in a ward', async () => {
    const response = await stationsPost(
      request('/api/admin/locations/polling-stations', ADMIN, {
        method: 'POST',
        body: JSON.stringify({
          code: 'PS9001',
          name: 'New Station',
          ward_id: 2660,
          latitude: 1.2,
          longitude: 39.8,
        }),
        headers: { 'content-type': 'application/json' },
      }) as any
    )

    expect(response.status).toBe(201)

    const insert = executed.find((entry) => /INSERT INTO polling_stations/.test(entry.text))
    // The constituency and the county follow the ward.
    expect(insert?.params?.[3]).toBe(628)
    expect(insert?.params?.[4]).toBe(201)
  })

  it('refuses a duplicate code', async () => {
    baseHandlers([
      {
        match: /SELECT id FROM polling_stations WHERE code = \$1/,
        handler: () => [{ id: 5 }],
      },
    ])

    const response = await stationsPost(
      request('/api/admin/locations/polling-stations', ADMIN, {
        method: 'POST',
        body: JSON.stringify({ code: 'PS000001', name: 'New Station', ward_id: 2660 }),
        headers: { 'content-type': 'application/json' },
      }) as any
    )

    expect(response.status).toBe(409)
  })

  it('refuses to delete a polling station that has submissions', async () => {
    baseHandlers([
      {
        match: /SELECT COUNT\(\*\) AS total FROM submissions WHERE polling_station_id = \$1/,
        handler: () => [{ total: 2 }],
      },
    ])

    const response = await stationDelete(
      request('/api/admin/locations/polling-stations/4447', ADMIN, {
        method: 'DELETE',
      }) as any,
      { params: { id: '4447' } }
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('has_dependents')
  })

  it('refuses to delete a polling station that still has an agent', async () => {
    baseHandlers([
      {
        match: /SELECT COUNT\(\*\) AS total FROM agents WHERE polling_station_id = \$1/,
        handler: () => [{ total: 1 }],
      },
    ])

    const response = await stationDelete(
      request('/api/admin/locations/polling-stations/4447', ADMIN, {
        method: 'DELETE',
      }) as any,
      { params: { id: '4447' } }
    )

    expect(response.status).toBe(409)
  })

  it('moves a polling station to another ward', async () => {
    baseHandlers([
      {
        match: /SELECT id, constituency_id, county_id FROM wards WHERE id = \$1/,
        handler: () => [{ id: 2661, constituency_id: 700, county_id: 800 }],
      },
    ])

    const response = await stationPut(
      request('/api/admin/locations/polling-stations/4447', ADMIN, {
        method: 'PUT',
        body: JSON.stringify({ ward_id: 2661 }),
        headers: { 'content-type': 'application/json' },
      }) as any,
      { params: { id: '4447' } }
    )

    expect(response.status).toBe(200)

    const update = executed.find((entry) => /UPDATE polling_stations/.test(entry.text))
    expect(update?.params?.[2]).toBe(2661)
    expect(update?.params?.[3]).toBe(700)
    expect(update?.params?.[4]).toBe(800)
  })
})

describe('parseCsv', () => {
  it('reads the official IEBC header names', () => {
    const rows = parseCsv(
      'station_name,station_code,ward_name,latitude,longitude\nChangamwe 1,PS000001,Changamwe Ward 1,1.12,39.77'
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].station_code).toBe('PS000001')
    expect(rows[0].ward_name).toBe('Changamwe Ward 1')
  })

  it('handles quoted values', () => {
    const rows = parseCsv('name,code\n"Kibera, Market",PS1')

    expect(rows[0].name).toBe('Kibera, Market')
  })

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('LocationError', () => {
  it('carries the code and the details', () => {
    const error = new LocationError('has_dependents', 'Still used', { station_count: 3 })

    expect(error.code).toBe('has_dependents')
    expect(error.details?.station_count).toBe(3)
  })
})

/* -------------------------------------------------------------------------- */
/*                        The dry run of the CSV import                       */
/* -------------------------------------------------------------------------- */

/**
 * The handlers the planner of the import uses. The planner only reads, so
 * these are the lookups of the constituencies, of the wards and of the
 * codes.
 */
const IMPORT_HANDLERS: QueryHandler[] = [
  {
    match: /SELECT c\.id, c\.county_id, co\.name AS county_name/,
    handler: (_text, params) => {
      const name = String(params?.[0] ?? '').toUpperCase()
      if (name === 'TEST CONSTITUENCY') {
        return [{ id: 628, county_id: 201, county_name: 'Nairobi' }]
      }
      if (name === 'OTHER CONSTITUENCY') {
        return [{ id: 700, county_id: 800, county_name: 'Mombasa' }]
      }
      return []
    },
  },
  {
    match: /COALESCE\(MAX\(SUBSTRING\(code FROM 2\)::int\), 0\) \+ 1 AS next/,
    handler: () => [{ next: 1193 }],
  },
  {
    match: /SELECT id, code FROM wards/,
    handler: () => [],
  },
  {
    match: /SELECT w\.id, w\.constituency_id, c\.name AS constituency_name/,
    handler: (_text, params) => {
      const name = String(params?.[0] ?? '').toUpperCase()
      if (name === 'TEST WARD') {
        return [{ id: 2660, constituency_id: 628, constituency_name: 'Test Constituency' }]
      }
      if (name === 'OTHER WARD') {
        return [{ id: 2661, constituency_id: 700, constituency_name: 'Other Constituency' }]
      }
      return []
    },
  },
]

const WARDS_CSV = [
  'ward_name,constituency_name,county_name,registered_voters',
  'Kayole,Test Constituency,Nairobi,1500',
  'Kilimani,Test Constituency,Nairobi,1200',
].join('\n')

const STATIONS_CSV = [
  'station_name,station_code,ward_name,constituency_name,latitude,longitude,registered_voters',
  'Kayole Hall,PS000001,Test Ward,Test Constituency,-1.26,36.8,850',
].join('\n')

/** A request that imports a file, with or without writing it. */
function importRequest(
  type: string,
  dryRun: boolean,
  csv?: string,
  user: { id: number; role: string } = ADMIN
) {
  const form = new FormData()
  form.append('type', type)
  form.append('dry_run', dryRun ? 'true' : 'false')
  if (csv !== undefined) {
    form.append('file', new File([csv], 'locations.csv', { type: 'text/csv' }))
  }

  return new NextRequest('http://localhost/api/admin/locations/import', {
    method: 'POST',
    body: form,
    headers: { authorization: `Bearer ${token(user)}` },
  })
}

/** The statements that write to the database. */
function writes() {
  return executed.filter((entry) =>
    /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i.test(entry.text)
  )
}

describe('the dry run of the CSV import', () => {
  beforeEach(() => {
    baseHandlers(IMPORT_HANDLERS)
  })

  it('refuses a user who is not an administrator', async () => {
    const response = await importPost(
      importRequest('wards', true, WARDS_CSV, CANDIDATE) as any
    )

    expect(response.status).toBe(403)
  })

  it('reports what a valid ward file would do', async () => {
    const response = await importPost(importRequest('wards', true, WARDS_CSV) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dry_run).toBe(true)
    expect(body.total_rows).toBe(2)
    expect(body.valid_rows).toBe(2)
    expect(body.create).toBe(2)
    expect(body.update).toBe(0)
    expect(body.skip).toBe(0)
    expect(body.error_rows).toBe(0)
    expect(body.rows[0].action).toBe('create')
    expect(body.rows[0].code).toBe('W1193')
    expect(body.rows[1].code).toBe('W1194')
  })

  it('reports what a valid polling station file would do', async () => {
    const response = await importPost(
      importRequest('polling_stations', true, STATIONS_CSV) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.total_rows).toBe(1)
    expect(body.create).toBe(1)
    expect(body.skip).toBe(0)
    expect(body.rows[0].code).toBe('PS000001')
    expect(body.rows[0].parent).toBe('Test Ward')
  })

  it('writes nothing to the database', async () => {
    await importPost(importRequest('wards', true, WARDS_CSV) as any)
    await importPost(importRequest('polling_stations', true, STATIONS_CSV) as any)

    expect(writes()).toEqual([])
  })

  it('reports a code that is used twice in the file', async () => {
    const csv = [
      'ward_name,constituency_name,county_name,code',
      'Kayole,Test Constituency,Nairobi,W500',
      'Kilimani,Test Constituency,Nairobi,W500',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.skip).toBe(1)
    expect(body.error_rows).toBe(1)
    expect(body.valid_rows).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'duplicate_code')
    expect(issue.row).toBe(3)
    expect(issue.severity).toBe('error')
    expect(issue.message).toContain('W500')
    expect(issue.message).toContain('row 2')
  })

  it('reports a row without a name', async () => {
    const csv = [
      'ward_name,constituency_name,county_name',
      ',Test Constituency,Nairobi',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.skip).toBe(1)
    expect(body.error_rows).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'missing_field')
    expect(issue.row).toBe(2)
    expect(issue.field).toBe('ward_name')
  })

  it('reports a row without a code', async () => {
    const csv = [
      'station_name,station_code,ward_name,constituency_name',
      'Kayole Hall,,Test Ward,Test Constituency',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.skip).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'missing_field')
    expect(issue.row).toBe(2)
    expect(issue.field).toBe('station_code')
  })

  it('reports a constituency that is not one of the platform', async () => {
    const csv = [
      'ward_name,constituency_name,county_name',
      'Kayole,Nowhere County,Nairobi',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.skip).toBe(1)
    expect(body.error_rows).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'unmatched_constituency')
    expect(issue.row).toBe(2)
    expect(issue.message).toContain('Nowhere County')
  })

  it('reports a ward that is not one of the platform', async () => {
    const csv = [
      'station_name,station_code,ward_name,constituency_name',
      'Kayole Hall,PS000001,Missing Ward,Test Constituency',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.skip).toBe(1)
    expect(body.error_rows).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'unmatched_ward')
    expect(issue.row).toBe(2)
    expect(issue.message).toContain('Missing Ward')
  })

  it('reports a ward that belongs to another constituency', async () => {
    const csv = [
      'station_name,station_code,ward_name,constituency_name',
      'Kayole Hall,PS000001,Other Ward,Test Constituency',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.skip).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'invalid_parent')
    expect(issue.row).toBe(2)
    expect(issue.message).toContain('Other Constituency')
  })

  it('warns when the county of the file is not the county of the constituency', async () => {
    const csv = [
      'ward_name,constituency_name,county_name',
      'Kayole,Test Constituency,Mombasa',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    // The row is still written: the county of the constituency is the one that
    // counts.
    expect(body.valid_rows).toBe(1)
    expect(body.error_rows).toBe(0)
    expect(body.warning_rows).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'parent_mismatch')
    expect(issue.severity).toBe('warning')
    expect(issue.message).toContain('Mombasa')
  })

  it('reports a ward that exists already as an update', async () => {
    baseHandlers([
      {
        match: /SELECT id, code FROM wards/,
        handler: () => [{ id: 2660, code: 'W0001' }],
      },
      ...IMPORT_HANDLERS,
    ])

    const response = await importPost(importRequest('wards', true, WARDS_CSV) as any)
    const body = await response.json()

    expect(body.update).toBe(2)
    expect(body.create).toBe(0)
    expect(body.rows[0].target_id).toBe(2660)
  })

  it('reports a code that is too long', async () => {
    const csv = [
      'ward_name,constituency_name,code',
      `Kayole,Test Constituency,${'W'.repeat(11)}`,
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.skip).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'invalid_code')
    expect(issue.row).toBe(2)
    expect(issue.message).toContain('10 characters')
  })

  it('does not warn about a county that the file writes with extra spaces', async () => {
    const csv = [
      'ward_name,constituency_name,county_name',
      'Kayole,Test Constituency,  NAIROBI  ',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.error_rows).toBe(0)
    expect(body.warning_rows).toBe(0)
    expect(body.valid_rows).toBe(1)
  })

  it('compares the names of the file without the extra spaces', async () => {
    await importPost(importRequest('wards', true, WARDS_CSV) as any)

    const lookup = executed.find((entry) => /FROM constituencies c/.test(entry.text))
    expect(lookup?.text).toContain('REGEXP_REPLACE')
  })
})

describe('the real CSV import', () => {
  beforeEach(() => {
    baseHandlers(IMPORT_HANDLERS)
  })

  it('writes the rows the preview reports', async () => {
    const preview = await (await importPost(importRequest('wards', true, WARDS_CSV) as any)).json()
    executed.length = 0

    const response = await importPost(importRequest('wards', false, WARDS_CSV) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.created).toBe(preview.create)
    expect(body.updated).toBe(preview.update)
    expect(body.skipped).toBe(preview.skip)

    const inserts = executed.filter((entry) => /INSERT INTO wards/.test(entry.text))
    expect(inserts).toHaveLength(2)
    expect(inserts[0].params?.[0]).toBe('W1193')
    expect(inserts[0].params?.[3]).toBe(201) // the county of the constituency
  })

  it('writes the polling stations the preview reports', async () => {
    const preview = await (
      await importPost(importRequest('polling_stations', true, STATIONS_CSV) as any)
    ).json()
    executed.length = 0

    const response = await importPost(
      importRequest('polling_stations', false, STATIONS_CSV) as any
    )
    const body = await response.json()

    expect(body.created).toBe(preview.create)
    expect(body.skipped).toBe(preview.skip)

    const inserts = executed.filter((entry) => /INSERT INTO polling_stations/.test(entry.text))
    expect(inserts).toHaveLength(1)
    expect(inserts[0].params?.[0]).toBe('PS000001')
    expect(inserts[0].params?.[2]).toBe(2660) // the ward of the file
    expect(inserts[0].params?.[3]).toBe(628) // the constituency follows the ward
  })

  it('skips the rows the preview refuses, and says why', async () => {
    const csv = [
      'ward_name,constituency_name,county_name,code',
      'Kayole,Test Constituency,Nairobi,W500',
      'Kilimani,Test Constituency,Nairobi,W500',
      'Mukuru,Nowhere County,Nairobi,W501',
    ].join('\n')

    const response = await importPost(importRequest('wards', false, csv) as any)
    const body = await response.json()

    expect(body.created).toBe(1)
    expect(body.skipped).toBe(2)
    expect(body.errors).toHaveLength(2)
    expect(body.errors[0].row).toBe(3)
    expect(body.errors[0].message).toContain('W500')
    expect(body.errors[1].row).toBe(4)
    expect(body.errors[1].message).toContain('Nowhere County')
  })

  it('updates a ward that the file names twice', async () => {
    const csv = [
      'ward_name,constituency_name,county_name,registered_voters',
      'Kayole,Test Constituency,Nairobi,1500',
      'Kayole,Test Constituency,Nairobi,1600',
    ].join('\n')

    const preview = await (await importPost(importRequest('wards', true, csv) as any)).json()
    expect(preview.create).toBe(1)
    expect(preview.update).toBe(1)

    executed.length = 0
    const response = await importPost(importRequest('wards', false, csv) as any)
    const body = await response.json()

    expect(body.created).toBe(1)
    expect(body.updated).toBe(1)
    expect(body.errors).toHaveLength(0)

    expect(executed.filter((entry) => /INSERT INTO wards/.test(entry.text))).toHaveLength(1)
    expect(executed.filter((entry) => /UPDATE wards/.test(entry.text))).toHaveLength(1)
  })

  it('updates a ward that exists already when the file names it twice', async () => {
    baseHandlers([
      {
        match: /SELECT id, code FROM wards/,
        handler: () => [{ id: 2660, code: 'W0001' }],
      },
      ...IMPORT_HANDLERS,
    ])

    const csv = [
      'ward_name,constituency_name,county_name,registered_voters',
      'Kayole,Test Constituency,Nairobi,1500',
      'Kayole,Test Constituency,Nairobi,1600',
    ].join('\n')

    const response = await importPost(importRequest('wards', false, csv) as any)
    const body = await response.json()

    expect(body.created).toBe(0)
    expect(body.updated).toBe(2)
    expect(body.errors).toHaveLength(0)
  })
})

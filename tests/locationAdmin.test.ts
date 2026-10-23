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
      match: /SELECT id, code, name, ward_id, constituency_id, county_id, latitude, longitude,\s+registered_voters, location_radius, stream, registration_centre\s+FROM polling_stations WHERE id = \$1/,
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
          stream: null,
          registration_centre: null,
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

  it('refuses a direct ward creation and points to CSV import', async () => {
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
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatch(/CSV import/)
  })

  it('refuses a direct ward update and points to CSV import', async () => {
    const response = await wardPut(
      request('/api/admin/locations/wards/2660', ADMIN, {
        method: 'PUT',
        body: JSON.stringify({ constituency_id: 700 }),
        headers: { 'content-type': 'application/json' },
      }) as any,
      { params: { id: '2660' } }
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatch(/CSV import/)
  })

  it('refuses a ward deletion and points to CSV import', async () => {
    const response = await wardDelete(
      request('/api/admin/locations/wards/2660', ADMIN, { method: 'DELETE' }) as any,
      { params: { id: '2660' } }
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatch(/CSV import/)
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

  it('refuses a direct polling station creation and points to CSV import', async () => {
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
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatch(/CSV import/)
    expect(executed.some((entry) => /INSERT INTO polling_stations/.test(entry.text))).toBe(false)
  })

  it('refuses a polling station deletion and points to CSV import', async () => {
    const response = await stationDelete(
      request('/api/admin/locations/polling-stations/4447', ADMIN, {
        method: 'DELETE',
      }) as any,
      { params: { id: '4447' } }
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatch(/CSV import/)
  })

  it('refuses a direct polling station update and points to CSV import', async () => {
    const response = await stationPut(
      request('/api/admin/locations/polling-stations/4447', ADMIN, {
        method: 'PUT',
        body: JSON.stringify({ ward_id: 2661 }),
        headers: { 'content-type': 'application/json' },
      }) as any,
      { params: { id: '4447' } }
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatch(/CSV import/)
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
 * polling stations. The import updates only: the wards and the stations the
 * file names have to exist already.
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
    match: /SELECT c\.id\s+FROM constituencies c/,
    handler: (_text, params) => {
      const name = String(params?.[0] ?? '').toUpperCase()
      if (name === 'TEST CONSTITUENCY') return [{ id: 628 }]
      if (name === 'OTHER CONSTITUENCY') return [{ id: 700 }]
      return []
    },
  },
  {
    match: /SELECT id, code, constituency_id FROM wards WHERE code = \$1/,
    handler: (_text, params) => {
      const code = String(params?.[0] ?? '')
      if (code === 'W0001') return [{ id: 2660, code: 'W0001', constituency_id: 628 }]
      if (code === 'W0002') return [{ id: 2661, code: 'W0002', constituency_id: 628 }]
      if (code === '28149074203401') {
        return [{ id: 2662, code: '28149074203401', constituency_id: 628 }]
      }
      return []
    },
  },
  {
    match: /SELECT id, code, constituency_id FROM wards\s+WHERE constituency_id = \$1/,
    handler: (_text, params) => {
      const name = String(params?.[1] ?? '').toUpperCase()
      if (name === 'KAYOLE') return [{ id: 2660, code: 'W0001', constituency_id: Number(params?.[0]) }]
      if (name === 'KILIMANI') return [{ id: 2661, code: 'W0002', constituency_id: Number(params?.[0]) }]
      return []
    },
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
  {
    match: /SELECT id, code FROM polling_stations\s+WHERE code = \$1 AND COALESCE\(stream, ''\)/,
    handler: (_text, params) => {
      const code = String(params?.[0] ?? '')
      if (code === 'PS000001') return [{ id: 4447, code: 'PS000001' }]
      return []
    },
  },
  {
    match: /SELECT id, code FROM polling_stations\s+WHERE ward_id = \$1/,
    handler: (_text, params) => [{ id: 4447, code: 'PS000001' }],
  },
]

const WARDS_CSV = [
  'ward_name,constituency_name,county_name,registered_voters',
  'Kayole,Test Constituency,Nairobi,1500',
  'Kilimani,Test Constituency,Nairobi,1200',
].join('\n')

const STATIONS_CSV = [
  'County\tConstituency\tWard\tIEBC Code\tPolling Station\tStream\tRegistration Centre\tRegistered Voters',
  'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t1\tKayole Primary\t450',
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

  it('reports what a valid ward file would update', async () => {
    const response = await importPost(importRequest('wards', true, WARDS_CSV) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dry_run).toBe(true)
    expect(body.total_rows).toBe(2)
    expect(body.valid_rows).toBe(2)
    expect(body.update).toBe(2)
    expect(body.skip).toBe(0)
    expect(body.error_rows).toBe(0)
    expect(body.rows[0].action).toBe('update')
    expect(body.rows[0].code).toBe('W0001')
    expect(body.rows[1].code).toBe('W0002')
  })

  it('reports what a valid polling station file would update', async () => {
    const response = await importPost(
      importRequest('polling_stations', true, STATIONS_CSV) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.total_rows).toBe(1)
    expect(body.update).toBe(1)
    expect(body.skip).toBe(0)
    expect(body.rows[0].code).toBe('PS000001')
    expect(body.rows[0].parent).toBe('Test Ward')
  })

  it('reads the official tab-separated eight-column file', async () => {
    const csv = [
      'County\tConstituency\tWard\tIEBC Code\tPolling Station\tStream\tRegistration Centre\tRegistered Voters',
      'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t1\tKayole Primary\t450',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.update).toBe(1)
    expect(body.skip).toBe(0)
    expect(body.rows[0].code).toBe('PS000001')
  })

  it('keeps the streams of a station apart', async () => {
    const csv = [
      'County\tConstituency\tWard\tIEBC Code\tPolling Station\tStream\tRegistration Centre\tRegistered Voters',
      'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t1\tKayole Primary\t450',
      'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t2\tKayole Primary\t430',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    // The code repeats, but the stream differs, so neither row is a duplicate.
    expect(body.update).toBe(2)
    expect(body.skip).toBe(0)
    expect(body.error_rows).toBe(0)
  })

  it('refuses the same code and stream twice', async () => {
    const csv = [
      'County\tConstituency\tWard\tIEBC Code\tPolling Station\tStream\tRegistration Centre\tRegistered Voters',
      'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t1\tKayole Primary\t450',
      'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t1\tKayole Primary\t450',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.skip).toBe(1)
    expect(body.error_rows).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'duplicate_code')
    expect(issue.row).toBe(3)
    expect(issue.message).toContain('PS000001')
    expect(issue.message).toContain('stream 1')
  })

  it('writes nothing to the database', async () => {
    await importPost(importRequest('wards', true, WARDS_CSV) as any)
    await importPost(importRequest('polling_stations', true, STATIONS_CSV) as any)

    expect(writes()).toEqual([])
  })

  it('refuses a ward the platform does not have', async () => {
    const csv = [
      'ward_name,constituency_name,county_name',
      'Nowhere,Test Constituency,Nairobi',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.update).toBe(0)
    expect(body.skip).toBe(1)
    expect(body.error_rows).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'unmatched_record')
    expect(issue.row).toBe(2)
    expect(issue.severity).toBe('error')
  })

  it('refuses a ward code the platform does not have', async () => {
    const csv = [
      'ward_name,constituency_name,code',
      'Kayole,Test Constituency,W9999',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.skip).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'unmatched_record')
    expect(issue.row).toBe(2)
    expect(issue.message).toContain('W9999')
  })

  it('creates a polling station the platform does not have', async () => {
    const csv = [
      'station_name,station_code,ward_name,constituency_name',
      'Nowhere Hall,PS999999,Test Ward,Test Constituency',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.create).toBe(1)
    expect(body.rows[0].action).toBe('create')
    expect(body.rows[0].code).toBe('PS999999')
  })

  it('matches a ward by its name when the file carries no code', async () => {
    const csv = [
      'ward_name,constituency_name,county_name',
      'Kayole,Test Constituency,Nairobi',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.update).toBe(1)
    expect(body.rows[0].target_id).toBe(2660)
  })

  it('reports a code that is used twice in the file', async () => {
    const csv = [
      'ward_name,constituency_name,county_name,code',
      'Kayole,Test Constituency,Nairobi,W0001',
      'Kilimani,Test Constituency,Nairobi,W0001',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.skip).toBe(1)
    expect(body.error_rows).toBe(1)
    expect(body.valid_rows).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'duplicate_code')
    expect(issue.row).toBe(3)
    expect(issue.severity).toBe('error')
    expect(issue.message).toContain('W0001')
    expect(issue.message).toContain('row 2')
  })

  it('reports a row without a name or a code', async () => {
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
    expect(issue.field).toBe('code')
  })

  it('reports a station row without a name or a code', async () => {
    const csv = [
      'station_name,station_code,ward_name,constituency_name',
      ',,Test Ward,Test Constituency',
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
    const response = await importPost(
      importRequest(
        'wards',
        true,
        ['ward_name,constituency_name,code', 'Kayole,Test Constituency,W0001'].join('\n')
      ) as any
    )
    const body = await response.json()

    expect(body.update).toBe(1)
    expect(body.rows[0].target_id).toBe(2660)
  })

  it('accepts a ward code longer than the old 10 character limit', async () => {
    const csv = [
      'ward_name,constituency_name,code',
      'Kayole,Test Constituency,28149074203401',
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.skip).toBe(0)
    expect(body.update).toBe(1)
    expect(body.rows[0].code).toBe('28149074203401')
  })

  it('reports a code that is too long', async () => {
    const csv = [
      'ward_name,constituency_name,code',
      `Kayole,Test Constituency,${'W'.repeat(51)}`,
    ].join('\n')

    const response = await importPost(importRequest('wards', true, csv) as any)
    const body = await response.json()

    expect(body.skip).toBe(1)

    const issue = body.issues.find((entry: any) => entry.code === 'invalid_code')
    expect(issue.row).toBe(2)
    expect(issue.message).toContain('50 characters')
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
    expect(body.updated).toBe(preview.update)
    expect(body.skipped).toBe(preview.skip)

    const updates = executed.filter((entry) => /UPDATE wards/.test(entry.text))
    expect(updates).toHaveLength(2)
    expect(executed.filter((entry) => /INSERT INTO wards/.test(entry.text))).toHaveLength(0)
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

    expect(body.updated).toBe(preview.update)
    expect(body.skipped).toBe(preview.skip)

    const updates = executed.filter((entry) => /UPDATE polling_stations/.test(entry.text))
    expect(updates).toHaveLength(1)
    expect(executed.filter((entry) => /INSERT INTO polling_stations/.test(entry.text))).toHaveLength(0)
  })

  it('only writes the columns the file carries', async () => {
    // The file carries the code and the registered voters, but no name and no
    // constituency: the name and the constituency of the matched ward must be
    // kept.
    const csv = [
      'code,registered_voters',
      'W0001,1500',
    ].join('\n')

    const response = await importPost(importRequest('wards', false, csv) as any)
    const body = await response.json()

    expect(body.updated).toBe(1)

    const update = executed.find((entry) => /UPDATE wards/.test(entry.text))
    expect(update?.params?.[0]).toBe('W0001') // the code the ward already has
    expect(update?.params?.[1]).toBe('Changamwe Ward 1') // the name the ward already has
    expect(update?.params?.[2]).toBe(628) // the constituency the ward already has
    expect(update?.params?.[4]).toBe(1500) // the registered voters from the file
  })

  it('skips the rows the preview refuses, and says why', async () => {
    const csv = [
      'ward_name,constituency_name,county_name,code',
      'Kayole,Test Constituency,Nairobi,W0001',
      'Kilimani,Test Constituency,Nairobi,W0001',
      'Mukuru,Nowhere County,Nairobi',
    ].join('\n')

    const response = await importPost(importRequest('wards', false, csv) as any)
    const body = await response.json()

    expect(body.created).toBe(0)
    expect(body.updated).toBe(1)
    expect(body.skipped).toBe(2)
    expect(body.errors).toHaveLength(2)
    expect(body.errors[0].row).toBe(3)
    expect(body.errors[0].message).toContain('W0001')
    expect(body.errors[1].row).toBe(4)
    expect(body.errors[1].message).toContain('Nowhere County')
  })

  it('never creates a row for a ward that does not exist', async () => {
    const csv = [
      'ward_name,constituency_name,county_name',
      'Mukuru,Test Constituency,Nairobi',
    ].join('\n')

    const response = await importPost(importRequest('wards', false, csv) as any)
    const body = await response.json()

    expect(body.created).toBe(0)
    expect(body.updated).toBe(0)
    expect(body.skipped).toBe(1)
    expect(writes()).toEqual([])
  })

  it('names the same existing ward twice and updates it twice', async () => {
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
    expect(executed.filter((entry) => /UPDATE wards/.test(entry.text))).toHaveLength(2)
  })
})

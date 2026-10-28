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
/*                        The polling station CSV import                      */
/* -------------------------------------------------------------------------- */

const HEADER =
  'County\tConstituency\tWard\tIEBC Code\tPolling Station\tStream\tRegistration Centre\tRegistered Voters'

const STATIONS_CSV = [
  HEADER,
  'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t1\tKayole Primary\t450',
].join('\n')

interface FakeCounty {
  id: number
  name: string
  code: string
}

interface FakeConstituency {
  id: number
  county_id: number
  name: string
  code: string
}

interface FakeWard {
  id: number
  constituency_id: number
  county_id: number
  name: string
  code: string
}

interface FakeStation {
  id: number
  code: string
  name: string
  ward_id: number
  constituency_id: number
  county_id: number
  latitude: number | null
  longitude: number | null
  registered_voters: number
  location_radius: number
  stream: string | null
  registration_centre: string | null
}

interface FakeDb {
  counties: FakeCounty[]
  constituencies: FakeConstituency[]
  wards: FakeWard[]
  stations: FakeStation[]
  nextCounty: number
  nextConstituency: number
  nextWard: number
  nextStation: number
}

function seedDb(): FakeDb {
  return {
    counties: [{ id: 201, name: 'Nairobi', code: 'NBI' }],
    constituencies: [
      { id: 628, county_id: 201, name: 'Test Constituency', code: 'TC' },
    ],
    wards: [
      {
        id: 2660,
        constituency_id: 628,
        county_id: 201,
        name: 'Test Ward',
        code: 'W0001',
      },
    ],
    stations: [
      {
        id: 4447,
        code: 'PS000001',
        name: 'Kayole Hall',
        ward_id: 2660,
        constituency_id: 628,
        county_id: 201,
        latitude: null,
        longitude: null,
        registered_voters: 400,
        location_radius: 500,
        stream: '1',
        registration_centre: 'Kayole Primary',
      },
    ],
    nextCounty: 300,
    nextConstituency: 700,
    nextWard: 2700,
    nextStation: 4500,
  }
}

const norm = (value: unknown) =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

/** A small in-memory database behind the queries the import writes. */
function importHandler(db: FakeDb): QueryHandler {
  return {
    match: /.*/,
    handler: (text: string, params: any[] = []) => {
      const sql = text.replace(/\s+/g, ' ').trim()

      // The four reads that fill the import cache.
      if (sql.startsWith('SELECT id, name, code FROM counties')) {
        return db.counties.map(({ id, name, code }) => ({ id, name, code }))
      }

      if (
        sql.startsWith(
          'SELECT c.id, c.county_id, c.name, c.code, co.name AS county_name'
        )
      ) {
        return db.constituencies.map((constituency) => {
          const county = db.counties.find(
            (candidate) => candidate.id === constituency.county_id
          )
          return {
            id: constituency.id,
            county_id: constituency.county_id,
            name: constituency.name,
            code: constituency.code,
            county_name: county?.name ?? null,
          }
        })
      }

      if (
        sql.startsWith(
          'SELECT id, constituency_id, county_id, name, code FROM wards'
        )
      ) {
        return db.wards.map(
          ({ id, constituency_id, county_id, name, code }) => ({
            id,
            constituency_id,
            county_id,
            name,
            code,
          })
        )
      }

      if (
        sql.startsWith(
          'SELECT id, code, name, ward_id, constituency_id, county_id, latitude, longitude, registered_voters, location_radius, stream, registration_centre FROM polling_stations'
        )
      ) {
        return db.stations.map((station) => ({ ...station }))
      }

      if (sql.startsWith('SELECT set_config(\'ukwelitally.bulk_import\'')) {
        return [{ set_config: 'on' }]
      }

      // The replacement import clears the records that pin a station first.
      if (sql.startsWith('DELETE FROM agents')) {
        return []
      }

      if (sql.startsWith('DELETE FROM volunteer_registrations')) {
        return []
      }

      if (sql.startsWith('DELETE FROM polling_stations')) {
        const removed = db.stations.length
        db.stations = []
        return { rows: [], rowCount: removed }
      }

      // The hierarchy is inserted top down with UNNEST.
      if (sql.startsWith('INSERT INTO counties')) {
        const [names, codes] = params as [string[], string[]]
        const created: FakeCounty[] = names.map((name, index) => ({
          id: db.nextCounty++,
          name: String(name),
          code: String(codes[index]),
        }))
        db.counties.push(...created)
        return created
      }

      if (sql.startsWith('INSERT INTO constituencies')) {
        const [names, codes, countyIds] = params as [
          string[],
          string[],
          number[]
        ]
        const created: FakeConstituency[] = names.map((name, index) => ({
          id: db.nextConstituency++,
          name: String(name),
          code: String(codes[index]),
          county_id: Number(countyIds[index]),
        }))
        db.constituencies.push(...created)
        return created
      }

      if (sql.startsWith('INSERT INTO wards')) {
        const [names, codes, constituencyIds, countyIds] = params as [
          string[],
          string[],
          number[],
          number[]
        ]
        const created: FakeWard[] = names.map((name, index) => ({
          id: db.nextWard++,
          name: String(name),
          code: String(codes[index]),
          constituency_id: Number(constituencyIds[index]),
          county_id: Number(countyIds[index]),
        }))
        db.wards.push(...created)
        return created
      }

      if (sql.startsWith('INSERT INTO polling_stations')) {
        const [
          codes,
          names,
          wardIds,
          constituencyIds,
          countyIds,
          latitudes,
          longitudes,
          voters,
          radii,
          streams,
          centres,
        ] = params as [
          string[],
          string[],
          number[],
          number[],
          number[],
          Array<number | null>,
          Array<number | null>,
          number[],
          number[],
          Array<string | null>,
          Array<string | null>
        ]

        const returned: Array<{ code: string; stream: string | null }> = []
        for (let index = 0; index < codes.length; index += 1) {
          const code = String(codes[index])
          const stream =
            streams[index] === null ? null : String(streams[index])
          const conflict = db.stations.some(
            (station) =>
              station.code === code && (station.stream ?? '') === (stream ?? '')
          )
          if (conflict) continue

          const station: FakeStation = {
            id: db.nextStation++,
            code,
            name: String(names[index]),
            ward_id: Number(wardIds[index]),
            constituency_id: Number(constituencyIds[index]),
            county_id: Number(countyIds[index]),
            latitude:
              latitudes[index] === null ? null : Number(latitudes[index]),
            longitude:
              longitudes[index] === null ? null : Number(longitudes[index]),
            registered_voters: Number(voters[index]),
            location_radius: Number(radii[index]),
            stream,
            registration_centre:
              centres[index] === null ? null : String(centres[index]),
          }
          db.stations.push(station)
          returned.push({ code: station.code, stream: station.stream })
        }
        return returned
      }

      if (sql.startsWith('UPDATE polling_stations AS ps')) {
        const [
          ids,
          names,
          wardIds,
          constituencyIds,
          countyIds,
          latitudes,
          longitudes,
          voters,
          streams,
          centres,
        ] = params as [
          number[],
          string[],
          number[],
          number[],
          number[],
          Array<number | null>,
          Array<number | null>,
          number[],
          Array<string | null>,
          Array<string | null>
        ]

        const updated: FakeStation[] = []
        for (let index = 0; index < ids.length; index += 1) {
          const station = db.stations.find(
            (candidate) => candidate.id === Number(ids[index])
          )
          if (!station) continue

          Object.assign(station, {
            name: String(names[index]),
            ward_id: Number(wardIds[index]),
            constituency_id: Number(constituencyIds[index]),
            county_id: Number(countyIds[index]),
            latitude:
              latitudes[index] === null ? null : Number(latitudes[index]),
            longitude:
              longitudes[index] === null ? null : Number(longitudes[index]),
            registered_voters: Number(voters[index]),
            stream:
              streams[index] === null ? null : String(streams[index]),
            registration_centre:
              centres[index] === null ? null : String(centres[index]),
          })
          updated.push(station)
        }
        return updated
      }

      if (sql.startsWith('SELECT * FROM sync_registered_voters_from_stations()')) {
        return []
      }

      return []
    },
  }
}

let db: FakeDb

beforeEach(() => {
  db = seedDb()
  handlers.length = 0
  handlers.push(importHandler(db))
  executed.length = 0
})

/** A request that imports a file, with or without writing it. */
function importRequest(
  type: string,
  dryRun: boolean,
  csv?: string,
  user: { id: number; role: string } = ADMIN,
  mode?: 'update' | 'replace'
) {
  const form = new FormData()
  form.append('type', type)
  form.append('dry_run', dryRun ? 'true' : 'false')
  if (mode) form.append('mode', mode)
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

describe('the polling station CSV import', () => {
  it('refuses a user who is not an administrator', async () => {
    const response = await importPost(
      importRequest('polling_stations', true, STATIONS_CSV, CANDIDATE) as any
    )

    expect(response.status).toBe(403)
  })

  it('refuses a file without the eight official columns', async () => {
    const csv = [
      'ward_name,constituency_name,county_name',
      'Kayole,Test Constituency,Nairobi',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('missing the column')
    expect(body.missing_columns).toContain('iebc_code')
    expect(body.missing_columns).toContain('polling_station')
    expect(body.required_columns).toContain('IEBC Code')
  })

  it('previews the replacement of an existing station', async () => {
    const response = await importPost(
      importRequest('polling_stations', true, STATIONS_CSV) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dry_run).toBe(true)
    expect(body.total_rows).toBe(1)
    expect(body.update).toBe(0)
    expect(body.create).toBe(1)
    expect(body.skip).toBe(0)
    expect(body.deleted).toBe(1)
    expect(body.rows[0].action).toBe('create')
    expect(body.rows[0].code).toBe('PS000001')
    expect(body.rows[0].target_id).toBe(null)
  })

  it('previews an update without planning to delete the station', async () => {
    const response = await importPost(
      importRequest('polling_stations', true, STATIONS_CSV, ADMIN, 'update') as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dry_run).toBe(true)
    expect(body.mode).toBe('update')
    expect(body.total_rows).toBe(1)
    expect(body.create).toBe(0)
    expect(body.update).toBe(1)
    expect(body.deleted).toBe(0)
    expect(body.rows[0].action).toBe('update')
    expect(body.rows[0].target_id).toBe(4447)
  })

  it('updates a station in place in update mode', async () => {
    const response = await importPost(
      importRequest('polling_stations', false, STATIONS_CSV, ADMIN, 'update') as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.created).toBe(0)
    expect(body.updated).toBe(1)
    expect(body.deleted).toBe(0)

    const station = db.stations.find((entry) => entry.id === 4447)
    expect(station?.registered_voters).toBe(450)
    expect(db.stations).toHaveLength(1)
    expect(writes().some((entry) => /DELETE FROM polling_stations/i.test(entry.text))).toBe(
      false
    )
    expect(writes().some((entry) => /UPDATE polling_stations AS ps/i.test(entry.text))).toBe(
      true
    )
  })

  it('reads the official tab-separated eight-column file', async () => {
    const response = await importPost(
      importRequest('polling_stations', true, STATIONS_CSV) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.create).toBe(1)
    expect(body.update).toBe(0)
    expect(body.skip).toBe(0)
  })

  it('keeps the streams of a station apart', async () => {
    const csv = [
      HEADER,
      'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t1\tKayole Primary\t450',
      'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t2\tKayole Primary\t430',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.create).toBe(2)
    expect(body.update).toBe(0)
    expect(body.skip).toBe(0)
    expect(body.error_rows).toBe(0)
  })

  it('refuses the same code and stream twice', async () => {
    const csv = [
      HEADER,
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

  it('writes nothing to the database on a preview', async () => {
    const csv = [
      HEADER,
      'Nairobi\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t1\tKayole Primary\t450',
      'Mombasa\tNyali\tFrere Town\tSTN001\tFrere Hall\t1\tFrere Primary\t500',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.create).toBe(2)
    expect(body.update).toBe(0)
    expect(writes()).toEqual([])
    expect(db.counties).toHaveLength(1)
    expect(db.wards).toHaveLength(1)
    expect(db.stations).toHaveLength(1)
  })

  it('creates a station in a ward that exists', async () => {
    const csv = [
      HEADER,
      'Nairobi\tTest Constituency\tTest Ward\tNEW001\tNew Hall\t1\tNew Primary\t500',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.create).toBe(1)
    expect(body.rows[0].action).toBe('create')
    expect(body.rows[0].code).toBe('NEW001')
  })

  it('matches an existing station by name when the file carries no code', async () => {
    const csv = [
      HEADER,
      'Nairobi\tTest Constituency\tTest Ward\t\tKayole Hall\t1\tKayole Primary\t450',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.create).toBe(1)
    expect(body.update).toBe(0)
    expect(body.rows[0].action).toBe('create')
    expect(body.rows[0].code).toBe('PS000001')
  })

  it('reports a station row without a name or a code', async () => {
    const csv = [
      HEADER,
      'Nairobi\tTest Constituency\tTest Ward\t\t\t1\t\t100',
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

  it('creates a county, constituency, ward and station from one fresh row', async () => {
    const csv = [
      HEADER,
      'Mombasa\tNyali\tFrere Town\tSTN001\tFrere Hall\t1\tFrere Primary\t500',
    ].join('\n')

    const preview = await (
      await importPost(importRequest('polling_stations', true, csv) as any)
    ).json()

    expect(preview.create).toBe(1)
    expect(preview.skip).toBe(0)
    expect(writes()).toEqual([])

    executed.length = 0
    const response = await importPost(
      importRequest('polling_stations', false, csv) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.created).toBe(1)
    expect(body.updated).toBe(0)
    expect(body.deleted).toBe(1)
    expect(body.skipped).toBe(0)

    const county = db.counties.find((entry) => entry.name === 'Mombasa')
    const constituency = db.constituencies.find((entry) => entry.name === 'Nyali')
    const ward = db.wards.find((entry) => entry.name === 'Frere Town')
    const station = db.stations.find((entry) => entry.code === 'STN001')

    expect(county).toBeDefined()
    expect(constituency?.county_id).toBe(county?.id)
    expect(ward?.constituency_id).toBe(constituency?.id)
    expect(ward?.county_id).toBe(county?.id)
    expect(station?.ward_id).toBe(ward?.id)
    expect(station?.constituency_id).toBe(constituency?.id)
    expect(station?.county_id).toBe(county?.id)

    // The hierarchy is built from the county down, before the station.
    const order = executed.map((entry) => entry.text.replace(/\s+/g, ' ').trim())
    const countyAt = order.findIndex((sql) => sql.startsWith('INSERT INTO counties'))
    const constituencyAt = order.findIndex((sql) =>
      sql.startsWith('INSERT INTO constituencies')
    )
    const wardAt = order.findIndex((sql) => sql.startsWith('INSERT INTO wards'))
    const stationAt = order.findIndex((sql) =>
      sql.startsWith('INSERT INTO polling_stations')
    )
    expect(countyAt).toBeGreaterThanOrEqual(0)
    expect(constituencyAt).toBeGreaterThan(countyAt)
    expect(wardAt).toBeGreaterThan(constituencyAt)
    expect(stationAt).toBeGreaterThan(wardAt)
  })

  it('matches the hierarchy it created when the file is imported again', async () => {
    const csv = [
      HEADER,
      'Mombasa\tNyali\tFrere Town\tSTN001\tFrere Hall\t1\tFrere Primary\t500',
    ].join('\n')

    await importPost(importRequest('polling_stations', false, csv) as any)
    const counties = db.counties.length
    const constituencies = db.constituencies.length
    const wards = db.wards.length
    const stations = db.stations.length

    executed.length = 0
    const response = await importPost(
      importRequest('polling_stations', false, csv) as any
    )
    const body = await response.json()

    expect(body.created).toBe(1)
    expect(body.updated).toBe(0)
    expect(body.deleted).toBe(1)
    expect(body.skipped).toBe(0)
    expect(db.counties).toHaveLength(counties)
    expect(db.constituencies).toHaveLength(constituencies)
    expect(db.wards).toHaveLength(wards)
    expect(db.stations).toHaveLength(stations)
    expect(executed.filter((entry) => /INSERT INTO (counties|constituencies|wards)/.test(entry.text))).toHaveLength(0)
  })

  it('only writes the columns the file carries', async () => {
    // The row carries the code, the stream and the voters, but leaves the name,
    // the ward and the constituency empty: the station must keep them.
    const csv = [
      HEADER,
      '\t\t\tPS000001\t\t1\t\t777',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', false, csv) as any
    )
    const body = await response.json()

    expect(body.created).toBe(1)
    expect(body.deleted).toBe(1)

    const station = db.stations.find((entry) => entry.code === 'PS000001')
    expect(station?.name).toBe('Kayole Hall')
    expect(station?.ward_id).toBe(2660)
    expect(station?.registered_voters).toBe(777)
  })

  it('skips the rows it refuses, and says why', async () => {
    const csv = [
      HEADER,
      'Mombasa\tNyali\tFrere Town\tSTN001\tFrere Hall\t1\tFrere Primary\t500',
      'Mombasa\tNyali\tFrere Town\tSTN001\tFrere Hall\t1\tFrere Primary\t500',
      'Mombasa\tNyali\t\tSTN002\tLonely Hall\t1\tFrere Primary\t200',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', false, csv) as any
    )
    const body = await response.json()

    expect(body.created).toBe(1)
    expect(body.deleted).toBe(1)
    expect(body.skipped).toBe(2)
    expect(body.errors).toHaveLength(2)
    expect(body.errors[0].row).toBe(3)
    expect(body.errors[0].message).toContain('STN001')
    expect(body.errors[1].row).toBe(4)
    expect(body.errors[1].message).toContain('ward')
  })

  it('warns when the county of the file is not the county of the constituency', async () => {
    const csv = [
      HEADER,
      'Mombasa\tTest Constituency\tTest Ward\tPS000001\tKayole Hall\t1\tKayole Primary\t450',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.create).toBe(1)
    expect(body.update).toBe(0)
    expect(body.warning_rows).toBe(1)
    expect(body.error_rows).toBe(0)

    const issue = body.issues.find((entry: any) => entry.code === 'parent_mismatch')
    expect(issue.severity).toBe('warning')
    expect(issue.message).toContain('Mombasa')
  })

  it('compares the names of the file without the extra spaces', async () => {
    const csv = [
      HEADER,
      '  nairobi  \tTEST   CONSTITUENCY\t test ward \tNEW002\tSpaced Hall\t1\tSpaced Primary\t300',
    ].join('\n')

    const response = await importPost(
      importRequest('polling_stations', true, csv) as any
    )
    const body = await response.json()

    expect(body.create).toBe(1)
    expect(body.skip).toBe(0)
    expect(body.error_rows).toBe(0)
  })

  it('deletes the old stations and their dependents before writing the file', async () => {
    await importPost(importRequest('polling_stations', false, STATIONS_CSV) as any)

    const order = executed.map((entry) => entry.text.replace(/\s+/g, ' ').trim())
    const agentsAt = order.findIndex((sql) => sql.startsWith('DELETE FROM agents'))
    const volunteersAt = order.findIndex((sql) =>
      sql.startsWith('DELETE FROM volunteer_registrations')
    )
    const stationsAt = order.findIndex((sql) =>
      sql.startsWith('DELETE FROM polling_stations')
    )
    const insertAt = order.findIndex((sql) =>
      sql.startsWith('INSERT INTO polling_stations')
    )

    expect(agentsAt).toBeGreaterThanOrEqual(0)
    expect(volunteersAt).toBeGreaterThan(agentsAt)
    expect(stationsAt).toBeGreaterThan(volunteersAt)
    expect(insertAt).toBeGreaterThan(stationsAt)

    // The station of the file replaces the one that was there before.
    expect(db.stations).toHaveLength(1)
    expect(db.stations[0].code).toBe('PS000001')
    expect(db.stations[0].id).not.toBe(4447)
  })

  it('deletes nothing when the file has no valid row', async () => {
    const csv = [HEADER, 'Nairobi\tTest Constituency\tTest Ward\t\t\t1\t\t100'].join(
      '\n'
    )

    const preview = await (
      await importPost(importRequest('polling_stations', true, csv) as any)
    ).json()
    expect(preview.deleted).toBe(0)

    const response = await importPost(
      importRequest('polling_stations', false, csv) as any
    )
    const body = await response.json()

    expect(body.created).toBe(0)
    expect(body.deleted).toBe(0)
    expect(body.skipped).toBe(1)
    expect(db.stations).toHaveLength(1)
    expect(db.stations[0].id).toBe(4447)
    expect(executed.some((entry) => /DELETE FROM polling_stations/i.test(entry.text))).toBe(
      false
    )
  })
})

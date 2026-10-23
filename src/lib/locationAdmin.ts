import { query, queryOne, queryMany, transaction, type PoolClient } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

/**
 * Administration of the electoral geography.
 *
 * The wards and the polling stations are reference data that the platform
 * administrator maintains. Until now they could only be changed with a
 * command line script that connects to the database directly, so there was
 * no way to correct a ward, add a polling station or replace the placeholder
 * wards from the application.
 *
 * The rules the write path enforces:
 *
 *   - the code of a ward and of a polling station is unique
 *   - a ward always follows its constituency, and a polling station always
 *     follows its ward: the county and the constituency of a station are
 *     derived, never typed in
 *   - a ward that is moved carries its polling stations with it
 *   - a ward with polling stations, or a polling station with submissions,
 *     is not deleted: the history has to stay readable
 *   - every change is written to the audit trail
 */

export interface WardInput {
  code: string
  name: string
  constituency_id: number
  registered_voters?: number | null
}

export interface PollingStationInput {
  code: string
  name: string
  ward_id: number
  latitude?: number | null
  longitude?: number | null
  registered_voters?: number | null
  location_radius?: number | null
  /** The stream of a station that is split into streams. */
  stream?: string | null
  /** The registration centre the station belongs to. */
  registration_centre?: string | null
}

export interface WardRow {
  id: number
  code: string
  name: string
  constituency_id: number
  county_id: number
  registered_voters: number
  constituency_name?: string
  county_name?: string
  station_count?: number
}

export interface PollingStationRow {
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
  ward_name?: string
  constituency_name?: string
  county_name?: string
  submission_count?: number
}

export type LocationErrorCode =
  | 'not_found'
  | 'duplicate_code'
  | 'invalid_input'
  | 'has_dependents'
  | 'conflict'

export class LocationError extends Error {
  code: LocationErrorCode
  details?: Record<string, unknown>

  constructor(code: LocationErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.details = details
  }
}

/** The widest code a ward can have (wards.code is VARCHAR(50), migration 023). */
export const MAX_WARD_CODE_LENGTH = 50
/** The widest code a polling station can have (polling_stations.code is VARCHAR(50)). */
export const MAX_STATION_CODE_LENGTH = 50
/** The widest code a county can have (counties.code is VARCHAR(10)). */
export const MAX_COUNTY_CODE_LENGTH = 10
/** The widest code a constituency can have (constituencies.code is VARCHAR(10)). */
export const MAX_CONSTITUENCY_CODE_LENGTH = 10

/* -------------------------------------------------------------------------- */
/*                                  Listing                                   */
/* -------------------------------------------------------------------------- */

export interface LocationFilters {
  countyId?: number | null
  constituencyId?: number | null
  wardId?: number | null
  search?: string | null
  limit?: number
  offset?: number
}

/** A short, stable hash of a name, used to tell apart codes that share a prefix. */
function shortHash(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(36).toUpperCase().padStart(6, '0').slice(-6)
}

/** A name reduced to the characters a code may carry. */
function codeSeed(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * The codes to try for a name.
 *
 * The name gives the readable part; when two names share a prefix (or the
 * readable part is taken) a hash of the full name keeps the code unique. Codes
 * are generated only for records the import creates: a record that already
 * exists is matched by name and keeps its code.
 */
function codeCandidates(name: string, maxLength: number): string[] {
  const seed = codeSeed(name) || 'AREA'
  const hash = shortHash(name)
  const candidates: string[] = []
  const hashed = `${seed.slice(0, Math.max(1, maxLength - hash.length - 1))}-${hash}`
  candidates.push(seed.slice(0, maxLength), hashed.slice(0, maxLength))
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const tail = `-${suffix}`
    candidates.push(`${seed.slice(0, Math.max(1, maxLength - tail.length))}${tail}`)
  }
  return candidates
}

/**
 * A code that no row of the table uses yet, chosen from the codes already in
 * memory. The import loads the used codes once instead of asking the database
 * for every new county, constituency and ward.
 */
function nextUniqueCode(name: string, used: Set<string>, maxLength: number): string {
  for (const candidate of codeCandidates(name, maxLength)) {
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }

  throw new LocationError('invalid_input', `Could not make a unique code for "${name}"`)
}

/**
 * The wards, with the number of polling stations in each.
 */
export async function listWards(filters: LocationFilters = {}): Promise<WardRow[]> {
  const params: any[] = []
  const conditions: string[] = []

  if (filters.countyId) {
    conditions.push(`w.county_id = $${params.length + 1}`)
    params.push(filters.countyId)
  }
  if (filters.constituencyId) {
    conditions.push(`w.constituency_id = $${params.length + 1}`)
    params.push(filters.constituencyId)
  }
  if (filters.search) {
    conditions.push(`(w.name ILIKE $${params.length + 1} OR w.code ILIKE $${params.length + 1})`)
    params.push(`%${filters.search.trim()}%`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000)
  const offset = Math.max(filters.offset ?? 0, 0)

  return queryMany<WardRow>(
    `SELECT w.id, w.code, w.name, w.constituency_id, w.county_id, w.registered_voters,
            c.name as constituency_name, co.name as county_name,
            (SELECT COUNT(*) FROM polling_stations ps WHERE ps.ward_id = w.id) AS station_count
       FROM wards w
       LEFT JOIN constituencies c ON c.id = w.constituency_id
       LEFT JOIN counties co ON co.id = w.county_id
       ${where}
      ORDER BY co.name, c.name, w.name
      LIMIT ${limit} OFFSET ${offset}`,
    params
  )
}

/**
 * The polling stations, with the number of submissions at each.
 */
export async function listPollingStations(
  filters: LocationFilters = {}
): Promise<PollingStationRow[]> {
  const params: any[] = []
  const conditions: string[] = []

  if (filters.countyId) {
    conditions.push(`ps.county_id = $${params.length + 1}`)
    params.push(filters.countyId)
  }
  if (filters.constituencyId) {
    conditions.push(`ps.constituency_id = $${params.length + 1}`)
    params.push(filters.constituencyId)
  }
  if (filters.wardId) {
    conditions.push(`ps.ward_id = $${params.length + 1}`)
    params.push(filters.wardId)
  }
  if (filters.search) {
    conditions.push(
      `(ps.name ILIKE $${params.length + 1} OR ps.code ILIKE $${params.length + 1})`
    )
    params.push(`%${filters.search.trim()}%`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000)
  const offset = Math.max(filters.offset ?? 0, 0)

  return queryMany<PollingStationRow>(
    `SELECT ps.id, ps.code, ps.name, ps.ward_id, ps.constituency_id, ps.county_id,
            ps.latitude, ps.longitude, ps.registered_voters, ps.location_radius,
            w.name as ward_name, con.name as constituency_name, co.name as county_name,
            (SELECT COUNT(*) FROM submissions s WHERE s.polling_station_id = ps.id) AS submission_count
       FROM polling_stations ps
       LEFT JOIN wards w ON w.id = ps.ward_id
       LEFT JOIN constituencies con ON con.id = ps.constituency_id
       LEFT JOIN counties co ON co.id = ps.county_id
       ${where}
      ORDER BY co.name, con.name, w.name, ps.name
      LIMIT ${limit} OFFSET ${offset}`,
    params
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Wards                                    */
/* -------------------------------------------------------------------------- */

/**
 * Create a ward.
 */
export async function createWard(
  input: WardInput,
  actor: { userId: number; ipAddress?: string | null }
): Promise<WardRow> {
  const code = (input.code || '').trim()
  const name = (input.name || '').trim()

  if (!code || !name) {
    throw new LocationError('invalid_input', 'A ward needs a code and a name')
  }
  if (code.length > MAX_WARD_CODE_LENGTH) {
    throw new LocationError(
      'invalid_input',
      `A ward code can be at most ${MAX_WARD_CODE_LENGTH} characters`
    )
  }
  if (!input.constituency_id) {
    throw new LocationError('invalid_input', 'A ward needs a constituency')
  }

  const constituency = await queryOne<{ id: number; county_id: number }>(
    'SELECT id, county_id FROM constituencies WHERE id = $1',
    [input.constituency_id]
  )
  if (!constituency) {
    throw new LocationError('invalid_input', 'The constituency does not exist')
  }

  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM wards WHERE code = $1',
    [code]
  )
  if (existing) {
    throw new LocationError('duplicate_code', `A ward with the code ${code} already exists`, {
      id: existing.id,
    })
  }

  const created = await queryOne<WardRow>(
    `INSERT INTO wards (code, name, constituency_id, county_id, registered_voters)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, code, name, constituency_id, county_id, registered_voters`,
    [code, name, constituency.id, constituency.county_id, input.registered_voters ?? 0]
  )

  await recordAudit({
    userId: actor.userId,
    action: 'ward_created',
    entityType: 'ward',
    entityId: created?.id,
    newValues: { code, name, constituency_id: constituency.id },
    ipAddress: actor.ipAddress,
  })

  return created as WardRow
}

/**
 * Update a ward.
 *
 * When the ward moves to another constituency, its polling stations move
 * with it, so a station never points at a ward of another constituency.
 */
export async function updateWard(
  id: number,
  input: Partial<WardInput>,
  actor: { userId: number; ipAddress?: string | null }
): Promise<WardRow> {
  const current = await queryOne<{
    id: number
    code: string
    name: string
    constituency_id: number
    county_id: number
    registered_voters: number
  }>('SELECT id, code, name, constituency_id, county_id, registered_voters FROM wards WHERE id = $1', [
    id,
  ])

  if (!current) {
    throw new LocationError('not_found', 'The ward does not exist')
  }

  const code = input.code !== undefined ? (input.code || '').trim() : current.code
  const name = input.name !== undefined ? (input.name || '').trim() : current.name

  if (!code || !name) {
    throw new LocationError('invalid_input', 'A ward needs a code and a name')
  }
  if (code.length > MAX_WARD_CODE_LENGTH) {
    throw new LocationError(
      'invalid_input',
      `A ward code can be at most ${MAX_WARD_CODE_LENGTH} characters`
    )
  }

  if (code !== current.code) {
    const duplicate = await queryOne<{ id: number }>('SELECT id FROM wards WHERE code = $1', [code])
    if (duplicate) {
      throw new LocationError('duplicate_code', `A ward with the code ${code} already exists`, {
        id: duplicate.id,
      })
    }
  }

  let constituencyId = current.constituency_id
  let countyId = current.county_id

  if (input.constituency_id && input.constituency_id !== current.constituency_id) {
    const constituency = await queryOne<{ id: number; county_id: number }>(
      'SELECT id, county_id FROM constituencies WHERE id = $1',
      [input.constituency_id]
    )
    if (!constituency) {
      throw new LocationError('invalid_input', 'The constituency does not exist')
    }
    constituencyId = constituency.id
    countyId = constituency.county_id
  }

  const registeredVoters =
    input.registered_voters !== undefined ? input.registered_voters : current.registered_voters

  const updated = await transaction(async (client: PoolClient) => {
    const row = await client.query<WardRow>(
      `UPDATE wards
          SET code = $1, name = $2, constituency_id = $3, county_id = $4, registered_voters = $5
        WHERE id = $6
        RETURNING id, code, name, constituency_id, county_id, registered_voters`,
      [code, name, constituencyId, countyId, registeredVoters, id]
    )

    // The stations of the ward follow it to the new constituency.
    if (constituencyId !== current.constituency_id) {
      await client.query(
        `UPDATE polling_stations
            SET constituency_id = $1, county_id = $2
          WHERE ward_id = $3`,
        [constituencyId, countyId, id]
      )
    }

    return row.rows[0]
  })

  await recordAudit({
    userId: actor.userId,
    action: 'ward_updated',
    entityType: 'ward',
    entityId: id,
    oldValues: {
      code: current.code,
      name: current.name,
      constituency_id: current.constituency_id,
      registered_voters: current.registered_voters,
    },
    newValues: {
      code,
      name,
      constituency_id: constituencyId,
      registered_voters: registeredVoters,
    },
    ipAddress: actor.ipAddress,
  })

  return updated
}

/**
 * Delete a ward.
 *
 * A ward that still has polling stations is not deleted: the stations would
 * be left without an area, and the submissions that belong to them would
 * lose their context.
 */
export async function deleteWard(
  id: number,
  actor: { userId: number; ipAddress?: string | null }
): Promise<{ deleted: boolean; id: number }> {
  const ward = await queryOne<{ id: number; code: string; name: string }>(
    'SELECT id, code, name FROM wards WHERE id = $1',
    [id]
  )
  if (!ward) {
    throw new LocationError('not_found', 'The ward does not exist')
  }

  const stations = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM polling_stations WHERE ward_id = $1',
    [id]
  )
  const stationCount = Number(stations?.total || 0)

  if (stationCount > 0) {
    throw new LocationError(
      'has_dependents',
      `This ward still has ${stationCount} polling station(s). Move or delete them first.`,
      { station_count: stationCount }
    )
  }

  await query('DELETE FROM wards WHERE id = $1', [id])

  await recordAudit({
    userId: actor.userId,
    action: 'ward_deleted',
    entityType: 'ward',
    entityId: id,
    oldValues: { code: ward.code, name: ward.name },
    ipAddress: actor.ipAddress,
  })

  return { deleted: true, id }
}

/* -------------------------------------------------------------------------- */
/*                              Polling stations                               */
/* -------------------------------------------------------------------------- */

/**
 * Create a polling station.
 */
export async function createPollingStation(
  input: PollingStationInput,
  actor: { userId: number; ipAddress?: string | null }
): Promise<PollingStationRow> {
  const code = (input.code || '').trim()
  const name = (input.name || '').trim()

  if (!code || !name) {
    throw new LocationError('invalid_input', 'A polling station needs a code and a name')
  }
  if (code.length > MAX_STATION_CODE_LENGTH) {
    throw new LocationError(
      'invalid_input',
      `A polling station code can be at most ${MAX_STATION_CODE_LENGTH} characters`
    )
  }
  if (!input.ward_id) {
    throw new LocationError('invalid_input', 'A polling station needs a ward')
  }

  const ward = await queryOne<{ id: number; constituency_id: number; county_id: number }>(
    'SELECT id, constituency_id, county_id FROM wards WHERE id = $1',
    [input.ward_id]
  )
  if (!ward) {
    throw new LocationError('invalid_input', 'The ward does not exist')
  }

  // A station is unique by its code and its stream: the same station code can
  // appear once per stream.
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM polling_stations
      WHERE code = $1 AND COALESCE(stream, '') = COALESCE($2, '')`,
    [code, input.stream ?? null]
  )
  if (existing) {
    throw new LocationError(
      'duplicate_code',
      `A polling station with the code ${code}${
        input.stream ? ` and stream ${input.stream}` : ''
      } already exists`,
      { id: existing.id }
    )
  }

  const created = await queryOne<PollingStationRow>(
    `INSERT INTO polling_stations (
       code, name, ward_id, constituency_id, county_id,
       latitude, longitude, registered_voters, location_radius,
       stream, registration_centre
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, code, name, ward_id, constituency_id, county_id,
               latitude, longitude, registered_voters, location_radius,
               stream, registration_centre`,
    [
      code,
      name,
      ward.id,
      ward.constituency_id,
      ward.county_id,
      input.latitude ?? null,
      input.longitude ?? null,
      input.registered_voters ?? 0,
      input.location_radius ?? 500,
      input.stream ?? null,
      input.registration_centre ?? null,
    ]
  )

  await recordAudit({
    userId: actor.userId,
    action: 'polling_station_created',
    entityType: 'polling_station',
    entityId: created?.id,
    newValues: { code, name, ward_id: ward.id },
    ipAddress: actor.ipAddress,
  })

  return created as PollingStationRow
}

/**
 * Update a polling station.
 */
export async function updatePollingStation(
  id: number,
  input: Partial<PollingStationInput>,
  actor: { userId: number; ipAddress?: string | null }
): Promise<PollingStationRow> {
  const current = await queryOne<{
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
  }>(
    `SELECT id, code, name, ward_id, constituency_id, county_id, latitude, longitude,
            registered_voters, location_radius, stream, registration_centre
       FROM polling_stations WHERE id = $1`,
    [id]
  )

  if (!current) {
    throw new LocationError('not_found', 'The polling station does not exist')
  }

  const code = input.code !== undefined ? (input.code || '').trim() : current.code
  const name = input.name !== undefined ? (input.name || '').trim() : current.name
  const stream = input.stream !== undefined ? (input.stream ?? null) : current.stream

  if (!code || !name) {
    throw new LocationError('invalid_input', 'A polling station needs a code and a name')
  }
  if (code.length > MAX_STATION_CODE_LENGTH) {
    throw new LocationError(
      'invalid_input',
      `A polling station code can be at most ${MAX_STATION_CODE_LENGTH} characters`
    )
  }

  if (code !== current.code || (stream ?? '') !== (current.stream ?? '')) {
    const duplicate = await queryOne<{ id: number }>(
      `SELECT id FROM polling_stations
        WHERE code = $1 AND COALESCE(stream, '') = COALESCE($2, '')`,
      [code, stream]
    )
    if (duplicate) {
      throw new LocationError(
        'duplicate_code',
        `A polling station with the code ${code}${
          stream ? ` and stream ${stream}` : ''
        } already exists`,
        { id: duplicate.id }
      )
    }
  }

  let wardId = current.ward_id
  let constituencyId = current.constituency_id
  let countyId = current.county_id

  if (input.ward_id && input.ward_id !== current.ward_id) {
    const ward = await queryOne<{ id: number; constituency_id: number; county_id: number }>(
      'SELECT id, constituency_id, county_id FROM wards WHERE id = $1',
      [input.ward_id]
    )
    if (!ward) {
      throw new LocationError('invalid_input', 'The ward does not exist')
    }
    wardId = ward.id
    constituencyId = ward.constituency_id
    countyId = ward.county_id
  }

  const updated = await queryOne<PollingStationRow>(
    `UPDATE polling_stations
        SET code = $1, name = $2, ward_id = $3, constituency_id = $4, county_id = $5,
            latitude = $6, longitude = $7, registered_voters = $8, location_radius = $9,
            stream = $10, registration_centre = $11
      WHERE id = $12
      RETURNING id, code, name, ward_id, constituency_id, county_id,
                latitude, longitude, registered_voters, location_radius,
                stream, registration_centre`,
    [
      code,
      name,
      wardId,
      constituencyId,
      countyId,
      input.latitude !== undefined ? input.latitude : current.latitude,
      input.longitude !== undefined ? input.longitude : current.longitude,
      input.registered_voters !== undefined
        ? input.registered_voters
        : current.registered_voters,
      input.location_radius !== undefined
        ? input.location_radius
        : current.location_radius,
      stream,
      input.registration_centre !== undefined
        ? input.registration_centre
        : current.registration_centre,
      id,
    ]
  )

  await recordAudit({
    userId: actor.userId,
    action: 'polling_station_updated',
    entityType: 'polling_station',
    entityId: id,
    oldValues: {
      code: current.code,
      name: current.name,
      ward_id: current.ward_id,
      registered_voters: current.registered_voters,
    },
    newValues: { code, name, ward_id: wardId, registered_voters: updated?.registered_voters },
    ipAddress: actor.ipAddress,
  })

  return updated as PollingStationRow
}

/**
 * Delete a polling station.
 *
 * A station that already has submissions is not deleted: the evidence and the
 * history of the election belong to it.
 */
export async function deletePollingStation(
  id: number,
  actor: { userId: number; ipAddress?: string | null }
): Promise<{ deleted: boolean; id: number }> {
  const station = await queryOne<{ id: number; code: string; name: string }>(
    'SELECT id, code, name FROM polling_stations WHERE id = $1',
    [id]
  )
  if (!station) {
    throw new LocationError('not_found', 'The polling station does not exist')
  }

  const submissions = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM submissions WHERE polling_station_id = $1',
    [id]
  )
  const submissionCount = Number(submissions?.total || 0)

  if (submissionCount > 0) {
    throw new LocationError(
      'has_dependents',
      `This polling station already has ${submissionCount} submission(s) and cannot be deleted.`,
      { submission_count: submissionCount }
    )
  }

  const agents = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM agents WHERE polling_station_id = $1',
    [id]
  )
  const agentCount = Number(agents?.total || 0)
  if (agentCount > 0) {
    throw new LocationError(
      'has_dependents',
      `This polling station still has ${agentCount} agent(s) assigned to it.`,
      { agent_count: agentCount }
    )
  }

  await query('DELETE FROM polling_stations WHERE id = $1', [id])

  await recordAudit({
    userId: actor.userId,
    action: 'polling_station_deleted',
    entityType: 'polling_station',
    entityId: id,
    oldValues: { code: station.code, name: station.name },
    ipAddress: actor.ipAddress,
  })

  return { deleted: true, id }
}

/* -------------------------------------------------------------------------- */
/*                              Bulk import                                    */
/* -------------------------------------------------------------------------- */

export interface ImportSummary {
  created: number
  updated: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

/**
 * How serious a problem with a row is.
 *
 * An error stops the row: it is not written. A warning is reported, but the
 * row is still written, because the file is not wrong enough to refuse it.
 */
export type ImportIssueSeverity = 'error' | 'warning'

/**
 * The problems a row of a CSV can have.
 */
export type ImportIssueCode =
  | 'missing_field'
  | 'duplicate_code'
  | 'duplicate_station'
  | 'code_mismatch'
  | 'unmatched_constituency'
  | 'unmatched_ward'
  | 'unmatched_record'
  | 'invalid_code'
  | 'invalid_number'
  | 'invalid_parent'
  | 'parent_mismatch'

export interface ImportIssue {
  /** The line of the file. The header is line 1, so the first row is line 2. */
  row: number
  code: ImportIssueCode
  severity: ImportIssueSeverity
  message: string
  field?: string
}

/**
 * What the import would do with one row of the file.
 */
export interface ImportRowPlan {
  row: number
  action: 'create' | 'update' | 'skip'
  code: string | null
  name: string | null
  /** The constituency of a ward, the ward of a polling station. */
  parent: string | null
  /** The record that would be updated. */
  target_id: number | null
  issues: ImportIssue[]
}

/**
 * The result of reading a file without writing anything.
 *
 * The preview is built from the same plan the import writes, so the numbers
 * of a preview are the numbers the import produces.
 */
export interface ImportPreview {
  type: 'polling_stations'
  total_rows: number
  valid_rows: number
  create?: number
  update: number
  skip: number
  error_rows: number
  warning_rows: number
  issues: ImportIssue[]
  rows: ImportRowPlan[]
}

/* -------------------------------------------------------------------------- */
/*                         The in-memory location cache                       */
/* -------------------------------------------------------------------------- */

interface CachedCounty {
  id: number
  name: string
  code: string
}

interface CachedConstituency {
  id: number
  county_id: number
  name: string
  code: string
  county_name: string | null
}

interface CachedWard {
  id: number
  constituency_id: number
  county_id: number
  name: string
  code: string
}

interface CachedStation {
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

/**
 * The whole electoral geography, read once before a file is planned.
 *
 * A national file carries tens of thousands of stations. Looking each name up
 * in the database while planning turns the import into hundreds of thousands
 * of round trips, which is what made the request time out. The cache is small
 * enough to hold in memory (a few tens of megabytes) and makes planning a
 * purely local operation.
 */
interface LocationCache {
  counties: CachedCounty[]
  constituencies: CachedConstituency[]
  wards: CachedWard[]
  stations: CachedStation[]
  countiesByName: Map<string, CachedCounty>
  constituenciesByName: Map<string, CachedConstituency[]>
  constituenciesByCountyName: Map<string, CachedConstituency>
  wardsByConstituencyName: Map<string, CachedWard>
  wardsById: Map<number, CachedWard>
  wardsByName: Map<string, CachedWard[]>
  stationsById: Map<number, CachedStation>
  stationsByCodeStream: Map<string, CachedStation>
  stationsByWardNameStream: Map<string, CachedStation>
  countyCodes: Set<string>
  constituencyCodes: Set<string>
  wardCodes: Set<string>
}

function countyNameKey(name: string): string {
  return normaliseName(name)
}

function constituencyKey(countyId: number, name: string): string {
  return `${countyId}::${normaliseName(name)}`
}

function wardKey(constituencyId: number, name: string): string {
  return `${constituencyId}::${normaliseName(name)}`
}

function stationCodeKey(code: string, stream: string | null): string {
  return `${code}::${stream ?? ''}`
}

function stationNameKey(
  wardId: number,
  name: string,
  stream: string | null
): string {
  return `${wardId}::${normaliseName(name)}::${stream ?? ''}`
}

/**
 * Read counties, constituencies, wards and polling stations once.
 *
 * The four reads run in parallel. Everything the import needs to match a row
 * is indexed by the same normalised names the planner uses.
 */
async function loadLocationCache(): Promise<LocationCache> {
  const [counties, constituencies, wards, stationRows] = await Promise.all([
    queryMany<CachedCounty>('SELECT id, name, code FROM counties ORDER BY id'),
    queryMany<CachedConstituency>(
      `SELECT c.id, c.county_id, c.name, c.code, co.name AS county_name
         FROM constituencies c
         LEFT JOIN counties co ON co.id = c.county_id
        ORDER BY c.id`
    ),
    queryMany<CachedWard>(
      'SELECT id, constituency_id, county_id, name, code FROM wards ORDER BY id'
    ),
    queryMany<
      Omit<CachedStation, 'latitude' | 'longitude'> & {
        latitude: number | string | null
        longitude: number | string | null
      }
    >(
      `SELECT id, code, name, ward_id, constituency_id, county_id, latitude, longitude,
              registered_voters, location_radius, stream, registration_centre
         FROM polling_stations ORDER BY id`
    ),
  ])

  const cache: LocationCache = {
    counties,
    constituencies,
    wards,
    stations: [],
    countiesByName: new Map(),
    constituenciesByName: new Map(),
    constituenciesByCountyName: new Map(),
    wardsByConstituencyName: new Map(),
    wardsById: new Map(),
    wardsByName: new Map(),
    stationsById: new Map(),
    stationsByCodeStream: new Map(),
    stationsByWardNameStream: new Map(),
    countyCodes: new Set(),
    constituencyCodes: new Set(),
    wardCodes: new Set(),
  }

  for (const county of counties) {
    cache.countiesByName.set(countyNameKey(county.name), county)
    cache.countyCodes.add(county.code)
  }

  for (const constituency of constituencies) {
    const key = countyNameKey(constituency.name)
    const list = cache.constituenciesByName.get(key) ?? []
    list.push(constituency)
    cache.constituenciesByName.set(key, list)
    cache.constituenciesByCountyName.set(
      constituencyKey(constituency.county_id, constituency.name),
      constituency
    )
    cache.constituencyCodes.add(constituency.code)
  }

  for (const ward of wards) {
    const key = countyNameKey(ward.name)
    const list = cache.wardsByName.get(key) ?? []
    list.push(ward)
    cache.wardsByName.set(key, list)
    cache.wardsByConstituencyName.set(
      wardKey(ward.constituency_id, ward.name),
      ward
    )
    cache.wardsById.set(ward.id, ward)
    cache.wardCodes.add(ward.code)
  }

  for (const station of stationRows) {
    const cached: CachedStation = {
      ...station,
      latitude: station.latitude === null ? null : Number(station.latitude),
      longitude: station.longitude === null ? null : Number(station.longitude),
    }
    cache.stations.push(cached)
    cache.stationsById.set(cached.id, cached)
    cache.stationsByCodeStream.set(
      stationCodeKey(cached.code, cached.stream),
      cached
    )
    cache.stationsByWardNameStream.set(
      stationNameKey(cached.ward_id, cached.name, cached.stream),
      cached
    )
  }

  return cache
}

/** A row of a polling station file, resolved against the database. */
interface StationPlanEntry {
  index: number
  row: number
  action: 'update' | 'create'
  /** The station that exists and is updated. */
  existing_id?: number
  code?: string
  /** The fields present in the file. */
  name?: string
  ward_id?: number
  /**
   * The hierarchy to create when the ward of the file is not on the platform
   * yet. A missing level is created from the county down before the station is
   * written.
   */
  ward_name?: string
  ward_code?: string
  constituency_id?: number
  constituency_name?: string
  county_id?: number
  county_name?: string
  latitude?: number
  longitude?: number
  registered_voters?: number
  stream?: string | null
  registration_centre?: string | null
}

interface StationPlan {
  entries: Map<number, StationPlanEntry>
  rows: ImportRowPlan[]
}

/**
 * Parse a CSV file into rows.
 *
 * The header names are matched loosely, so the official IEBC files work
 * without being renamed first.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
  // A spreadsheet often writes a byte order mark before the first header.
  text = text.replace(/^\uFEFF/, '')

  const rows: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (char === '"') {
      // The quote is kept, so a value that contains a comma survives the
      // split of the row. Only the line breaks inside quotes are ignored.
      current += char
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === '\n' && !inQuotes) {
      rows.push(current)
      current = ''
      continue
    }

    if (char === '\r') continue

    current += char
  }
  if (current.trim()) rows.push(current)

  if (rows.length === 0) return []

  // A header is lowercased and its runs of spaces become underscores, so
  // "IEBC Code" reads as "iebc_code" and "Registration Centre" as
  // "registration_centre". This keeps the pick() lists simple and lets the
  // official files work as they are exported.
  const headers = splitCsvRow(rows[0]).map((header) =>
    header.trim().toLowerCase().replace(/\s+/g, '_')
  )

  return rows.slice(1).map((row) => {
    const values = splitCsvRow(row)
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = (values[index] ?? '').trim()
    })
    return record
  })
}

/**
 * The columns a polling-station file must carry.
 *
 * The official IEBC export writes them as
 * `County, Constituency, Ward, IEBC Code, Polling Station, Stream,
 * Registration Centre, Registered Voters`; parseCsv normalises the names, so
 * the file is checked against the normalised form.
 */
export const STATION_CSV_HEADERS = [
  'county',
  'constituency',
  'ward',
  'iebc_code',
  'polling_station',
  'stream',
  'registration_centre',
  'registered_voters',
] as const

/** The normalised column names of a CSV file. */
export function readCsvHeaders(text: string): string[] {
  const firstLine = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim() !== '')
  if (!firstLine) return []

  return splitCsvRow(firstLine).map((header) =>
    header.trim().toLowerCase().replace(/\s+/g, '_')
  )
}

/** The required columns a polling-station file is missing. */
export function missingStationHeaders(text: string): string[] {
  const headers = readCsvHeaders(text)
  return STATION_CSV_HEADERS.filter((header) => !headers.includes(header))
}

/**
 * Split one CSV row, honouring quoted values.
 */
function splitCsvRow(row: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  // The official export is tab separated, but a comma separated file is just
  // as common. Whichever the row carries more of is the delimiter.
  const delimiter = row.includes('\t') ? '\t' : ','

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i]

    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }
  values.push(current)
  return values
}

/**
 * The first value of a row that matches one of the given header names.
 */
function pick(row: Record<string, string>, names: string[]): string | undefined {
  for (const name of names) {
    const value = row[name]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

/**
 * A name, ready to be compared: in capitals and without the extra spaces the
 * official files carry.
 */
function normaliseName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * Read a polling station file and decide what every row would do, without
 * writing.
 *
 * The official IEBC station file names the county, the constituency, the ward,
 * the station, the stream and the registration centre, with one row per stream
 * of a station. A station is matched by its IEBC code and its stream together;
 * when the file carries no code it is matched by its name inside the ward.
 */
function planStationImport(text: string, cache: LocationCache): StationPlan {
  const rows = parseCsv(text)
  const entries = new Map<number, StationPlanEntry>()
  const planned: ImportRowPlan[] = []

  /** The codes of the file with their stream, and the line each one is on. */
  const fileKeys = new Map<string, number>()
  /** The station names of the file inside a ward, and the line each one is on. */
  const fileStationKeys = new Map<string, number>()

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const rowNumber = index + 2
    const issues: ImportIssue[] = []

    const name = pick(row, [
      'polling_station',
      'station_name',
      'polling_station_name',
      'station',
      'name',
    ])
    const code = pick(row, [
      'iebc_code',
      'station_code',
      'polling_station_code',
      'code',
    ])
    const stream = pick(row, ['stream'])
    const registrationCentre = pick(row, [
      'registration_centre',
      'registration center',
      'reg_centre',
    ])
    const wardName = pick(row, ['ward_name', 'ward'])
    const constituencyName = pick(row, ['constituency_name', 'constituency'])
    const countyName = pick(row, ['county', 'county_name'])
    // The official file does not carry a ward code. A file that does can name
    // it, but a generated code is just as good for a created ward.
    const wardCode = pick(row, ['ward_code', 'ward_iebc_code', 'iebc_ward_code'])

    const skip = (issue: ImportIssue): ImportRowPlan => {
      issues.push(issue)
      return {
        row: rowNumber,
        action: 'skip',
        code: code ?? null,
        name: name ?? null,
        parent: wardName ?? null,
        target_id: null,
        issues: [...issues],
      }
    }

    if (!code && !name) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'missing_field',
          severity: 'error',
          message: 'The row needs a station code or a station name to identify the station',
          field: 'station_code',
        })
      )
      continue
    }

    if (code && code.length > MAX_STATION_CODE_LENGTH) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'invalid_code',
          severity: 'error',
          message: `The code "${code}" is longer than ${MAX_STATION_CODE_LENGTH} characters`,
          field: 'station_code',
        })
      )
      continue
    }

    // The station code with the stream: the same code may appear once per
    // stream, but not twice for the same stream.
    const fileKey = `${code ?? ''}::${stream ?? ''}`

    if (code && fileKeys.has(fileKey)) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'duplicate_code',
          severity: 'error',
          message: `The code "${code}"${
            stream ? ` and stream ${stream}` : ''
          } is already used by row ${fileKeys.get(fileKey)}`,
          field: 'station_code',
        })
      )
      continue
    }

    // Resolve the ward the file names, if it names one. A row matched by code
    // does not have to carry the ward: it only moves the station when the
    // file says so. A ward, constituency or county the platform does not have
    // yet is created from the county down when the station is written.
    let ward: CachedWard | null = null

    /** The hierarchy to create when the ward of the file does not exist. */
    let wardToCreate: {
      name: string
      code?: string
      constituency_id?: number
      constituency_name: string
      county_id?: number
      county_name?: string
    } | null = null

    if (wardName) {
      if (constituencyName) {
        const county = countyName
          ? cache.countiesByName.get(normaliseName(countyName))
          : undefined

        let constituency = county
          ? cache.constituenciesByCountyName.get(
              constituencyKey(county.id, constituencyName)
            )
          : cache.constituenciesByName.get(normaliseName(constituencyName))?.[0]

        // A constituency of the same name under another county is still the
        // constituency of the file's ward: the county of the file is reported
        // but never duplicated.
        if (!constituency && county) {
          constituency = cache.constituenciesByName.get(
            normaliseName(constituencyName)
          )?.[0]
        }

        if (constituency) {
          if (
            countyName &&
            constituency.county_name &&
            normaliseName(countyName) !== normaliseName(constituency.county_name)
          ) {
            issues.push({
              row: rowNumber,
              code: 'parent_mismatch',
              severity: 'warning',
              message: `The county "${countyName}" of the file is not the county "${constituency.county_name}" of ${constituencyName}`,
              field: 'county_name',
            })
          }

          ward =
            cache.wardsByConstituencyName.get(
              wardKey(constituency.id, wardName)
            ) ?? null

          if (!ward) {
            wardToCreate = {
              name: wardName,
              code: wardCode,
              constituency_id: constituency.id,
              constituency_name: constituencyName,
              county_id: constituency.county_id,
              county_name: constituency.county_name ?? countyName,
            }
          }
        } else if (countyName) {
          // Both the constituency and the ward are new. The import creates them
          // under the county of the file, and creates the county when it too is
          // new.
          wardToCreate = {
            name: wardName,
            code: wardCode,
            constituency_name: constituencyName,
            county_id: county?.id,
            county_name: county?.name ?? countyName,
          }
        } else {
          planned.push(
            skip({
              row: rowNumber,
              code: 'unmatched_constituency',
              severity: 'error',
              message: `The constituency "${constituencyName}" was not found, and a new constituency needs a county`,
              field: 'constituency_name',
            })
          )
          continue
        }
      } else {
        ward =
          cache.wardsByName.get(normaliseName(wardName))?.[0] ?? null

        if (!ward) {
          planned.push(
            skip({
              row: rowNumber,
              code: 'unmatched_ward',
              severity: 'error',
              message: `The ward "${wardName}" was not found, and a new ward needs a constituency`,
              field: 'ward_name',
            })
          )
          continue
        }
      }
    }

    const latitudeRaw = pick(row, ['latitude', 'lat'])
    const longitudeRaw = pick(row, ['longitude', 'lng', 'long'])
    const latitude = latitudeRaw !== undefined ? parseFloat(latitudeRaw) : undefined
    const longitude = longitudeRaw !== undefined ? parseFloat(longitudeRaw) : undefined
    const votersRaw = pick(row, ['registered_voters', 'voters', 'registered voters'])
    let registeredVoters: number | undefined
    if (votersRaw !== undefined) {
      const parsed = parseInt(votersRaw, 10)
      if (Number.isNaN(parsed)) {
        issues.push({
          row: rowNumber,
          code: 'invalid_number',
          severity: 'warning',
          message: `The registered voters "${votersRaw}" is not a number; it is left as it is`,
          field: 'registered_voters',
        })
      } else {
        registeredVoters = parsed
      }
    }

    // Match by the code and the stream first, then by name inside the ward the
    // file names. A row with a code but no stream matches the station row that
    // also has no stream.
    let existing: CachedStation | null = null

    if (code) {
      existing =
        cache.stationsByCodeStream.get(stationCodeKey(code, stream ?? null)) ??
        null
    }

    if (!existing && name && ward) {
      const byName = cache.stationsByWardNameStream.get(
        stationNameKey(ward.id, name, stream ?? null)
      )
      if (byName) {
        if (code && byName.code !== code) {
          issues.push({
            row: rowNumber,
            code: 'code_mismatch',
            severity: 'warning',
            message: `The station "${name}" in "${wardName}" already has the code "${byName.code}"; the code "${code}" of the file is not written`,
            field: 'iebc_code',
          })
        }
        existing = byName
      }
    }

    // The ward the row writes into. A row matched by code but with no ward of
    // its own keeps the ward the station already has.
    const targetWardKey = ward
      ? `id:${ward.id}`
      : wardToCreate
        ? wardToCreate.constituency_id !== undefined
          ? `constituency:${wardToCreate.constituency_id}::${normaliseName(
              wardToCreate.name
            )}`
          : `new:${normaliseName(wardToCreate.county_name ?? '')}::${normaliseName(
              wardToCreate.constituency_name
            )}::${normaliseName(wardToCreate.name)}`
        : existing
          ? `id:${existing.ward_id}`
          : null

    // Two rows of the file cannot write the same station name and stream into
    // the same ward: the unique index on (ward_id, name, stream) would reject
    // the second one.
    if (name && targetWardKey) {
      const stationKey = `${targetWardKey}::${normaliseName(name)}::${
        stream ?? ''
      }`
      const first = fileStationKeys.get(stationKey)
      if (first !== undefined) {
        planned.push(
          skip({
            row: rowNumber,
            code: 'duplicate_station',
            severity: 'error',
            message: `The station "${name}"${
              stream ? ` and stream ${stream}` : ''
            } is already used by row ${first}`,
            field: 'polling_station',
          })
        )
        continue
      }
    }

    // A code that names one station cannot be used to rename another station
    // onto a name that already belongs to a different station in the same
    // ward.
    if (existing && name && !wardToCreate) {
      const targetWardId = ward?.id ?? existing.ward_id
      const byName = cache.stationsByWardNameStream.get(
        stationNameKey(targetWardId, name, stream ?? null)
      )
      if (byName && byName.id !== existing.id) {
        planned.push(
          skip({
            row: rowNumber,
            code: 'duplicate_station',
            severity: 'error',
            message: `The station "${name}"${
              stream ? ` and stream ${stream}` : ''
            } already exists with the code "${byName.code}" in that ward`,
            field: 'polling_station',
          })
        )
        continue
      }
    }

    if (!existing) {
      if (code) {
        if (!name) {
          planned.push(
            skip({
              row: rowNumber,
              code: 'missing_field',
              severity: 'error',
              message: 'A new polling station needs a name',
              field: 'station_name',
            })
          )
          continue
        }
        if (!ward && !wardToCreate) {
          planned.push(
            skip({
              row: rowNumber,
              code: 'missing_field',
              severity: 'error',
              message: 'A new polling station needs a ward',
              field: 'ward_name',
            })
          )
          continue
        }

        const entry: StationPlanEntry = {
          index: entries.size,
          row: rowNumber,
          action: 'create',
          code,
          name,
          ward_id: ward?.id,
          ward_name: wardToCreate?.name,
          ward_code: wardToCreate?.code,
          constituency_id: wardToCreate?.constituency_id,
          constituency_name: wardToCreate?.constituency_name,
          county_id: wardToCreate?.county_id,
          county_name: wardToCreate?.county_name,
          latitude: latitude !== undefined && !Number.isNaN(latitude) ? latitude : undefined,
          longitude: longitude !== undefined && !Number.isNaN(longitude) ? longitude : undefined,
          registered_voters: registeredVoters,
          stream: stream ?? null,
          registration_centre: registrationCentre ?? null,
        }

        entries.set(rowNumber, entry)
        planned.push({
          row: rowNumber,
          action: 'create',
          code,
          name,
          parent: wardName ?? null,
          target_id: null,
          issues: [...issues],
        })
        if (code) fileKeys.set(fileKey, rowNumber)
        if (name && targetWardKey) {
          fileStationKeys.set(
            `${targetWardKey}::${normaliseName(name)}::${stream ?? ''}`,
            rowNumber
          )
        }
        continue
      } else {
        planned.push(
          skip({
            row: rowNumber,
            code: 'unmatched_record',
            severity: 'error',
            message: `No polling station named "${name}" exists in "${wardName}". The import only updates stations that already exist.`,
            field: code ? 'station_code' : 'station_name',
          })
        )
        continue
      }
    }

    if (code) fileKeys.set(fileKey, rowNumber)
    if (name && targetWardKey) {
      fileStationKeys.set(
        `${targetWardKey}::${normaliseName(name)}::${stream ?? ''}`,
        rowNumber
      )
    }

    // Only the fields the file carries are updated.
    const entry: StationPlanEntry = {
      index: entries.size,
      row: rowNumber,
      action: 'update',
      existing_id: existing.id,
    }
    if (name !== undefined) entry.name = name
    if (ward) entry.ward_id = ward.id
    if (wardToCreate) {
      entry.ward_name = wardToCreate.name
      entry.ward_code = wardToCreate.code
      entry.constituency_id = wardToCreate.constituency_id
      entry.constituency_name = wardToCreate.constituency_name
      entry.county_id = wardToCreate.county_id
      entry.county_name = wardToCreate.county_name
    }
    if (latitude !== undefined && !Number.isNaN(latitude)) entry.latitude = latitude
    if (longitude !== undefined && !Number.isNaN(longitude)) entry.longitude = longitude
    if (registeredVoters !== undefined) entry.registered_voters = registeredVoters
    if (stream !== undefined) entry.stream = stream
    if (registrationCentre !== undefined) entry.registration_centre = registrationCentre

    entries.set(rowNumber, entry)
    planned.push({
      row: rowNumber,
      action: 'update',
      code: existing.code,
      name: name ?? null,
      parent: wardName ?? null,
      target_id: existing.id,
      issues: [...issues],
    })
  }

  return { entries, rows: planned }
}

/** A polling station the import is going to write. */
interface StationWrite {
  row: number
  action: 'create' | 'update'
  existing_id?: number
  code: string
  name: string
  ward_id?: number
  ward_name?: string
  ward_code?: string
  constituency_id?: number
  constituency_name?: string
  county_id?: number
  county_name?: string
  latitude: number | null
  longitude: number | null
  registered_voters: number
  stream: string | null
  registration_centre: string | null
}

/**
 * How many stations one statement writes.
 *
 * A national file has roughly 46,000 rows. Batches of 1,000 keep every
 * statement below the parameter limits and small enough to leave the memory
 * of the function stable, while still reducing the round trips from tens of
 * thousands to a few dozen.
 */
const BULK_BATCH_SIZE = 1000

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

/** Turn one planned row into the values the bulk writer needs. */
function buildStationWrite(
  entry: StationPlanEntry,
  cache: LocationCache
): StationWrite | null {
  if (entry.action === 'create') {
    if (!entry.code || !entry.name) return null

    return {
      row: entry.row,
      action: 'create',
      code: entry.code,
      name: entry.name,
      ward_id: entry.ward_id,
      ward_name: entry.ward_name,
      ward_code: entry.ward_code,
      constituency_id: entry.constituency_id,
      constituency_name: entry.constituency_name,
      county_id: entry.county_id,
      county_name: entry.county_name,
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      registered_voters: entry.registered_voters ?? 0,
      stream: entry.stream ?? null,
      registration_centre: entry.registration_centre ?? null,
    }
  }

  if (entry.existing_id === undefined) return null
  const current = cache.stationsById.get(entry.existing_id)
  if (!current) return null

  // Only the fields the file carries change; the rest keep the value the
  // station already has.
  const write: StationWrite = {
    row: entry.row,
    action: 'update',
    existing_id: current.id,
    code: current.code,
    name: entry.name ?? current.name,
    ward_id: entry.ward_id,
    ward_name: entry.ward_name,
    ward_code: entry.ward_code,
    constituency_id: entry.constituency_id,
    constituency_name: entry.constituency_name,
    county_id: entry.county_id,
    county_name: entry.county_name,
    latitude: entry.latitude ?? current.latitude,
    longitude: entry.longitude ?? current.longitude,
    registered_voters: entry.registered_voters ?? current.registered_voters,
    stream: entry.stream !== undefined ? entry.stream : current.stream,
    registration_centre:
      entry.registration_centre !== undefined
        ? entry.registration_centre
        : current.registration_centre,
  }

  // A row that does not name a ward keeps the station where it is.
  if (entry.ward_id === undefined && entry.ward_name === undefined) {
    write.ward_id = current.ward_id
    write.constituency_id = current.constituency_id
    write.county_id = current.county_id
  }

  return write
}

/**
 * Create the counties, constituencies and wards the file needs.
 *
 * The levels are inserted in bulk, top down, and the cache is updated with
 * the new ids so every station row can be resolved without another query. The
 * number of distinct hierarchy rows is small (47 counties, 290 constituencies
 * and about 1,450 wards for the whole country), so three statements are enough.
 */
async function ensureHierarchy(
  client: PoolClient,
  cache: LocationCache,
  writes: StationWrite[]
): Promise<void> {
  const targets = writes.filter(
    (write) => write.ward_id === undefined && write.ward_name !== undefined
  )

  const countyById = new Map(cache.counties.map((county) => [county.id, county]))
  const constituencyById = new Map(
    cache.constituencies.map((constituency) => [constituency.id, constituency])
  )
  const countyIdsByName = new Map(
    cache.counties.map((county) => [normaliseName(county.name), county.id])
  )
  const constituencyIdsByKey = new Map(
    cache.constituencies.map((constituency) => [
      constituencyKey(constituency.county_id, constituency.name),
      constituency.id,
    ])
  )
  const wardIdsByKey = new Map(
    cache.wards.map((ward) => [wardKey(ward.constituency_id, ward.name), ward.id])
  )

  const resolveCountyId = (target: StationWrite): number | undefined =>
    target.county_id ??
    (target.county_name
      ? countyIdsByName.get(normaliseName(target.county_name))
      : undefined)

  const resolveConstituencyId = (
    target: StationWrite
  ): number | undefined => {
    if (target.constituency_id !== undefined) return target.constituency_id
    const countyId = resolveCountyId(target)
    if (countyId === undefined || !target.constituency_name) return undefined
    return constituencyIdsByKey.get(
      constituencyKey(countyId, target.constituency_name)
    )
  }

  // Counties named by a row whose county is not on the platform.
  const countiesToCreate = new Map<string, string>()
  for (const target of targets) {
    if (target.county_id !== undefined || !target.county_name) continue
    const displayName = target.county_name.trim().replace(/\s+/g, ' ')
    const key = normaliseName(displayName)
    if (!cache.countiesByName.has(key)) {
      countiesToCreate.set(key, displayName)
    }
  }

  if (countiesToCreate.size > 0) {
    const entries = [...countiesToCreate.values()]
    const codes = entries.map((name) =>
      nextUniqueCode(name, cache.countyCodes, MAX_COUNTY_CODE_LENGTH)
    )

    const result = await client.query<CachedCounty>(
      `INSERT INTO counties (name, code)
       SELECT * FROM UNNEST($1::text[], $2::text[])
       RETURNING id, name, code`,
      [entries, codes]
    )

    for (const county of result.rows) {
      const key = normaliseName(county.name)
      cache.counties.push(county)
      cache.countiesByName.set(key, county)
      countyById.set(county.id, county)
      countyIdsByName.set(key, county.id)
    }
  }

  // Constituencies named by a row whose constituency is not under its county.
  const constituenciesToCreate = new Map<
    string,
    { name: string; countyId: number }
  >()
  for (const target of targets) {
    if (target.constituency_id !== undefined || !target.constituency_name) continue

    const countyId =
      target.county_id ??
      (target.county_name
        ? countyIdsByName.get(normaliseName(target.county_name))
        : undefined)
    if (countyId === undefined) {
      throw new LocationError(
        'invalid_input',
        `The row ${target.row} names a new constituency but no county`
      )
    }

    const displayName = target.constituency_name.trim().replace(/\s+/g, ' ')
    const key = constituencyKey(countyId, displayName)
    if (!constituencyIdsByKey.has(key)) {
      constituenciesToCreate.set(key, { name: displayName, countyId })
    }
  }

  if (constituenciesToCreate.size > 0) {
    const entries = [...constituenciesToCreate.values()]
    const names = entries.map((entry) => entry.name)
    const countyIds = entries.map((entry) => entry.countyId)
    const codes = names.map((name) =>
      nextUniqueCode(name, cache.constituencyCodes, MAX_CONSTITUENCY_CODE_LENGTH)
    )

    const result = await client.query<CachedConstituency>(
      `INSERT INTO constituencies (name, code, county_id)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::int[])
       RETURNING id, county_id, name, code`,
      [names, codes, countyIds]
    )

    for (const constituency of result.rows) {
      const created: CachedConstituency = {
        ...constituency,
        county_name: countyById.get(constituency.county_id)?.name ?? null,
      }
      const key = constituencyKey(created.county_id, created.name)
      cache.constituencies.push(created)
      cache.constituenciesByName.set(normaliseName(created.name), [
        ...(cache.constituenciesByName.get(normaliseName(created.name)) ?? []),
        created,
      ])
      cache.constituenciesByCountyName.set(key, created)
      constituencyById.set(created.id, created)
      constituencyIdsByKey.set(key, created.id)
    }
  }

  // Wards named by a row whose ward is not under its constituency.
  const wardsToCreate = new Map<
    string,
    {
      name: string
      constituencyId: number
      countyId: number
      preferredCode?: string
    }
  >()
  for (const target of targets) {
    if (!target.ward_name) continue

    const constituencyId = resolveConstituencyId(target)
    if (constituencyId === undefined) {
      throw new LocationError(
        'invalid_input',
        `The row ${target.row} names a constituency that could not be resolved`
      )
    }

    const constituency = constituencyById.get(constituencyId)
    const countyId = target.county_id ?? constituency?.county_id
    if (countyId === undefined) {
      throw new LocationError(
        'invalid_input',
        `The row ${target.row} names a ward without a county`
      )
    }

    const displayName = target.ward_name.trim().replace(/\s+/g, ' ')
    const key = wardKey(constituencyId, displayName)
    if (!wardIdsByKey.has(key)) {
      wardsToCreate.set(key, {
        name: displayName,
        constituencyId,
        countyId,
        preferredCode: target.ward_code,
      })
    }
  }

  if (wardsToCreate.size > 0) {
    const entries = [...wardsToCreate.values()]
    const names = entries.map((entry) => entry.name)
    const constituencyIds = entries.map((entry) => entry.constituencyId)
    const countyIds = entries.map((entry) => entry.countyId)
    const codes = entries.map((entry) => {
      const preferred = (entry.preferredCode || '').trim()
      if (
        preferred &&
        preferred.length <= MAX_WARD_CODE_LENGTH &&
        !cache.wardCodes.has(preferred)
      ) {
        cache.wardCodes.add(preferred)
        return preferred
      }
      return nextUniqueCode(entry.name, cache.wardCodes, MAX_WARD_CODE_LENGTH)
    })

    const result = await client.query<CachedWard>(
      `INSERT INTO wards (name, code, constituency_id, county_id)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::int[], $4::int[])
       RETURNING id, name, code, constituency_id, county_id`,
      [names, codes, constituencyIds, countyIds]
    )

    for (const ward of result.rows) {
      const key = wardKey(ward.constituency_id, ward.name)
      cache.wards.push(ward)
      cache.wardsByConstituencyName.set(key, ward)
      cache.wardsById.set(ward.id, ward)
      wardIdsByKey.set(key, ward.id)
    }
  }

  // Point each row at the ward it named, whether that ward existed already or
  // was just created.
  for (const target of targets) {
    if (!target.ward_name) continue
    const constituencyId = resolveConstituencyId(target)
    if (constituencyId === undefined) {
      throw new LocationError(
        'invalid_input',
        `The row ${target.row} names a constituency that could not be resolved`
      )
    }
    const wardId = wardIdsByKey.get(
      wardKey(constituencyId, target.ward_name)
    )
    if (wardId === undefined) {
      throw new LocationError(
        'invalid_input',
        `The row ${target.row} names a ward that could not be resolved`
      )
    }
    target.ward_id = wardId
  }

  // Every write now has a ward. The constituency and county always follow it,
  // so the bulk statements cannot write a station into a ward of another area.
  for (const write of writes) {
    if (write.ward_id === undefined) {
      throw new LocationError(
        'invalid_input',
        `The row ${write.row} does not name a ward`
      )
    }
    const ward = cache.wardsById.get(write.ward_id)
    if (!ward) {
      throw new LocationError(
        'invalid_input',
        `The ward of row ${write.row} could not be resolved`
      )
    }
    write.constituency_id = ward.constituency_id
    write.county_id = ward.county_id
  }
}

/** Insert one batch of new stations and report which codes it wrote. */
async function insertStationBatch(
  client: PoolClient,
  batch: StationWrite[]
): Promise<Set<string>> {
  const result = await client.query<{ code: string; stream: string | null }>(
    `INSERT INTO polling_stations (
       code, name, ward_id, constituency_id, county_id,
       latitude, longitude, registered_voters, location_radius,
       stream, registration_centre
     )
     SELECT * FROM UNNEST(
       $1::text[], $2::text[], $3::int[], $4::int[], $5::int[],
       $6::numeric[], $7::numeric[], $8::int[], $9::int[],
       $10::text[], $11::text[]
     )
     ON CONFLICT DO NOTHING
     RETURNING code, stream`,
    [
      batch.map((write) => write.code),
      batch.map((write) => write.name),
      batch.map((write) => write.ward_id),
      batch.map((write) => write.constituency_id),
      batch.map((write) => write.county_id),
      batch.map((write) => write.latitude),
      batch.map((write) => write.longitude),
      batch.map((write) => write.registered_voters),
      batch.map(() => 500),
      batch.map((write) => write.stream),
      batch.map((write) => write.registration_centre),
    ]
  )

  return new Set(
    result.rows.map((row) => stationCodeKey(row.code, row.stream))
  )
}

/** Update one batch of existing stations. */
async function updateStationBatch(
  client: PoolClient,
  batch: StationWrite[]
): Promise<number> {
  const result = await client.query(
    `UPDATE polling_stations AS ps
        SET code = v.code,
            name = v.name,
            ward_id = v.ward_id,
            constituency_id = v.constituency_id,
            county_id = v.county_id,
            latitude = v.latitude,
            longitude = v.longitude,
            registered_voters = v.registered_voters,
            stream = v.stream,
            registration_centre = v.registration_centre
       FROM (
         SELECT * FROM UNNEST(
           $1::int[], $2::text[], $3::text[], $4::int[], $5::int[], $6::int[],
           $7::numeric[], $8::numeric[], $9::int[], $10::text[], $11::text[]
         ) AS t(id, code, name, ward_id, constituency_id, county_id,
                 latitude, longitude, registered_voters, stream,
                 registration_centre)
       ) AS v
      WHERE ps.id = v.id`,
    [
      batch.map((write) => write.existing_id),
      batch.map((write) => write.code),
      batch.map((write) => write.name),
      batch.map((write) => write.ward_id),
      batch.map((write) => write.constituency_id),
      batch.map((write) => write.county_id),
      batch.map((write) => write.latitude),
      batch.map((write) => write.longitude),
      batch.map((write) => write.registered_voters),
      batch.map((write) => write.stream),
      batch.map((write) => write.registration_centre),
    ]
  )

  return result.rowCount ?? batch.length
}

/**
 * Refuse a bulk import while the database still has the old row-level trigger.
 *
 * Migration 020 rolled the parent totals up once per station. Without the
 * statement-level triggers of migration 024, a national file makes the
 * database do that work tens of thousands of times and the request times out.
 * Failing immediately with a clear message is better than a 504.
 */
async function assertBulkImportReady(): Promise<void> {
  const trigger = await queryOne<{ has_row_level: boolean }>(
    `SELECT bool_or((tgtype & 1) = 1) AS has_row_level
       FROM pg_trigger
      WHERE tgrelid = 'polling_stations'::regclass
        AND tgname IN (
          'trg_sync_registered_voters_ins',
          'trg_sync_registered_voters_upd',
          'trg_sync_registered_voters_del'
        )`
  )

  if (trigger?.has_row_level) {
    throw new LocationError(
      'conflict',
      'The database still has the per-row voter roll-up trigger. Apply migration 024_bulk_import_station_triggers.sql before importing a large file.'
    )
  }
}

/**
 * Import polling stations from a CSV.
 *
 * The file is planned first, exactly as the preview plans it, and the plan is
 * then written in batches. The whole write is one transaction: a file either
 * lands completely or not at all. The voter totals are rolled up once, after
 * the last batch, instead of once per station.
 */
export async function importPollingStationsFromCsv(
  text: string,
  actor: { userId: number; ipAddress?: string | null }
): Promise<ImportSummary> {
  await assertBulkImportReady()
  const cache = await loadLocationCache()
  const plan = planStationImport(text, cache)
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] }
  const writes: StationWrite[] = []

  for (const row of plan.rows) {
    if (row.action === 'skip') {
      summary.skipped += 1
      summary.errors.push({ row: row.row, message: importErrorMessage(row.issues) })
      continue
    }

    const entry = plan.entries.get(row.row)
    if (!entry) continue

    const write = buildStationWrite(entry, cache)
    if (!write) {
      summary.skipped += 1
      summary.errors.push({
        row: row.row,
        message: 'The station could not be resolved',
      })
      continue
    }
    writes.push(write)
  }

  if (writes.length > 0) {
    let created = 0
    let updated = 0

    await transaction(async (client) => {
      // The row-level roll-up is the expensive part of a large import. The
      // transaction-local flag makes the station triggers do nothing while the
      // batches are written; the file is rolled up once below.
      await client.query(
        `SELECT set_config('ukwelitally.bulk_import', 'on', true)`
      )

      await ensureHierarchy(client, cache, writes)

      const creates = writes.filter((write) => write.action === 'create')
      const updates = writes.filter((write) => write.action === 'update')

      for (const batch of chunk(creates, BULK_BATCH_SIZE)) {
        const inserted = await insertStationBatch(client, batch)
        for (const write of batch) {
          if (inserted.has(stationCodeKey(write.code, write.stream))) {
            created += 1
          } else {
            summary.skipped += 1
            summary.errors.push({
              row: write.row,
              message: `The station "${write.name}"${
                write.stream ? ` and stream ${write.stream}` : ''
              } already exists`,
            })
          }
        }
      }

      for (const batch of chunk(updates, BULK_BATCH_SIZE)) {
        updated += await updateStationBatch(client, batch)
      }

      await client.query('SELECT * FROM sync_registered_voters_from_stations()')
    })

    summary.created = created
    summary.updated = updated

    await recordAudit({
      userId: actor.userId,
      action: 'polling_stations_imported',
      entityType: 'polling_station',
      newValues: {
        created,
        updated,
        skipped: summary.skipped,
        total_rows: plan.rows.length,
      },
      ipAddress: actor.ipAddress,
    })
  }

  return summary
}

/**
 * Read a polling station file and report what the import would do, without
 * writing.
 */
export async function previewPollingStationsImport(text: string): Promise<ImportPreview> {
  const cache = await loadLocationCache()
  const plan = planStationImport(text, cache)
  return summarisePreview('polling_stations', plan.rows)
}

/**
 * Count the rows of a plan.
 */
function summarisePreview(
  type: 'polling_stations',
  rows: ImportRowPlan[]
): ImportPreview {
  const issues = rows.flatMap((row) => row.issues)
  return {
    type,
    total_rows: rows.length,
    valid_rows: rows.filter((row) => row.action !== 'skip').length,
    create: rows.filter((row) => row.action === 'create').length,
    update: rows.filter((row) => row.action === 'update').length,
    skip: rows.filter((row) => row.action === 'skip').length,
    error_rows: rows.filter((row) =>
      row.issues.some((issue) => issue.severity === 'error')
    ).length,
    warning_rows: rows.filter((row) =>
      row.issues.some((issue) => issue.severity === 'warning')
    ).length,
    issues,
    rows,
  }
}

/**
 * The message that explains why a row was skipped.
 */
function importErrorMessage(issues: ImportIssue[]): string {
  const errors = issues.filter((issue) => issue.severity === 'error')
  if (errors.length === 0) return 'The row was skipped'
  return errors.map((issue) => issue.message).join(' ')
}

/**
 * The placeholder wards the geography seeder creates.
 *
 * They are named "<Constituency> Ward <n>", have no polling stations and no
 * registered voters, and they are the wards a real IEBC ward list replaces.
 */
export async function findPlaceholderWards(): Promise<
  Array<{ id: number; code: string; name: string; constituency_id: number; station_count: number }>
> {
  return queryMany(
    `SELECT w.id, w.code, w.name, w.constituency_id,
            (SELECT COUNT(*) FROM polling_stations ps WHERE ps.ward_id = w.id) AS station_count
       FROM wards w
      WHERE w.name ~ 'Ward [0-9]+$'
        AND w.registered_voters = 0
      ORDER BY w.id`
  )
}

/**
 * Remove the placeholder wards that nothing depends on.
 *
 * A ward with polling stations or with an agent is kept: removing it would
 * break the station or the team that is attached to it.
 */
export async function prunePlaceholderWards(
  actor: { userId: number; ipAddress?: string | null },
  dryRun = true
): Promise<{ removed: number; kept: Array<{ id: number; name: string; reason: string }> }> {
  const candidates = await findPlaceholderWards()
  const kept: Array<{ id: number; name: string; reason: string }> = []
  let removed = 0

  for (const ward of candidates) {
    const agents = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM agents a
         JOIN polling_stations ps ON ps.id = a.polling_station_id
        WHERE ps.ward_id = $1`,
      [ward.id]
    )
    const agentCount = Number(agents?.total || 0)

    if (ward.station_count > 0 || agentCount > 0) {
      kept.push({
        id: ward.id,
        name: ward.name,
        reason:
          ward.station_count > 0
            ? `${ward.station_count} polling station(s) are still attached`
            : `${agentCount} agent(s) are still attached`,
      })
      continue
    }

    if (!dryRun) {
      await query('DELETE FROM wards WHERE id = $1', [ward.id])
      await recordAudit({
        userId: actor.userId,
        action: 'placeholder_ward_removed',
        entityType: 'ward',
        entityId: ward.id,
        oldValues: { code: ward.code, name: ward.name },
        ipAddress: actor.ipAddress,
      })
    }
    removed += 1
  }

  return { removed, kept }
}

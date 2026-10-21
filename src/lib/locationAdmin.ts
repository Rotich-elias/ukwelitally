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

/** The widest code a ward can have (wards.code is VARCHAR(10)). */
export const MAX_WARD_CODE_LENGTH = 10
/** The widest code a polling station can have (polling_stations.code is VARCHAR(50)). */
export const MAX_STATION_CODE_LENGTH = 50

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

  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM polling_stations WHERE code = $1',
    [code]
  )
  if (existing) {
    throw new LocationError(
      'duplicate_code',
      `A polling station with the code ${code} already exists`,
      { id: existing.id }
    )
  }

  const created = await queryOne<PollingStationRow>(
    `INSERT INTO polling_stations (
       code, name, ward_id, constituency_id, county_id,
       latitude, longitude, registered_voters, location_radius
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, code, name, ward_id, constituency_id, county_id,
               latitude, longitude, registered_voters, location_radius`,
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
  }>(
    `SELECT id, code, name, ward_id, constituency_id, county_id, latitude, longitude,
            registered_voters, location_radius
       FROM polling_stations WHERE id = $1`,
    [id]
  )

  if (!current) {
    throw new LocationError('not_found', 'The polling station does not exist')
  }

  const code = input.code !== undefined ? (input.code || '').trim() : current.code
  const name = input.name !== undefined ? (input.name || '').trim() : current.name

  if (!code || !name) {
    throw new LocationError('invalid_input', 'A polling station needs a code and a name')
  }
  if (code.length > MAX_STATION_CODE_LENGTH) {
    throw new LocationError(
      'invalid_input',
      `A polling station code can be at most ${MAX_STATION_CODE_LENGTH} characters`
    )
  }

  if (code !== current.code) {
    const duplicate = await queryOne<{ id: number }>(
      'SELECT id FROM polling_stations WHERE code = $1',
      [code]
    )
    if (duplicate) {
      throw new LocationError(
        'duplicate_code',
        `A polling station with the code ${code} already exists`,
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
            latitude = $6, longitude = $7, registered_voters = $8, location_radius = $9
      WHERE id = $10
      RETURNING id, code, name, ward_id, constituency_id, county_id,
                latitude, longitude, registered_voters, location_radius`,
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
  | 'duplicate_name'
  | 'unmatched_constituency'
  | 'unmatched_ward'
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
  type: 'wards' | 'polling_stations'
  total_rows: number
  valid_rows: number
  create: number
  update: number
  skip: number
  error_rows: number
  warning_rows: number
  issues: ImportIssue[]
  rows: ImportRowPlan[]
}

/** A row of a ward file, resolved against the database. */
interface WardPlanEntry {
  index: number
  row: number
  action: 'create' | 'update'
  code: string
  name: string
  constituency_id: number
  registered_voters: number | undefined
  /** The ward that exists already and would be updated. */
  existing_id: number | null
  /** The entry of this file that holds the ward this row updates. */
  target_index: number | null
}

/** A row of a polling station file, resolved against the database. */
interface StationPlanEntry {
  index: number
  row: number
  action: 'create' | 'update'
  code: string
  name: string
  ward_id: number
  latitude: number | undefined
  longitude: number | undefined
  registered_voters: number | undefined
  /** The station that exists already and would be updated. */
  existing_id: number | null
}

interface WardPlan {
  /** The rows that would be written, by the line of the file. */
  entries: Map<number, WardPlanEntry>
  /** Every row of the file. */
  rows: ImportRowPlan[]
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

  const headers = splitCsvRow(rows[0]).map((header) => header.trim().toLowerCase())

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
 * Split one CSV row, honouring quoted values.
 */
function splitCsvRow(row: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

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

    if (char === ',' && !inQuotes) {
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
 * Read a ward file and decide what every row would do, without writing.
 *
 * The plan is the same work the import does: the same lookups, the same
 * matching and the same refusals. The import writes the plan, so a preview
 * and a real run agree row for row.
 */
async function planWardImport(text: string): Promise<WardPlan> {
  const rows = parseCsv(text)
  const entries = new Map<number, WardPlanEntry>()
  const planned: ImportRowPlan[] = []

  /** The codes of the file, and the line each one is on. */
  const fileCodes = new Map<string, number>()
  /** The wards the file creates, by constituency and name. */
  const fileWards = new Map<string, number>()

  let nextCode = await nextWardCodeNumber()

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const rowNumber = index + 2
    const issues: ImportIssue[] = []

    const name = pick(row, ['ward_name', 'ward', 'name'])
    const constituencyName = pick(row, ['constituency_name', 'constituency'])
    const countyName = pick(row, ['county_name', 'county'])
    const rawCode = pick(row, ['code', 'ward_code'])

    const skip = (issue: ImportIssue): ImportRowPlan => {
      issues.push(issue)
      return {
        row: rowNumber,
        action: 'skip',
        code: rawCode ?? null,
        name: name ?? null,
        parent: constituencyName ?? null,
        target_id: null,
        issues: [...issues],
      }
    }

    if (!name) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'missing_field',
          severity: 'error',
          message: 'The row has no ward name',
          field: 'ward_name',
        })
      )
      continue
    }

    if (!constituencyName) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'missing_field',
          severity: 'error',
          message: 'The row has no constituency name',
          field: 'constituency_name',
        })
      )
      continue
    }

    const constituency = await queryOne<{
      id: number
      county_id: number
      county_name: string | null
    }>(
      `SELECT c.id, c.county_id, co.name AS county_name
         FROM constituencies c
         LEFT JOIN counties co ON co.id = c.county_id
        WHERE REGEXP_REPLACE(UPPER(TRIM(c.name)), '\\s+', ' ', 'g')
            = REGEXP_REPLACE(UPPER(TRIM($1)), '\\s+', ' ', 'g')
        LIMIT 1`,
      [constituencyName]
    )

    if (!constituency) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'unmatched_constituency',
          severity: 'error',
          message: `The constituency "${constituencyName}" of the file is not one of the constituencies of this platform`,
          field: 'constituency_name',
        })
      )
      continue
    }

    if (rawCode && rawCode.length > MAX_WARD_CODE_LENGTH) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'invalid_code',
          severity: 'error',
          message: `The code "${rawCode}" is longer than ${MAX_WARD_CODE_LENGTH} characters`,
          field: 'code',
        })
      )
      continue
    }

    if (rawCode && fileCodes.has(rawCode)) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'duplicate_code',
          severity: 'error',
          message: `The code "${rawCode}" is already used by row ${fileCodes.get(rawCode)}`,
          field: 'code',
        })
      )
      continue
    }

    // The number of the registered voters.
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

    // The county of the file against the county of the constituency.
    if (
      countyName &&
      constituency.county_name &&
      normaliseName(countyName) !== normaliseName(constituency.county_name)
    ) {
      issues.push({
        row: rowNumber,
        code: 'parent_mismatch',
        severity: 'warning',
        message: `The county "${countyName}" of the file is not the county "${constituency.county_name}" of ${constituencyName}; the county of the constituency is used`,
        field: 'county_name',
      })
    }

    const nameKey = `${constituency.id}::${normaliseName(name)}`
    const fileIndex = fileWards.get(nameKey)

    if (fileIndex !== undefined) {
      // The same ward twice in the file: the second row updates the first.
      const first = planEntry(entries, fileIndex)
      issues.push({
        row: rowNumber,
        code: 'duplicate_name',
        severity: 'warning',
        message: `The ward "${name}" is already on row ${first.row}; this row updates it`,
        field: 'ward_name',
      })
      entries.set(rowNumber, {
        index: entries.size,
        row: rowNumber,
        action: 'update',
        code: first.code,
        name,
        constituency_id: constituency.id,
        registered_voters: registeredVoters,
        existing_id: first.existing_id,
        target_index: first.existing_id === null ? fileIndex : null,
      })
      planned.push({
        row: rowNumber,
        action: 'update',
        code: first.code,
        name,
        parent: constituencyName,
        target_id: null,
        issues: [...issues],
      })
      continue
    }

    const existing = await queryOne<{ id: number; code: string }>(
      `SELECT id, code FROM wards
        WHERE (code = $1 AND $1 <> '')
           OR (REGEXP_REPLACE(UPPER(TRIM(name)), '\\s+', ' ', 'g')
               = REGEXP_REPLACE(UPPER(TRIM($2)), '\\s+', ' ', 'g')
               AND constituency_id = $3)
        ORDER BY id
        LIMIT 1`,
      [rawCode ?? '', name, constituency.id]
    )

    if (existing) {
      entries.set(rowNumber, {
        index: entries.size,
        row: rowNumber,
        action: 'update',
        code: existing.code,
        name,
        constituency_id: constituency.id,
        registered_voters: registeredVoters,
        existing_id: existing.id,
        target_index: null,
      })
      planned.push({
        row: rowNumber,
        action: 'update',
        code: existing.code,
        name,
        parent: constituencyName,
        target_id: existing.id,
        issues: [...issues],
      })
      continue
    }

    // A new ward: it needs a code of its own.
    let code = rawCode ?? null
    if (!code) {
      code = await resolveWardCode(nextCode, fileCodes)
      nextCode = Number(code.replace(/^W/, '')) + 1
    }
    fileCodes.set(code, rowNumber)

    entries.set(rowNumber, {
      index: entries.size,
      row: rowNumber,
      action: 'create',
      code,
      name,
      constituency_id: constituency.id,
      registered_voters: registeredVoters,
      existing_id: null,
      target_index: null,
    })
    fileWards.set(nameKey, entries.size - 1)
    planned.push({
      row: rowNumber,
      action: 'create',
      code,
      name,
      parent: constituencyName,
      target_id: null,
      issues: [...issues],
    })
  }

  return { entries, rows: planned }
}

/**
 * Import wards from a CSV.
 *
 * The file is planned first, exactly as the preview plans it, and the plan
 * is then written.
 */
export async function importWardsFromCsv(
  text: string,
  actor: { userId: number; ipAddress?: string | null }
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] }
  const plan = await planWardImport(text)
  /** The wards this file created, so a second row can update them. */
  const created = new Map<number, number>()

  for (const row of plan.rows) {
    if (row.action === 'skip') {
      summary.skipped += 1
      summary.errors.push({ row: row.row, message: importErrorMessage(row.issues) })
      continue
    }

    const entry = plan.entries.get(row.row)
    if (!entry) continue

    try {
      if (entry.action === 'update' && entry.existing_id !== null) {
        await updateWard(
          entry.existing_id,
          {
            name: entry.name,
            constituency_id: entry.constituency_id,
            registered_voters: entry.registered_voters,
          },
          actor
        )
        summary.updated += 1
      } else if (entry.action === 'update' && entry.target_index !== null) {
        const targetId = created.get(entry.target_index)
        if (!targetId) {
          throw new LocationError('conflict', 'The ward this row updates was not created')
        }
        await updateWard(
          targetId,
          {
            name: entry.name,
            constituency_id: entry.constituency_id,
            registered_voters: entry.registered_voters,
          },
          actor
        )
        summary.updated += 1
      } else {
        const ward = await createWard(
          {
            code: entry.code,
            name: entry.name,
            constituency_id: entry.constituency_id,
            registered_voters: entry.registered_voters ?? 0,
          },
          actor
        )
        created.set(entry.index, ward?.id ?? 0)
        summary.created += 1
      }
    } catch (error) {
      summary.skipped += 1
      summary.errors.push({
        row: row.row,
        message: error instanceof Error ? error.message : 'Could not save the ward',
      })
    }
  }

  return summary
}

/**
 * Read the ward of a plan entry by its position in the file.
 */
function planEntry(entries: Map<number, WardPlanEntry>, index: number): WardPlanEntry {
  for (const entry of entries.values()) {
    if (entry.index === index) return entry
  }
  throw new LocationError('conflict', 'The ward this row updates was not found in the file')
}

/**
 * Read a polling station file and decide what every row would do, without
 * writing.
 *
 * The official IEBC station file names the ward, so the ward is looked up by
 * its name in the constituency the file names.
 */
async function planStationImport(text: string): Promise<StationPlan> {
  const rows = parseCsv(text)
  const entries = new Map<number, StationPlanEntry>()
  const planned: ImportRowPlan[] = []

  /** The codes of the file, and the line each one is on. */
  const fileCodes = new Map<string, number>()

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const rowNumber = index + 2
    const issues: ImportIssue[] = []

    const name = pick(row, ['station_name', 'polling_station_name', 'station', 'name'])
    const code = pick(row, ['station_code', 'code', 'polling_station_code'])
    const wardName = pick(row, ['ward_name', 'ward'])
    const constituencyName = pick(row, ['constituency_name', 'constituency'])

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

    if (!name) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'missing_field',
          severity: 'error',
          message: 'The row has no polling station name',
          field: 'station_name',
        })
      )
      continue
    }

    if (!code) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'missing_field',
          severity: 'error',
          message: 'The row has no polling station code',
          field: 'station_code',
        })
      )
      continue
    }

    if (!wardName) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'missing_field',
          severity: 'error',
          message: 'The row has no ward name',
          field: 'ward_name',
        })
      )
      continue
    }

    if (code.length > MAX_STATION_CODE_LENGTH) {
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

    if (fileCodes.has(code)) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'duplicate_code',
          severity: 'error',
          message: `The code "${code}" is already used by row ${fileCodes.get(code)}`,
          field: 'station_code',
        })
      )
      continue
    }

    // The ward of the station. The county and the constituency of the station
    // follow the ward, so the ward has to be one that exists, and it has to
    // be the one of the constituency the file names.
    const wardRows = await queryMany<{
      id: number
      constituency_id: number
      constituency_name: string | null
    }>(
      `SELECT w.id, w.constituency_id, c.name AS constituency_name
         FROM wards w
         LEFT JOIN constituencies c ON c.id = w.constituency_id
        WHERE REGEXP_REPLACE(UPPER(TRIM(w.name)), '\\s+', ' ', 'g')
            = REGEXP_REPLACE(UPPER(TRIM($1)), '\\s+', ' ', 'g')
        ORDER BY w.id`,
      [wardName]
    )

    let ward: { id: number; constituency_id: number; constituency_name: string | null } | null = null

    if (wardRows.length > 0) {
      if (constituencyName) {
        ward =
          wardRows.find(
            (candidate) =>
              normaliseName(candidate.constituency_name || '') === normaliseName(constituencyName)
          ) || null
        if (!ward) {
          const other = wardRows[0]
          planned.push(
            skip({
              row: rowNumber,
              code: 'invalid_parent',
              severity: 'error',
              message: `The ward "${wardName}" is in ${other.constituency_name ?? 'another constituency'}, not in ${constituencyName}`,
              field: 'ward_name',
            })
          )
          continue
        }
      } else {
        ward = wardRows[0]
      }
    }

    if (!ward) {
      planned.push(
        skip({
          row: rowNumber,
          code: 'unmatched_ward',
          severity: 'error',
          message: `The ward "${wardName}" was not found`,
          field: 'ward_name',
        })
      )
      continue
    }

    const latitude = parseFloat(pick(row, ['latitude', 'lat']) ?? '')
    const longitude = parseFloat(pick(row, ['longitude', 'lng', 'long']) ?? '')
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

    const existing = await queryOne<{ id: number }>(
      'SELECT id FROM polling_stations WHERE code = $1',
      [code]
    )
    fileCodes.set(code, rowNumber)

    entries.set(rowNumber, {
      index: entries.size,
      row: rowNumber,
      action: existing ? 'update' : 'create',
      code,
      name,
      ward_id: ward.id,
      latitude: Number.isNaN(latitude) ? undefined : latitude,
      longitude: Number.isNaN(longitude) ? undefined : longitude,
      registered_voters: registeredVoters,
      existing_id: existing?.id ?? null,
    })
    planned.push({
      row: rowNumber,
      action: existing ? 'update' : 'create',
      code,
      name,
      parent: wardName,
      target_id: existing?.id ?? null,
      issues: [...issues],
    })
  }

  return { entries, rows: planned }
}

/**
 * Import polling stations from a CSV.
 *
 * The file is planned first, exactly as the preview plans it, and the plan
 * is then written.
 */
export async function importPollingStationsFromCsv(
  text: string,
  actor: { userId: number; ipAddress?: string | null }
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] }
  const plan = await planStationImport(text)

  for (const row of plan.rows) {
    if (row.action === 'skip') {
      summary.skipped += 1
      summary.errors.push({ row: row.row, message: importErrorMessage(row.issues) })
      continue
    }

    const entry = plan.entries.get(row.row)
    if (!entry) continue

    try {
      if (entry.action === 'update' && entry.existing_id !== null) {
        await updatePollingStation(
          entry.existing_id,
          {
            name: entry.name,
            ward_id: entry.ward_id,
            latitude: entry.latitude,
            longitude: entry.longitude,
            registered_voters: entry.registered_voters,
          },
          actor
        )
        summary.updated += 1
      } else {
        await createPollingStation(
          {
            code: entry.code,
            name: entry.name,
            ward_id: entry.ward_id,
            latitude: entry.latitude ?? null,
            longitude: entry.longitude ?? null,
            registered_voters: entry.registered_voters ?? 0,
          },
          actor
        )
        summary.created += 1
      }
    } catch (error) {
      summary.skipped += 1
      summary.errors.push({
        row: row.row,
        message: error instanceof Error ? error.message : 'Could not save the station',
      })
    }
  }

  return summary
}

/**
 * Read a ward file and report what the import would do, without writing.
 */
export async function previewWardsImport(text: string): Promise<ImportPreview> {
  const plan = await planWardImport(text)
  return summarisePreview('wards', plan.rows)
}

/**
 * Read a polling station file and report what the import would do, without
 * writing.
 */
export async function previewPollingStationsImport(text: string): Promise<ImportPreview> {
  const plan = await planStationImport(text)
  return summarisePreview('polling_stations', plan.rows)
}

/**
 * Count the rows of a plan.
 */
function summarisePreview(
  type: 'wards' | 'polling_stations',
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
 * The number of the next free ward code.
 *
 * The codes are a "W" followed by the number, so the number starts at the
 * second character.
 */
async function nextWardCodeNumber(): Promise<number> {
  const row = await queryOne<{ next: number }>(
    `SELECT COALESCE(MAX(SUBSTRING(code FROM 2)::int), 0) + 1 AS next
       FROM wards
      WHERE code ~ '^W[0-9]+$'`,
    []
  )
  return Number(row?.next || 1)
}

/**
 * Find a code for a ward that has none.
 *
 * A code that the file or the database already uses is passed over, so the
 * plan of a file and the file that is written agree.
 */
async function resolveWardCode(start: number, taken: Map<string, number>): Promise<string> {
  let number = Math.max(start, 1)

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = `W${String(number).padStart(4, '0')}`
    if (!taken.has(candidate)) {
      const existing = await queryOne<{ id: number }>('SELECT id FROM wards WHERE code = $1', [
        candidate,
      ])
      if (!existing) return candidate
    }
    number += 1
  }

  throw new LocationError('conflict', 'Could not find a free code for the ward')
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

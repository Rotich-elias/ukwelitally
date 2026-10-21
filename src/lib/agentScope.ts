import { queryOne, queryMany } from '@/lib/db'
import { getCandidateProfile, type CandidateProfile } from '@/lib/candidate-restrictions'

/**
 * The geographic scope a candidate may assign agents in.
 *
 * The scope is derived from the candidate's own race and electoral area, so
 * the candidate never has to pick the county, constituency and ward they
 * already belong to:
 *
 *   - member of county assembly  -> the stations of their ward
 *   - member of parliament      -> the stations of their constituency
 *   - governor / senator /
 *     woman representative      -> the stations of their county
 *   - president                 -> every station in the country
 *
 * The same scope is used to list the stations and to validate an assignment,
 * so the interface and the API can never disagree.
 */

export type AssignmentScopeLevel = 'ward' | 'constituency' | 'county' | 'national'

export interface AssignmentScope {
  position: string
  level: AssignmentScopeLevel
  /** Human readable description of the scope. */
  label: string
  county_id: number | null
  constituency_id: number | null
  ward_id: number | null
  /** True when the candidate may assign agents anywhere in the country. */
  national: boolean
}

export interface AssignableStation {
  id: number
  name: string
  code: string
  registered_voters: number
  ward_id: number
  ward_name: string
  constituency_id: number
  constituency_name: string
  county_id: number
  county_name: string
}

export interface StationFilters {
  /** Free text search over the station name and code. */
  search?: string | null
  countyId?: number | null
  constituencyId?: number | null
  wardId?: number | null
  limit?: number
}

/**
 * The scope level that belongs to a position.
 *
 * This mirrors the constraint the database enforces on a candidate
 * (candidate_position_location_check): a member of county assembly belongs to
 * a ward, a member of parliament to a constituency, the county level races to
 * a county, and a presidential candidate to the whole country.
 */
export function scopeLevelForPosition(position: string): AssignmentScopeLevel {
  switch (position) {
    case 'mca':
      return 'ward'
    case 'mp':
      return 'constituency'
    case 'governor':
    case 'senator':
    case 'women_rep':
      return 'county'
    case 'president':
      return 'national'
    default:
      // An unknown race falls back to the widest scope that still keeps the
      // candidate inside their own area.
      return 'county'
  }
}

/**
 * The assignment scope of the signed in candidate.
 */
export async function getAssignmentScope(
  userId: number
): Promise<(AssignmentScope & { candidate: CandidateProfile }) | null> {
  const candidate = await getCandidateProfile(userId)
  if (!candidate) return null

  const level = scopeLevelForPosition(candidate.position)

  const names = await queryOne<{
    county_name: string | null
    constituency_name: string | null
    ward_name: string | null
  }>(
    `SELECT co.name as county_name, con.name as constituency_name, w.name as ward_name
       FROM candidates c
       LEFT JOIN counties co ON co.id = c.county_id
       LEFT JOIN constituencies con ON con.id = c.constituency_id
       LEFT JOIN wards w ON w.id = c.ward_id
      WHERE c.id = $1`,
    [candidate.id]
  )

  // The area names already carry their own wording ("Changamwe Ward 1"), so
  // the label is the plain name and the level is explained separately.
  let label = 'All polling stations in the country'
  if (level === 'ward' && names?.ward_name) {
    label = names.ward_name
  } else if (level === 'constituency' && names?.constituency_name) {
    label = names.constituency_name
  } else if (level === 'county' && names?.county_name) {
    label = names.county_name
  }

  return {
    position: candidate.position,
    level,
    label,
    county_id: candidate.county_id ?? null,
    constituency_id: candidate.constituency_id ?? null,
    ward_id: candidate.ward_id ?? null,
    national: level === 'national',
    candidate,
  }
}

/**
 * The stations a candidate may assign an agent to.
 *
 * The scope condition is applied on the server, so the list can never show a
 * station outside the candidate's area.
 */
export async function listAssignableStations(
  scope: AssignmentScope,
  filters: StationFilters = {}
): Promise<AssignableStation[]> {
  const params: any[] = []
  const conditions: string[] = []

  // The scope of the candidate.
  switch (scope.level) {
    case 'ward':
      if (!scope.ward_id) return []
      conditions.push(`ps.ward_id = $${params.length + 1}`)
      params.push(scope.ward_id)
      break
    case 'constituency':
      if (!scope.constituency_id) return []
      conditions.push(`w.constituency_id = $${params.length + 1}`)
      params.push(scope.constituency_id)
      break
    case 'county':
      if (!scope.county_id) return []
      conditions.push(`co.id = $${params.length + 1}`)
      params.push(scope.county_id)
      break
    case 'national':
      // No restriction: a presidential candidate may assign anywhere.
      break
  }

  // The optional location filters. They only narrow the list further, they
  // never widen it beyond the scope.
  if (filters.countyId) {
    conditions.push(`co.id = $${params.length + 1}`)
    params.push(filters.countyId)
  }
  if (filters.constituencyId) {
    conditions.push(`con.id = $${params.length + 1}`)
    params.push(filters.constituencyId)
  }
  if (filters.wardId) {
    conditions.push(`w.id = $${params.length + 1}`)
    params.push(filters.wardId)
  }

  const search = (filters.search || '').trim()
  if (search) {
    const pattern = `%${search}%`
    conditions.push(`(ps.name ILIKE $${params.length + 1} OR ps.code ILIKE $${params.length + 1})`)
    params.push(pattern)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500)

  return queryMany<AssignableStation>(
    `SELECT ps.id, ps.name, ps.code, ps.registered_voters,
            ps.ward_id, w.name as ward_name, w.constituency_id,
            con.name as constituency_name, co.id as county_id, co.name as county_name
       FROM polling_stations ps
       JOIN wards w ON ps.ward_id = w.id
       JOIN constituencies con ON w.constituency_id = con.id
       JOIN counties co ON con.county_id = co.id
       ${where}
      ORDER BY co.name, con.name, w.name, ps.name
      LIMIT ${limit}`,
    params
  )
}

/**
 * Check whether a station is inside the candidate's scope.
 *
 * This is the server side check behind every agent assignment. The interface
 * filters the list, but the API decides.
 */
export async function isStationInScope(
  scope: AssignmentScope,
  pollingStationId: number
): Promise<boolean> {
  if (!pollingStationId) return false

  const station = await queryOne<{
    ward_id: number
    constituency_id: number
    county_id: number
  }>(
    `SELECT ps.ward_id, w.constituency_id, co.id as county_id
       FROM polling_stations ps
       JOIN wards w ON ps.ward_id = w.id
       JOIN constituencies con ON w.constituency_id = con.id
       JOIN counties co ON con.county_id = co.id
      WHERE ps.id = $1`,
    [pollingStationId]
  )

  if (!station) return false

  switch (scope.level) {
    case 'ward':
      return station.ward_id === scope.ward_id
    case 'constituency':
      return station.constituency_id === scope.constituency_id
    case 'county':
      return station.county_id === scope.county_id
    case 'national':
      return true
    default:
      return false
  }
}

/**
 * The stations of a scope that an agent is already assigned to.
 *
 * Used to report a conflict instead of silently creating a second agent at
 * the same station.
 */
export async function getAgentsAtStation(
  candidateId: number,
  pollingStationId: number
): Promise<Array<{ id: number; user_id: number; full_name: string; is_primary: boolean }>> {
  return queryMany(
    `SELECT a.id, a.user_id, a.is_primary, u.full_name
       FROM agents a
       JOIN users u ON u.id = a.user_id
      WHERE a.candidate_id = $1
        AND a.polling_station_id = $2
      ORDER BY a.id`,
    [candidateId, pollingStationId]
  )
}

/**
 * The polling stations a candidate may assign, used by the assignment API.
 */
export async function resolveAssignableStations(
  userId: number,
  filters: StationFilters = {}
): Promise<{ scope: AssignmentScope; stations: AssignableStation[] } | null> {
  const scope = await getAssignmentScope(userId)
  if (!scope) return null
  const stations = await listAssignableStations(scope, filters)
  return { scope, stations }
}

/**
 * A short description of a scope, used in messages and in the interface.
 */
export function describeScope(scope: AssignmentScope): string {
  switch (scope.level) {
    case 'ward':
      return `polling stations in ${scope.label}`
    case 'constituency':
      return `polling stations in ${scope.label}`
    case 'county':
      return `polling stations in ${scope.label}`
    case 'national':
      return 'polling stations across the country'
    default:
      return 'polling stations in your electoral area'
  }
}

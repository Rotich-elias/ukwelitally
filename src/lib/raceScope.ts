import { queryOne } from '@/lib/db'
import { scopeLevelForPosition, type AssignmentScopeLevel } from '@/lib/agentScope'

/**
 * The race an agent or observer is actually reporting.
 *
 * The dashboard snippet used to ask for the national presidential tally for
 * everyone. Field users care about their own race and electoral area:
 *
 *   - an agent is assigned to a candidate, so the scope is the candidate's
 *     race and the area that race belongs to;
 *   - an observer is assigned to a polling station, so the scope is the race
 *     they selected at that station, narrowed to the station's ward,
 *     constituency or county.
 *
 * The scope is resolved on the server for the signed in user. The client can
 * ask for a race, but it can never widen the result beyond its assignment.
 */

export type RaceScopeLevel = AssignmentScopeLevel

export interface RaceScope {
  position: string
  position_label: string
  /** The geographic level the race belongs to. */
  level: RaceScopeLevel
  /** Human readable name of the race's area, e.g. "Kipipiri". */
  area_name: string
  county_id: number | null
  constituency_id: number | null
  ward_id: number | null
  /** The candidate the agent is assigned to. Null for observers. */
  candidate_name: string | null
}

export const RACE_POSITIONS = [
  'president',
  'governor',
  'senator',
  'women_rep',
  'mp',
  'mca',
] as const

const POSITION_LABELS: Record<string, string> = {
  president: 'Presidential',
  governor: 'Governor',
  senator: 'Senator',
  women_rep: 'Women Representative',
  mp: 'Member of Parliament',
  mca: 'Member of County Assembly',
}

export function positionLabel(position: string): string {
  return (
    POSITION_LABELS[position] ??
    position.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  )
}

export function normalizeRacePosition(value: string | null | undefined): string | null {
  if (!value) return null
  return (RACE_POSITIONS as readonly string[]).includes(value) ? value : null
}

function toId(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

interface RaceScopeInput {
  position: string
  county_id?: unknown
  constituency_id?: unknown
  ward_id?: unknown
  county_name?: string | null
  constituency_name?: string | null
  ward_name?: string | null
  candidate_name?: string | null
}

/**
 * Build a race scope from a position and its area names.
 *
 * Exported so the rules are unit tested without a database. An unknown race
 * falls back to the county level, matching the candidate assignment rules.
 */
export function buildRaceScope(input: RaceScopeInput): RaceScope {
  const level = scopeLevelForPosition(input.position)

  let areaName = 'National'
  if (level === 'ward') {
    areaName = input.ward_name || 'Ward'
  } else if (level === 'constituency') {
    areaName = input.constituency_name || 'Constituency'
  } else if (level === 'county') {
    areaName = input.county_name || 'County'
  }

  return {
    position: input.position,
    position_label: positionLabel(input.position),
    level,
    area_name: areaName,
    county_id: toId(input.county_id),
    constituency_id: toId(input.constituency_id),
    ward_id: toId(input.ward_id),
    candidate_name: input.candidate_name?.trim() || null,
  }
}

interface AgentRaceRow {
  position: string
  county_id: number | null
  constituency_id: number | null
  ward_id: number | null
  candidate_name: string | null
  county_name: string | null
  constituency_name: string | null
  ward_name: string | null
}

/**
 * The race of the candidate an agent is assigned to.
 */
export async function getAgentRaceScope(userId: number): Promise<RaceScope | null> {
  const row = await queryOne<AgentRaceRow>(
    `SELECT
        c.position,
        c.county_id,
        c.constituency_id,
        c.ward_id,
        COALESCE(u.full_name, c.full_name) AS candidate_name,
        co.name AS county_name,
        con.name AS constituency_name,
        w.name AS ward_name
       FROM agents a
       JOIN candidates c ON c.id = a.candidate_id
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN counties co ON co.id = c.county_id
       LEFT JOIN constituencies con ON con.id = c.constituency_id
       LEFT JOIN wards w ON w.id = c.ward_id
      WHERE a.user_id = $1
      ORDER BY a.is_primary DESC, a.id ASC
      LIMIT 1`,
    [userId]
  )

  if (!row) return null

  return buildRaceScope({
    position: row.position,
    county_id: row.county_id,
    constituency_id: row.constituency_id,
    ward_id: row.ward_id,
    county_name: row.county_name,
    constituency_name: row.constituency_name,
    ward_name: row.ward_name,
    candidate_name: row.candidate_name,
  })
}

interface ObserverRaceRow {
  ward_id: number | null
  constituency_id: number | null
  county_id: number | null
  ward_name: string | null
  constituency_name: string | null
  county_name: string | null
}

/**
 * The race an observer reports at their assigned station.
 *
 * An observer is not attached to a candidate, so the race comes from the
 * selector on their dashboard. The area is always the area of their assigned
 * station, which keeps the snippet local to where they are observing.
 */
export async function getObserverRaceScope(
  userId: number,
  requestedPosition?: string | null
): Promise<RaceScope | null> {
  const row = await queryOne<ObserverRaceRow>(
    `SELECT
        w.id AS ward_id,
        con.id AS constituency_id,
        co.id AS county_id,
        w.name AS ward_name,
        con.name AS constituency_name,
        co.name AS county_name
       FROM observer_assignments oa
       JOIN polling_stations ps ON ps.id = oa.polling_station_id
       JOIN wards w ON w.id = ps.ward_id
       JOIN constituencies con ON con.id = w.constituency_id
       JOIN counties co ON co.id = con.county_id
      WHERE oa.user_id = $1 AND oa.status = 'active'
      ORDER BY oa.id ASC
      LIMIT 1`,
    [userId]
  )

  if (!row) return null

  return buildRaceScope({
    position: normalizeRacePosition(requestedPosition) ?? 'president',
    county_id: row.county_id,
    constituency_id: row.constituency_id,
    ward_id: row.ward_id,
    county_name: row.county_name,
    constituency_name: row.constituency_name,
    ward_name: row.ward_name,
    candidate_name: null,
  })
}

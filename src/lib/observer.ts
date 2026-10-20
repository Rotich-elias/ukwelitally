import { query, queryOne, queryMany } from '@/lib/db'

/**
 * Helpers for observer submissions.
 *
 * Observers tally results for a POSITION (presidential) rather than for a
 * specific candidate, but `submissions.candidate_id` is NOT NULL and must
 * reference a candidate row. Each position therefore has a designated
 * "placeholder" candidate (see migration 011) that observers submit against.
 *
 * Placeholder candidates are internal records. They are never ballot entries
 * and never appear in candidate vote tallies.
 */

/**
 * Resolve the placeholder candidate id for a position.
 * Returns null when the position has no placeholder configured.
 */
export async function getPlaceholderCandidateId(
  position: string
): Promise<number | null> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM candidates
     WHERE position = $1 AND is_placeholder = TRUE
     ORDER BY id
     LIMIT 1`,
    [position]
  )
  return row?.id ?? null
}

/**
 * Get the active observer assignment for a user.
 */
export async function getObserverAssignment(
  userId: number
): Promise<{
  id: number
  polling_station_id: number
  assignment_type: string
  status: string
} | null> {
  const row = await queryOne<{
    id: number
    polling_station_id: number
    assignment_type: string
    status: string
  }>(
    `SELECT id, polling_station_id, assignment_type, status
     FROM observer_assignments
     WHERE user_id = $1 AND status = 'active'
     ORDER BY id
     LIMIT 1`,
    [userId]
  )
  return row ?? null
}

/**
 * All observer assignments for a user (active only).
 */
export async function getObserverAssignments(
  userId: number
): Promise<
  Array<{
    id: number
    polling_station_id: number
    assignment_type: string
    status: string
  }>
> {
  return queryMany(
    `SELECT id, polling_station_id, assignment_type, status
     FROM observer_assignments
     WHERE user_id = $1 AND status = 'active'
     ORDER BY id`,
    [userId]
  )
}

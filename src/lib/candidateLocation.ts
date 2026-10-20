// Validation of the electoral area a candidate is created with.
//
// The candidates table has foreign keys to counties, constituencies and wards
// (migration 001) and a check constraint that ties the position to the
// location (migration 006, relaxed for placeholders by migration 011).
//
// The API routes validate that the right KIND of location is supplied for the
// position, but they do not check that the referenced row actually exists.
// Without that check a stale or mistyped id reaches the database and comes
// back as a foreign key violation, which surfaces as a 500 rather than as a
// validation message.

import { queryOne } from '@/lib/db'

export interface CandidateLocation {
  county_id: number | null | undefined
  constituency_id: number | null | undefined
  ward_id: number | null | undefined
}

export type LocationCheck =
  | { ok: true }
  | { ok: false; error: string }

// The table names are a fixed list, never user input.
const LOCATIONS: Array<{
  column: keyof CandidateLocation
  table: string
  label: string
}> = [
  { column: 'county_id', table: 'counties', label: 'County' },
  { column: 'constituency_id', table: 'constituencies', label: 'Constituency' },
  { column: 'ward_id', table: 'wards', label: 'Ward' },
]

/**
 * Verify that every electoral area id supplied for a candidate exists.
 *
 * Ids that are not supplied are skipped: which ones are required depends on
 * the position and is checked by the caller.
 */
export async function validateCandidateLocation(
  location: CandidateLocation
): Promise<LocationCheck> {
  for (const { column, table, label } of LOCATIONS) {
    const id = location[column]

    if (id === null || id === undefined) continue

    const row = await queryOne<{ id: number }>(
      `SELECT id FROM ${table} WHERE id = $1`,
      [id]
    )

    if (!row) {
      return { ok: false, error: `${label} with ID ${id} does not exist` }
    }
  }

  return { ok: true }
}

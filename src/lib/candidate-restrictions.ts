import { queryOne } from '@/lib/db'

export interface CandidateRestrictions {
  position: 'president' | 'governor' | 'senator' | 'women_rep' | 'mp' | 'mca'
  county_id?: number
  constituency_id?: number
  ward_id?: number
}

/**
 * The full candidate profile of a logged in candidate.
 *
 * `access_status` is the purchased access entitlement. It is separate from
 * `users.active` (the login account) and from the reporting window (the
 * submission permission).
 */
export interface CandidateProfile extends CandidateRestrictions {
  id: number
  user_id: number
  full_name: string
  party_name: string | null
  access_status: 'active' | 'suspended' | 'revoked'
}

/**
 * Load the candidate profile that belongs to a user account.
 */
export async function getCandidateProfile(
  userId: number
): Promise<CandidateProfile | null> {
  const row = await queryOne<{
    id: number
    user_id: number
    full_name: string
    party_name: string | null
    position: CandidateRestrictions['position']
    county_id: number | null
    constituency_id: number | null
    ward_id: number | null
    access_status: 'active' | 'suspended' | 'revoked'
  }>(
    `SELECT c.id, c.user_id, c.party_name, c.position, c.county_id, c.constituency_id,
            c.ward_id, c.access_status, u.full_name
       FROM candidates c
       JOIN users u ON u.id = c.user_id
      WHERE c.user_id = $1`,
    [userId]
  )

  if (!row) return null

  return {
    id: row.id,
    user_id: row.user_id,
    full_name: row.full_name,
    party_name: row.party_name,
    position: row.position,
    county_id: row.county_id ?? undefined,
    constituency_id: row.constituency_id ?? undefined,
    ward_id: row.ward_id ?? undefined,
    access_status: row.access_status,
  }
}

/**
 * Get location restrictions for a candidate
 * Returns the electoral area they are vying for
 */
export async function getCandidateRestrictions(
  userId: number
): Promise<CandidateRestrictions | null> {
  try {
    const candidate = await queryOne(
      `SELECT position, county_id, constituency_id, ward_id
       FROM candidates
       WHERE user_id = $1`,
      [userId]
    )

    if (!candidate) {
      return null
    }

    return {
      position: candidate.position,
      county_id: candidate.county_id,
      constituency_id: candidate.constituency_id,
      ward_id: candidate.ward_id,
    }
  } catch (error) {
    console.error('Error getting candidate restrictions:', error)
    return null
  }
}

/**
 * Build SQL WHERE clause for candidate location restrictions
 * Returns the WHERE clause parts to be added to a query
 */
export function buildLocationFilter(restrictions: CandidateRestrictions): {
  clause: string
  params: number[]
  paramCount: number
} {
  const params: number[] = []
  const conditions: string[] = []
  let paramIndex = 1

  // Apply restrictions based on position
  switch (restrictions.position) {
    case 'mca':
      // MCA can only see their ward
      if (restrictions.ward_id) {
        conditions.push(`w.id = $${paramIndex}`)
        params.push(restrictions.ward_id)
        paramIndex++
      }
      break

    case 'mp':
      // MP can only see their constituency
      if (restrictions.constituency_id) {
        conditions.push(`con.id = $${paramIndex}`)
        params.push(restrictions.constituency_id)
        paramIndex++
      }
      break

    case 'governor':
    case 'senator':
    case 'women_rep':
      // Governor/Senator/Women Rep can only see their county
      if (restrictions.county_id) {
        conditions.push(`cou.id = $${paramIndex}`)
        params.push(restrictions.county_id)
        paramIndex++
      }
      break

    case 'president':
      // President can see all
      break
  }

  return {
    clause: conditions.length > 0 ? conditions.join(' AND ') : '',
    params,
    paramCount: paramIndex - 1,
  }
}

/**
 * Check if a candidate can access a specific location
 */
export function canAccessLocation(
  restrictions: CandidateRestrictions,
  location: {
    county_id?: number
    constituency_id?: number
    ward_id?: number
  }
): boolean {
  switch (restrictions.position) {
    case 'president':
      return true // Can access all locations

    case 'governor':
    case 'senator':
    case 'women_rep':
      return location.county_id === restrictions.county_id

    case 'mp':
      return location.constituency_id === restrictions.constituency_id

    case 'mca':
      return location.ward_id === restrictions.ward_id

    default:
      return false
  }
}

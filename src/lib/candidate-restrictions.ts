import { queryOne } from '@/lib/db'

export interface CandidateRestrictions {
  position: 'president' | 'governor' | 'senator' | 'women_rep' | 'mp' | 'mca'
  county_id?: number
  constituency_id?: number
  ward_id?: number
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

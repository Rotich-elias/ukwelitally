import { NextRequest, NextResponse } from 'next/server'
import { queryMany } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { getFileUrl } from '@/lib/storage'
import { getCandidateRestrictions } from '@/lib/candidate-restrictions'
import {
  getAgentRaceScope,
  getObserverRaceScope,
  type RaceScope,
} from '@/lib/raceScope'

/**
 * The candidates of the race a field user is allowed to report.
 *
 * The endpoint used to return every candidate of the requested position in the
 * country. That let an agent or observer stationed in one ward enter votes for
 * candidates of a completely different ward. The race and area are now taken
 * from the signed in user's assignment:
 *
 *   - an agent inherits the race and area of their candidate
 *   - an observer keeps the race they selected, narrowed to their station area
 *   - a candidate is tied to their own race
 *
 * Administrators keep the original explicit filters.
 */

interface CandidateFilters {
  position: string
  countyId: string | null
  constituencyId: string | null
  wardId: string | null
}

function filtersForScope(scope: RaceScope): CandidateFilters | null {
  const filters: CandidateFilters = {
    position: scope.position,
    countyId: null,
    constituencyId: null,
    wardId: null,
  }

  switch (scope.level) {
    case 'ward':
      if (!scope.ward_id) return null
      filters.wardId = String(scope.ward_id)
      break
    case 'constituency':
      if (!scope.constituency_id) return null
      filters.constituencyId = String(scope.constituency_id)
      break
    case 'county':
      if (!scope.county_id) return null
      filters.countyId = String(scope.county_id)
      break
    case 'national':
      break
  }

  return filters
}

async function resolveFieldUserFilters(
  user: { userId: number; role: string },
  requestedPosition: string | null
): Promise<CandidateFilters | null> {
  if (user.role === 'agent') {
    const scope = await getAgentRaceScope(user.userId)
    return scope ? filtersForScope(scope) : null
  }

  if (user.role === 'observer') {
    const scope = await getObserverRaceScope(user.userId, requestedPosition)
    return scope ? filtersForScope(scope) : null
  }

  if (user.role === 'candidate') {
    const restrictions = await getCandidateRestrictions(user.userId)
    if (!restrictions) return null

    const filters: CandidateFilters = {
      position: restrictions.position,
      countyId: null,
      constituencyId: null,
      wardId: null,
    }

    switch (restrictions.position) {
      case 'mca':
        if (!restrictions.ward_id) return null
        filters.wardId = String(restrictions.ward_id)
        break
      case 'mp':
        if (!restrictions.constituency_id) return null
        filters.constituencyId = String(restrictions.constituency_id)
        break
      case 'governor':
      case 'senator':
      case 'women_rep':
        if (!restrictions.county_id) return null
        filters.countyId = String(restrictions.county_id)
        break
      case 'president':
        break
    }

    return filters
  }

  return null
}

// GET /api/candidates - List all candidates by position
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user as { userId: number; role: string } | undefined
    const { searchParams } = new URL(req.url)

    let position = searchParams.get('position')
    let countyId = searchParams.get('county_id')
    let constituencyId = searchParams.get('constituency_id')
    let wardId = searchParams.get('ward_id')

    // Field users never choose their own scope. The assignment decides which
    // race they can report, and the client supplied filters are discarded.
    const isFieldUser =
      user?.role === 'agent' || user?.role === 'observer' || user?.role === 'candidate'

    if (isFieldUser) {
      const filters = await resolveFieldUserFilters(user!, position)
      if (!filters) {
        return NextResponse.json({ candidates: [] })
      }

      position = filters.position
      countyId = filters.countyId
      constituencyId = filters.constituencyId
      wardId = filters.wardId
    }

    let sql = `
      SELECT
        c.id,
        c.position,
        c.party_name,
        c.party_abbreviation,
        c.is_system_user,
        c.profile_photo,
        COALESCE(u.full_name, c.full_name) as candidate_name,
        co.name as county_name,
        con.name as constituency_name,
        w.name as ward_name
      FROM candidates c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN counties co ON c.county_id = co.id
      LEFT JOIN constituencies con ON c.constituency_id = con.id
      LEFT JOIN wards w ON c.ward_id = w.id
      WHERE c.is_placeholder = false
        AND ((c.is_system_user = true AND u.active = true) OR c.is_system_user = false)
    `
    const params: any[] = []
    let paramIndex = 1

    // Filter by position
    if (position) {
      sql += ` AND c.position = $${paramIndex++}`
      params.push(position)
    }

    // Filter by location based on position requirements
    if (wardId) {
      sql += ` AND (c.ward_id = $${paramIndex} OR c.position = 'president')`
      params.push(wardId)
      paramIndex++
    } else if (constituencyId) {
      sql += ` AND (c.constituency_id = $${paramIndex} OR c.position IN ('president', 'governor', 'senator'))`
      params.push(constituencyId)
      paramIndex++
    } else if (countyId) {
      sql += ` AND (c.county_id = $${paramIndex} OR c.position = 'president')`
      params.push(countyId)
      paramIndex++
    }

    sql += ' ORDER BY c.position, c.full_name'

    const candidates = await queryMany(sql, params)

    // The stored reference is a storage key, so it is resolved into a URL
    // that can actually be loaded.
    const withPhotoUrls = candidates.map((candidate: any) => ({
      ...candidate,
      profile_photo: candidate.profile_photo ? getFileUrl(candidate.profile_photo) : null,
    }))

    return NextResponse.json({ candidates: withPhotoUrls })
  } catch (error) {
    console.error('Error fetching candidates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withAuth(handleGet as any)

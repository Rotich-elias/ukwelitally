import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCandidateRestrictions } from '@/lib/candidate-restrictions'
import { authenticateRequest } from '@/lib/authenticate'

export const dynamic = 'force-dynamic'

// More than the largest county has, so a county view is never cut short.
const MAX_STATIONS = 5000

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    let wardId = searchParams.get('ward_id')
    let constituencyId = searchParams.get('constituency_id')
    let countyId = searchParams.get('county_id')

    // Check if user is a candidate and apply location restrictions
    const decoded = await authenticateRequest(request)
    if (decoded?.role === 'candidate') {
      const restrictions = await getCandidateRestrictions(decoded.userId)

      if (restrictions && restrictions.position !== 'president') {
        // Override query params with candidate's restrictions
        switch (restrictions.position) {
          case 'mca':
            wardId = restrictions.ward_id?.toString() || null
            constituencyId = null
            countyId = null
            break
          case 'mp':
            constituencyId = restrictions.constituency_id?.toString() || null
            wardId = null
            countyId = null
            break
          case 'governor':
          case 'senator':
          case 'women_rep':
            countyId = restrictions.county_id?.toString() || null
            constituencyId = null
            wardId = null
            break
        }
      }
    }

    let queryText = `
      SELECT ps.id, ps.name, ps.code, ps.ward_id, ps.latitude, ps.longitude,
             ps.registered_voters, ps.created_at,
             w.name as ward_name, w.constituency_id,
             c.name as constituency_name, c.county_id,
             co.name as county_name
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
    `
    const params: any[] = []
    const conditions: string[] = []

    if (wardId) {
      conditions.push(`ps.ward_id = $${params.length + 1}`)
      params.push(wardId)
    }

    if (constituencyId) {
      conditions.push(`w.constituency_id = $${params.length + 1}`)
      params.push(constituencyId)
    }

    if (countyId) {
      conditions.push(`c.county_id = $${params.length + 1}`)
      params.push(countyId)
    }

    // This route is public. Without a filter it returned every polling
    // station in the country with four joins, which repeated calls could use
    // to load the database. A ward, constituency or county is now required,
    // and even a whole county is capped.
    if (conditions.length === 0) {
      return NextResponse.json(
        { error: 'Choose a ward, constituency or county (ward_id, constituency_id or county_id).' },
        { status: 400 }
      )
    }

    queryText += ` WHERE ${conditions.join(' AND ')}`
    queryText += ` ORDER BY ps.name ASC LIMIT ${MAX_STATIONS}`

    const result = await query(queryText, params)

    return NextResponse.json({
      success: true,
      data: result.rows,
    })
  } catch (error) {
    console.error('Error fetching polling stations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch polling stations' },
      { status: 500 }
    )
  }
}

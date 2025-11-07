import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCandidateRestrictions } from '@/lib/candidate-restrictions'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    let wardId = searchParams.get('ward_id')
    let constituencyId = searchParams.get('constituency_id')
    let countyId = searchParams.get('county_id')

    // Check if user is a candidate and apply location restrictions
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7)
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

        if (decoded.role === 'candidate') {
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
                countyId = restrictions.county_id?.toString() || null
                constituencyId = null
                wardId = null
                break
            }
          }
        }
      } catch (error) {
        // Invalid token, continue without restrictions
        console.error('Invalid token:', error)
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

    if (conditions.length > 0) {
      queryText += ` WHERE ${conditions.join(' AND ')}`
    }

    queryText += ` ORDER BY ps.name ASC`

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

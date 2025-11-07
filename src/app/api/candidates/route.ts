import { NextRequest, NextResponse } from 'next/server'
import { queryMany } from '@/lib/db'
import { withAuth } from '@/middleware/auth'

// GET /api/candidates - List all candidates by position
async function handleGet(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const position = searchParams.get('position')
    const countyId = searchParams.get('county_id')
    const constituencyId = searchParams.get('constituency_id')
    const wardId = searchParams.get('ward_id')

    let sql = `
      SELECT
        c.id,
        c.position,
        c.party_name,
        c.party_abbreviation,
        c.is_system_user,
        COALESCE(u.full_name, c.full_name) as candidate_name,
        co.name as county_name,
        con.name as constituency_name,
        w.name as ward_name
      FROM candidates c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN counties co ON c.county_id = co.id
      LEFT JOIN constituencies con ON c.constituency_id = con.id
      LEFT JOIN wards w ON c.ward_id = w.id
      WHERE (c.is_system_user = true AND u.active = true) OR c.is_system_user = false
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

    sql += ' ORDER BY c.position, u.full_name'

    const candidates = await queryMany(sql, params)

    return NextResponse.json({ candidates })
  } catch (error) {
    console.error('Error fetching candidates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withAuth(handleGet as any)

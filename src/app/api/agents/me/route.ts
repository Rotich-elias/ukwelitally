import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    if (decoded.role !== 'agent') {
      return NextResponse.json(
        { error: 'Forbidden - Agent access only' },
        { status: 403 }
      )
    }

    const result = await query(
      `SELECT
        a.id as agent_id,
        a.user_id,
        a.candidate_id,
        a.polling_station_id,
        a.is_primary,
        u.full_name,
        u.email,
        u.phone,
        u2.full_name as candidate_name,
        cand.position as candidate_position,
        ps.name as station_name,
        ps.code as station_code,
        ps.registered_voters,
        w.name as ward_name,
        const.name as constituency_name,
        co.name as county_name
      FROM agents a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN candidates cand ON a.candidate_id = cand.id
      LEFT JOIN users u2 ON cand.user_id = u2.id
      LEFT JOIN polling_stations ps ON a.polling_station_id = ps.id
      LEFT JOIN wards w ON ps.ward_id = w.id
      LEFT JOIN constituencies const ON w.constituency_id = const.id
      LEFT JOIN counties co ON const.county_id = co.id
      WHERE a.user_id = $1`,
      [decoded.userId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    })
  } catch (error) {
    console.error('Error fetching agent info:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent information' },
      { status: 500 }
    )
  }
}

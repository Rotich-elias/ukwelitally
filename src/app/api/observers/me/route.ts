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

    if (decoded.role !== 'observer') {
      return NextResponse.json(
        { error: 'Forbidden - Observer access only' },
        { status: 403 }
      )
    }

    const result = await query(
      `SELECT
        oa.id as assignment_id,
        oa.user_id,
        oa.polling_station_id,
        oa.assignment_type,
        oa.status as assignment_status,
        u.full_name,
        u.email,
        u.phone,
        u.id_number,
        ps.name as station_name,
        ps.code as station_code,
        ps.registered_voters,
        ps.latitude,
        ps.longitude,
        w.name as ward_name,
        const.name as constituency_name,
        co.name as county_name,
        vr.id as volunteer_registration_id
      FROM observer_assignments oa
      JOIN users u ON oa.user_id = u.id
      LEFT JOIN polling_stations ps ON oa.polling_station_id = ps.id
      LEFT JOIN wards w ON ps.ward_id = w.id
      LEFT JOIN constituencies const ON w.constituency_id = const.id
      LEFT JOIN counties co ON const.county_id = co.id
      LEFT JOIN volunteer_registrations vr ON oa.volunteer_registration_id = vr.id
      WHERE oa.user_id = $1 AND oa.status = 'active'`,
      [decoded.userId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'No active observer assignment found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    })
  } catch (error) {
    console.error('Error fetching observer info:', error)
    return NextResponse.json(
      { error: 'Failed to fetch observer information' },
      { status: 500 }
    )
  }
}
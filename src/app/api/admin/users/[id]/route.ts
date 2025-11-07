import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const dynamic = 'force-dynamic'

// GET - Get user details by ID (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const userId = params.id

    // Get user with full details including candidate/agent profile
    const user = await queryOne(
      `SELECT
        u.id, u.email, u.phone, u.full_name, u.role, u.id_number,
        u.verified, u.active, u.created_at, u.updated_at,
        c.id as candidate_id, c.party_name, c.position,
        c.county_id, c.constituency_id, c.ward_id,
        cou.name as county_name,
        con.name as constituency_name,
        w.name as ward_name,
        a.id as agent_id, a.candidate_id as agent_candidate_id, a.polling_station_id,
        ps.name as polling_station_name, ps.code as polling_station_code,
        cand_user.full_name as candidate_name
      FROM users u
      LEFT JOIN candidates c ON u.id = c.user_id
      LEFT JOIN counties cou ON c.county_id = cou.id
      LEFT JOIN constituencies con ON c.constituency_id = con.id
      LEFT JOIN wards w ON c.ward_id = w.id
      LEFT JOIN agents a ON u.id = a.user_id
      LEFT JOIN polling_stations ps ON a.polling_station_id = ps.id
      LEFT JOIN candidates cand ON a.candidate_id = cand.id
      LEFT JOIN users cand_user ON cand.user_id = cand_user.id
      WHERE u.id = $1`,
      [userId]
    )

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Format response based on role
    let profileData = null

    if (user.role === 'candidate' && user.candidate_id) {
      profileData = {
        candidate_id: user.candidate_id,
        party_name: user.party_name,
        position: user.position,
        county_id: user.county_id,
        constituency_id: user.constituency_id,
        ward_id: user.ward_id,
        county_name: user.county_name,
        constituency_name: user.constituency_name,
        ward_name: user.ward_name,
      }
    } else if (user.role === 'agent' && user.agent_id) {
      profileData = {
        agent_id: user.agent_id,
        candidate_id: user.agent_candidate_id,
        candidate_name: user.candidate_name,
        polling_station_id: user.polling_station_id,
        polling_station_name: user.polling_station_name,
        polling_station_code: user.polling_station_code,
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        full_name: user.full_name,
        role: user.role,
        id_number: user.id_number,
        verified: user.verified,
        active: user.active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        profile: profileData,
      },
    })
  } catch (error) {
    console.error('Error fetching user details:', error)
    return NextResponse.json({ error: 'Failed to fetch user details' }, { status: 500 })
  }
}

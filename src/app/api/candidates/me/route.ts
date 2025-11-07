import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const dynamic = 'force-dynamic'

// GET /api/candidates/me - Get current candidate's profile
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    if (decoded.role !== 'candidate') {
      return NextResponse.json({ error: 'Only candidates can access this endpoint' }, { status: 403 })
    }

    const candidate = await queryOne(
      `SELECT
        c.id,
        c.user_id,
        c.party_name,
        c.position,
        c.county_id,
        c.constituency_id,
        c.ward_id,
        u.full_name,
        u.email,
        u.phone,
        cou.name as county_name,
        con.name as constituency_name,
        w.name as ward_name
      FROM candidates c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN counties cou ON c.county_id = cou.id
      LEFT JOIN constituencies con ON c.constituency_id = con.id
      LEFT JOIN wards w ON c.ward_id = w.id
      WHERE c.user_id = $1`,
      [decoded.userId]
    )

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    // Format electoral area based on position
    let electoralArea = 'National'
    if (candidate.position === 'mca' && candidate.ward_name) {
      electoralArea = `${candidate.ward_name} Ward`
    } else if (candidate.position === 'mp' && candidate.constituency_name) {
      electoralArea = `${candidate.constituency_name} Constituency`
    } else if ((candidate.position === 'governor' || candidate.position === 'senator') && candidate.county_name) {
      electoralArea = `${candidate.county_name} County`
    }

    return NextResponse.json({
      success: true,
      data: {
        id: candidate.id,
        user_id: candidate.user_id,
        full_name: candidate.full_name,
        email: candidate.email,
        phone: candidate.phone,
        party_name: candidate.party_name,
        position: candidate.position,
        electoral_area: electoralArea,
        county_id: candidate.county_id,
        constituency_id: candidate.constituency_id,
        ward_id: candidate.ward_id,
        county_name: candidate.county_name,
        constituency_name: candidate.constituency_name,
        ward_name: candidate.ward_name,
      },
    })
  } catch (error) {
    console.error('Error fetching candidate profile:', error)
    return NextResponse.json({ error: 'Failed to fetch candidate profile' }, { status: 500 })
  }
}

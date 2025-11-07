import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const constituencyId = searchParams.get('constituency_id')

    let queryText = `
      SELECT w.id, w.name, w.code, w.constituency_id,
             c.name as constituency_name, c.county_id,
             co.name as county_name, w.created_at
      FROM wards w
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
    `
    const params: any[] = []

    if (constituencyId) {
      queryText += ` WHERE w.constituency_id = $1`
      params.push(constituencyId)
    }

    queryText += ` ORDER BY w.name ASC`

    const result = await query(queryText, params)

    return NextResponse.json({
      success: true,
      data: result.rows,
    })
  } catch (error) {
    console.error('Error fetching wards:', error)
    return NextResponse.json(
      { error: 'Failed to fetch wards' },
      { status: 500 }
    )
  }
}

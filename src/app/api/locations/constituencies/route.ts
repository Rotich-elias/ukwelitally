import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const countyId = searchParams.get('county_id')

    let queryText = `
      SELECT c.id, c.name, c.code, c.county_id, co.name as county_name, c.created_at
      FROM constituencies c
      JOIN counties co ON c.county_id = co.id
    `
    const params: any[] = []

    if (countyId) {
      queryText += ` WHERE c.county_id = $1`
      params.push(countyId)
    }

    queryText += ` ORDER BY c.name ASC`

    const result = await query(queryText, params)

    return NextResponse.json({
      success: true,
      data: result.rows,
    })
  } catch (error) {
    console.error('Error fetching constituencies:', error)
    return NextResponse.json(
      { error: 'Failed to fetch constituencies' },
      { status: 500 }
    )
  }
}

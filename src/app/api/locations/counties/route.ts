import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const result = await query(
      `SELECT id, name, code, created_at
       FROM counties
       ORDER BY name ASC`
    )

    return NextResponse.json({
      success: true,
      data: result.rows,
    })
  } catch (error) {
    console.error('Error fetching counties:', error)
    return NextResponse.json(
      { error: 'Failed to fetch counties' },
      { status: 500 }
    )
  }
}

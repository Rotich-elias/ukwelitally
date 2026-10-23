import { NextRequest, NextResponse } from 'next/server'
import { withRole } from '@/middleware/auth'
import { query } from '@/lib/db'

async function handlePost(req: NextRequest) {
  try {
    await query('SELECT * FROM sync_registered_voters_from_stations()')
    return NextResponse.json({ success: true, message: 'Registered voters rolled up from polling stations' })
  } catch (error) {
    console.error('Error rolling up registered voters:', error)
    return NextResponse.json({ error: 'Failed to roll up registered voters' }, { status: 500 })
  }
}

export const POST = withRole(['admin'], handlePost as any)
export const dynamic = 'force-dynamic'

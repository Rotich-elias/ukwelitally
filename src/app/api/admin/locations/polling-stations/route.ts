import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { listPollingStations } from '@/lib/locationAdmin'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/admin/locations/polling-stations - List the polling stations
 * POST /api/admin/locations/polling-stations - Create a polling station
 */
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const stations = await listPollingStations({
      countyId: searchParams.get('county_id') ? parseInt(searchParams.get('county_id')!) : null,
      constituencyId: searchParams.get('constituency_id')
        ? parseInt(searchParams.get('constituency_id')!)
        : null,
      wardId: searchParams.get('ward_id') ? parseInt(searchParams.get('ward_id')!) : null,
      search: searchParams.get('search'),
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    })

    return NextResponse.json({ success: true, stations, count: stations.length })
  } catch (error) {
    console.error('Error listing polling stations:', error)
    return NextResponse.json(
      { error: 'Failed to list the polling stations' },
      { status: 500 }
    )
  }
}

async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 })
    }

    // The electoral geography is reference data that the official IEBC files
    // own. It is only ever updated through a CSV import, never created here,
    // so a stray request cannot invent a polling station.
    return NextResponse.json(
      {
        error:
          'Creating polling stations is disabled. Use the CSV import to update the electoral geography.',
      },
      { status: 403 }
    )
  } catch (error) {
    console.error('Error creating polling station:', error)
    return NextResponse.json(
      { error: 'Failed to create the polling station' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)
export const POST = withAuth(handlePost as any)

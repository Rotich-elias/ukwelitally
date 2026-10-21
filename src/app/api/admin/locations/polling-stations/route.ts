import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { auditRequestContext } from '@/lib/audit'
import {
  listPollingStations,
  createPollingStation,
  LocationError,
  type PollingStationInput,
} from '@/lib/locationAdmin'

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

    const body = await req.json()
    const input: PollingStationInput = {
      code: body?.code,
      name: body?.name,
      ward_id: parseInt(body?.ward_id),
      latitude:
        body?.latitude === undefined || body?.latitude === null ? null : parseFloat(body.latitude),
      longitude:
        body?.longitude === undefined || body?.longitude === null
          ? null
          : parseFloat(body.longitude),
      registered_voters:
        body?.registered_voters === undefined || body?.registered_voters === null
          ? 0
          : parseInt(body.registered_voters),
      location_radius:
        body?.location_radius === undefined || body?.location_radius === null
          ? 500
          : parseInt(body.location_radius),
    }

    const { ipAddress } = auditRequestContext(req)
    const station = await createPollingStation(input, { userId: user.userId, ipAddress })

    return NextResponse.json(
      { success: true, message: 'Polling station created', station },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof LocationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.code === 'duplicate_code' ? 409 : 400 }
      )
    }
    console.error('Error creating polling station:', error)
    return NextResponse.json(
      { error: 'Failed to create the polling station' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)
export const POST = withAuth(handlePost as any)

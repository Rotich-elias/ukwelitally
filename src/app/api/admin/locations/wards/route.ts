import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { auditRequestContext } from '@/lib/audit'
import {
  listWards,
  createWard,
  LocationError,
  type WardInput,
} from '@/lib/locationAdmin'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/admin/locations/wards - List the wards
 * POST /api/admin/locations/wards - Create a ward
 *
 * The electoral geography is maintained by the platform administrator. There
 * was no way to do this from the application before: the location endpoints
 * were read only and the data could only be changed with a script that
 * connects to the database.
 */
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const wards = await listWards({
      countyId: searchParams.get('county_id') ? parseInt(searchParams.get('county_id')!) : null,
      constituencyId: searchParams.get('constituency_id')
        ? parseInt(searchParams.get('constituency_id')!)
        : null,
      search: searchParams.get('search'),
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    })

    return NextResponse.json({ success: true, wards, count: wards.length })
  } catch (error) {
    console.error('Error listing wards:', error)
    return NextResponse.json({ error: 'Failed to list the wards' }, { status: 500 })
  }
}

async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 })
    }

    const body = await req.json()
    const input: WardInput = {
      code: body?.code,
      name: body?.name,
      constituency_id: parseInt(body?.constituency_id),
      registered_voters:
        body?.registered_voters === undefined || body?.registered_voters === null
          ? 0
          : parseInt(body.registered_voters),
    }

    const { ipAddress } = auditRequestContext(req)
    const ward = await createWard(input, { userId: user.userId, ipAddress })

    return NextResponse.json({ success: true, message: 'Ward created', ward }, { status: 201 })
  } catch (error) {
    if (error instanceof LocationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.code === 'duplicate_code' ? 409 : 400 }
      )
    }
    console.error('Error creating ward:', error)
    return NextResponse.json({ error: 'Failed to create the ward' }, { status: 500 })
  }
}

export const GET = withAuth(handleGet as any)
export const POST = withAuth(handlePost as any)

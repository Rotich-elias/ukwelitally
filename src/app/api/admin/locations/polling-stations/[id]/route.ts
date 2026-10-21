import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { auditRequestContext } from '@/lib/audit'
import {
  updatePollingStation,
  deletePollingStation,
  LocationError,
  type PollingStationInput,
} from '@/lib/locationAdmin'

export const dynamic = 'force-dynamic'

/**
 * PUT    /api/admin/locations/polling-stations/:id - Update a polling station
 * DELETE /api/admin/locations/polling-stations/:id - Delete a polling station
 *
 * A station that already has submissions, or an agent assigned to it, is not
 * deleted.
 */
async function handlePut(req: NextRequest, context?: any) {
  try {
    const user = (req as any).user
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 })
    }

    const params = await Promise.resolve(context?.params ?? {})
    const id = parseInt(params?.id)
    if (!id || id <= 0) {
      return NextResponse.json({ error: 'Invalid polling station id' }, { status: 400 })
    }

    const body = await req.json()
    const input: Partial<PollingStationInput> = {}
    if (body?.code !== undefined) input.code = body.code
    if (body?.name !== undefined) input.name = body.name
    if (body?.ward_id !== undefined) input.ward_id = parseInt(body.ward_id)
    if (body?.latitude !== undefined) {
      input.latitude = body.latitude === null ? null : parseFloat(body.latitude)
    }
    if (body?.longitude !== undefined) {
      input.longitude = body.longitude === null ? null : parseFloat(body.longitude)
    }
    if (body?.registered_voters !== undefined) {
      input.registered_voters =
        body.registered_voters === null ? null : parseInt(body.registered_voters)
    }
    if (body?.location_radius !== undefined) {
      input.location_radius =
        body.location_radius === null ? null : parseInt(body.location_radius)
    }

    const { ipAddress } = auditRequestContext(req)
    const station = await updatePollingStation(id, input, { userId: user.userId, ipAddress })

    return NextResponse.json({
      success: true,
      message: 'Polling station updated',
      station,
    })
  } catch (error) {
    if (error instanceof LocationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.code === 'not_found' ? 404 : error.code === 'duplicate_code' ? 409 : 400 }
      )
    }
    console.error('Error updating polling station:', error)
    return NextResponse.json(
      { error: 'Failed to update the polling station' },
      { status: 500 }
    )
  }
}

async function handleDelete(req: NextRequest, context?: any) {
  try {
    const user = (req as any).user
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access only' }, { status: 403 })
    }

    const params = await Promise.resolve(context?.params ?? {})
    const id = parseInt(params?.id)
    if (!id || id <= 0) {
      return NextResponse.json({ error: 'Invalid polling station id' }, { status: 400 })
    }

    const { ipAddress } = auditRequestContext(req)
    const result = await deletePollingStation(id, { userId: user.userId, ipAddress })

    return NextResponse.json({ success: true, message: 'Polling station deleted', ...result })
  } catch (error) {
    if (error instanceof LocationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.code === 'not_found' ? 404 : 409 }
      )
    }
    console.error('Error deleting polling station:', error)
    return NextResponse.json(
      { error: 'Failed to delete the polling station' },
      { status: 500 }
    )
  }
}

export const PUT = withAuth(handlePut as any)
export const DELETE = withAuth(handleDelete as any)

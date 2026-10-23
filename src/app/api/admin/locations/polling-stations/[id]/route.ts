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

    return NextResponse.json({ error: 'Updates to polling stations must be done via CSV import' }, { status: 403 })
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

    return NextResponse.json(
      { error: 'Deleting polling stations is disabled. Use the CSV import to manage the electoral geography.' },
      { status: 403 }
    )
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

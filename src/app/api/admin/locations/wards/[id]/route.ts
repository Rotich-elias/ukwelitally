import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { auditRequestContext } from '@/lib/audit'
import {
  updateWard,
  deleteWard,
  LocationError,
  type WardInput,
} from '@/lib/locationAdmin'

export const dynamic = 'force-dynamic'

/**
 * PUT    /api/admin/locations/wards/:id - Update a ward
 * DELETE /api/admin/locations/wards/:id - Delete a ward
 *
 * A ward that is moved to another constituency takes its polling stations
 * with it, and a ward that still has polling stations is not deleted.
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
      return NextResponse.json({ error: 'Invalid ward id' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Updates to wards must be done via CSV import' }, { status: 403 })
  } catch (error) {
    if (error instanceof LocationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.code === 'not_found' ? 404 : error.code === 'duplicate_code' ? 409 : 400 }
      )
    }
    console.error('Error updating ward:', error)
    return NextResponse.json({ error: 'Failed to update the ward' }, { status: 500 })
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
      return NextResponse.json({ error: 'Invalid ward id' }, { status: 400 })
    }

    return NextResponse.json(
      { error: 'Deleting wards is disabled. Use the CSV import to manage the electoral geography.' },
      { status: 403 }
    )
  } catch (error) {
    if (error instanceof LocationError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.code === 'not_found' ? 404 : 409 }
      )
    }
    console.error('Error deleting ward:', error)
    return NextResponse.json({ error: 'Failed to delete the ward' }, { status: 500 })
  }
}

export const PUT = withAuth(handlePut as any)
export const DELETE = withAuth(handleDelete as any)

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { withRole } from '@/middleware/auth'

// PUT /api/admin/volunteers/[id]/status - Update volunteer status
async function handlePut(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (req as any).user
    const volunteerId = parseInt(params.id)
    const body = await req.json()
    const { status, notes } = body

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      )
    }

    // Validate status
    const validStatuses = ['pending', 'approved', 'rejected', 'assigned']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: pending, approved, rejected, assigned' },
        { status: 400 }
      )
    }

    // Check if volunteer exists
    const volunteer = await queryOne(
      'SELECT * FROM volunteer_registrations WHERE id = $1',
      [volunteerId]
    )

    if (!volunteer) {
      return NextResponse.json(
        { error: 'Volunteer not found' },
        { status: 404 }
      )
    }

    // Update volunteer status
    const updatedVolunteer = await queryOne(
      `UPDATE volunteer_registrations 
       SET status = $1, 
           notes = COALESCE(notes || ' ', '') || $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [
        status,
        `Status changed to ${status} by admin on ${new Date().toLocaleDateString()}. ${notes || ''}`,
        volunteerId
      ]
    )

    // Log the status change
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.userId,
        'volunteer_status_updated',
        'volunteer_registration',
        volunteerId,
        JSON.stringify({ old_status: volunteer.status }),
        JSON.stringify({ new_status: status, notes })
      ]
    )

    return NextResponse.json({
      message: 'Volunteer status updated successfully',
      volunteer: updatedVolunteer
    })
  } catch (error) {
    console.error('Error updating volunteer status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const PUT = withRole(['admin'], handlePut as any)
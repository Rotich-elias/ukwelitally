import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { withRole } from '@/middleware/auth'

// DELETE /api/admin/volunteers/[id] - Delete a volunteer registration
async function handleDelete(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = (req as any).user
    const volunteerId = parseInt(params.id)

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

    // Check if volunteer is already assigned (prevent deletion of assigned volunteers)
    if (volunteer.status === 'assigned' || volunteer.assigned_candidate_id) {
      return NextResponse.json(
        { error: 'Cannot delete volunteer that has been assigned to a candidate' },
        { status: 400 }
      )
    }

    // Delete the volunteer registration
    await query(
      'DELETE FROM volunteer_registrations WHERE id = $1',
      [volunteerId]
    )

    // Log the deletion
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        'volunteer_deleted',
        'volunteer_registration',
        volunteerId,
        JSON.stringify({
          full_name: volunteer.full_name,
          email: volunteer.email,
          status: volunteer.status,
          created_at: volunteer.created_at
        })
      ]
    )

    return NextResponse.json({
      message: 'Volunteer deleted successfully'
    })

  } catch (error: any) {
    console.error('Error deleting volunteer:', error)
    
    // Provide more specific error messages
    if (error.code === '23503') { // Foreign key violation
      return NextResponse.json(
        { error: 'Cannot delete volunteer due to existing references' },
        { status: 400 }
      )
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const DELETE = withRole(['admin'], handleDelete as any)
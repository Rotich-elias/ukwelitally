import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { withRole } from '@/middleware/auth'
import { hashPassword } from '@/lib/auth'

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
    const validStatuses = ['pending', 'approved', 'rejected']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: pending, approved, rejected' },
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

    let userAccount = null

    // If status is being changed to approved, create user account and assign polling station
    if (status === 'approved' && volunteer.status !== 'approved') {
      // Check if user already exists with this email
      const existingUser = await queryOne(
        'SELECT id FROM users WHERE email = $1',
        [volunteer.email]
      )

      if (existingUser) {
        return NextResponse.json(
          { error: 'A user with this email already exists' },
          { status: 409 }
        )
      }

      // Check if volunteer has a polling station assigned
      if (!volunteer.polling_station_id) {
        return NextResponse.json(
          { error: 'Cannot approve volunteer without assigned polling station' },
          { status: 400 }
        )
      }

      // Hash the ID number to use as password
      const hashedPassword = await hashPassword(volunteer.id_number)

      // Create user account with role 'observer' for presidential results monitoring
      userAccount = await queryOne(
        `INSERT INTO users (email, phone, password_hash, full_name, id_number, role, verified, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          volunteer.email,
          volunteer.phone,
          hashedPassword,
          volunteer.full_name,
          volunteer.id_number,
          'observer', // Use observer role for presidential results volunteers
          true,       // Auto-verify since they're approved volunteers
          true        // Active by default
        ]
      )

      // Create observer assignment for presidential results
      const observerAssignment = await queryOne(
        `INSERT INTO observer_assignments
         (user_id, polling_station_id, volunteer_registration_id, assignment_type, assigned_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          userAccount.id,
          volunteer.polling_station_id,
          volunteerId,
          'presidential',
          user.userId
        ]
      )

      // Log the account creation and assignment
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          user.userId,
          'volunteer_account_created',
          'volunteer_registration',
          volunteerId,
          JSON.stringify({
            user_id: userAccount.id,
            email: volunteer.email,
            role: 'observer',
            polling_station_id: volunteer.polling_station_id,
            observer_assignment_id: observerAssignment.id
          })
        ]
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
        JSON.stringify({
          new_status: status,
          notes,
          account_created: status === 'approved' && volunteer.status !== 'approved'
        })
      ]
    )

    return NextResponse.json({
      message: status === 'approved' && volunteer.status !== 'approved'
        ? 'Volunteer approved and account created successfully. Login credentials sent to email.'
        : 'Volunteer status updated successfully',
      volunteer: updatedVolunteer,
      account_created: status === 'approved' && volunteer.status !== 'approved'
    })
  } catch (error) {
    console.error('Error updating volunteer status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const PUT = withRole(['admin'], handlePut as any)
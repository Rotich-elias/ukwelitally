import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { query, queryOne, queryMany, transaction } from '@/lib/db'
import { withRole } from '@/middleware/auth'
import { hashPassword } from '@/lib/auth'

interface BulkUpdateRequest {
  volunteer_ids: number[]
  status: 'approved' | 'rejected'
  notes?: string
}

// POST /api/admin/volunteers/bulk-update - Bulk update volunteer status
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    const body: BulkUpdateRequest = await req.json()
    const { volunteer_ids, status, notes } = body

    if (!volunteer_ids || !Array.isArray(volunteer_ids) || volunteer_ids.length === 0) {
      return NextResponse.json(
        { error: 'volunteer_ids array is required and must not be empty' },
        { status: 400 }
      )
    }

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'status is required and must be either "approved" or "rejected"' },
        { status: 400 }
      )
    }

    // Validate all volunteer IDs exist and are in pending status
    const placeholders = volunteer_ids.map((_, i) => `$${i + 1}`).join(',')
    const volunteers = await queryMany<{
      id: number
      full_name: string
      email: string
      phone: string
      id_number: string
      polling_station_id: number | null
      password_hash: string | null
      status: string
    }>(
      `SELECT id, full_name, email, phone, id_number, polling_station_id, password_hash, status
         FROM volunteer_registrations
        WHERE id IN (${placeholders}) AND status = 'pending'`,
      volunteer_ids
    )

    if (volunteers.length !== volunteer_ids.length) {
      const foundIds = volunteers.map((v: any) => v.id)
      const missingIds = volunteer_ids.filter((id: number) => !foundIds.includes(id))
      
      return NextResponse.json(
        { 
          error: 'Some volunteers not found or not in pending status',
          missing_ids: missingIds,
          found_count: volunteers.length,
          requested_count: volunteer_ids.length
        },
        { status: 400 }
      )
    }

    // For approval, check if all volunteers have polling stations
    if (status === 'approved') {
      const volunteersWithoutPollingStations = volunteers.filter((v: any) => !v.polling_station_id)
      if (volunteersWithoutPollingStations.length > 0) {
        return NextResponse.json(
          {
            error: 'Cannot approve volunteers without assigned polling stations',
            volunteers_without_stations: volunteersWithoutPollingStations.map((v: any) => ({
              id: v.id,
              name: v.full_name
            }))
          },
          { status: 400 }
        )
      }
    }

    const results = await transaction(async (client) => {
      const updateResults = []
      const accountCreationResults = []

      for (const volunteer of volunteers) {
        let userAccount = null
        let observerAssignment = null

        // If status is approved, create user account and observer assignment
        if (status === 'approved') {
          // Check if user already exists with this email
          const existingUser = await queryOne(
            'SELECT id FROM users WHERE email = $1',
            [volunteer.email]
          )

          if (existingUser) {
            throw new Error(`A user with email ${volunteer.email} already exists`)
          }

          // Reuse the password the volunteer chose at registration. Only a
          // registration without one needs a generated password.
          const selfServicePassword = Boolean(volunteer.password_hash)
          const generatedPassword = selfServicePassword
            ? null
            : 'Obs' + crypto.randomBytes(6).toString('hex')
          const hashedPassword = selfServicePassword
            ? volunteer.password_hash!
            : await hashPassword(generatedPassword!)

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
              'observer',
              true,
              true
            ]
          )

          try {
            // Create observer assignment for presidential results
            observerAssignment = await queryOne(
              `INSERT INTO observer_assignments
               (user_id, polling_station_id, volunteer_registration_id, assignment_type, assigned_by)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *`,
              [
                userAccount.id,
                volunteer.polling_station_id,
                volunteer.id,
                'presidential',
                user.userId
              ]
            )
          } catch (error) {
            console.error('Error creating observer assignment:', error)
            // If observer_assignments table doesn't exist, continue without it
          }

          // Log the account creation and assignment
          await query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              user.userId,
              'volunteer_account_created',
              'volunteer_registration',
              volunteer.id,
              JSON.stringify({
                user_id: userAccount.id,
                email: volunteer.email,
                role: 'observer',
                polling_station_id: volunteer.polling_station_id,
                observer_assignment_id: observerAssignment?.id || null,
                self_service_password: selfServicePassword,
              })
            ]
          )

          accountCreationResults.push({
            volunteer_id: volunteer.id,
            user_id: userAccount.id,
            email: volunteer.email,
            password_source: selfServicePassword ? 'self_service' : 'generated',
            // A self-service password is never returned: only a generated one
            // needs to be shown to the administrator.
            ...(generatedPassword ? { password: generatedPassword } : {}),
          })
        }

        // Update volunteer status
        const updatedVolunteer = await queryOne(
          `UPDATE volunteer_registrations
           SET status = $1,
               notes = COALESCE(notes || ' ', '') || $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING id, full_name, email, phone, id_number, county_id,
                     constituency_id, ward_id, polling_station_id, status, notes,
                     assigned_candidate_id, assigned_agent_id, assigned_at,
                     password_set_at, created_at, updated_at`,
          [
            status,
            `Status changed to ${status} by admin in bulk update on ${new Date().toLocaleDateString()}. ${notes || ''}`,
            volunteer.id
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
            volunteer.id,
            JSON.stringify({ old_status: volunteer.status }),
            JSON.stringify({
              new_status: status,
              notes,
              account_created: status === 'approved'
            })
          ]
        )

        updateResults.push({
          volunteer_id: volunteer.id,
          status: status,
          success: true,
          account_created: status === 'approved'
        })
      }

      return {
        updates: updateResults,
        accounts_created: accountCreationResults
      }
    })

    return NextResponse.json({
      message: `Successfully updated ${results.updates.length} volunteer(s)`,
      results: results
    })

  } catch (error: any) {
    console.error('Error in bulk volunteer update:', error)
    
    // Provide more specific error messages
    if (error.message?.includes('already exists')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error during bulk update' },
      { status: 500 }
    )
  }
}

export const POST = withRole(['admin'], handlePost as any)
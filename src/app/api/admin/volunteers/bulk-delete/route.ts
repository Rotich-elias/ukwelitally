import { NextRequest, NextResponse } from 'next/server'
import { query, queryMany, transaction } from '@/lib/db'
import { withRole } from '@/middleware/auth'

interface BulkDeleteRequest {
  volunteer_ids: number[]
}

// POST /api/admin/volunteers/bulk-delete - Bulk delete volunteer registrations
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    const body: BulkDeleteRequest = await req.json()
    const { volunteer_ids } = body

    if (!volunteer_ids || !Array.isArray(volunteer_ids) || volunteer_ids.length === 0) {
      return NextResponse.json(
        { error: 'volunteer_ids array is required and must not be empty' },
        { status: 400 }
      )
    }

    // Validate all volunteer IDs exist and are not assigned
    const placeholders = volunteer_ids.map((_, i) => `$${i + 1}`).join(',')
    const volunteers = await queryMany(
      `SELECT * FROM volunteer_registrations 
       WHERE id IN (${placeholders})`,
      volunteer_ids
    )

    if (volunteers.length !== volunteer_ids.length) {
      const foundIds = volunteers.map((v: any) => v.id)
      const missingIds = volunteer_ids.filter((id: number) => !foundIds.includes(id))
      
      return NextResponse.json(
        { 
          error: 'Some volunteers not found',
          missing_ids: missingIds,
          found_count: volunteers.length,
          requested_count: volunteer_ids.length
        },
        { status: 400 }
      )
    }

    // Check for assigned volunteers (cannot delete assigned volunteers)
    const assignedVolunteers = volunteers.filter((v: any) => v.status === 'assigned' || v.assigned_candidate_id)
    if (assignedVolunteers.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete volunteers that have been assigned to candidates',
          assigned_volunteers: assignedVolunteers.map((v: any) => ({
            id: v.id,
            name: v.full_name,
            assigned_candidate_id: v.assigned_candidate_id
          }))
        },
        { status: 400 }
      )
    }

    const results = await transaction(async (client) => {
      const deleteResults = []

      for (const volunteer of volunteers) {
        // Delete the volunteer registration
        await query(
          'DELETE FROM volunteer_registrations WHERE id = $1',
          [volunteer.id]
        )

        // Log the deletion
        await query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            user.userId,
            'volunteer_deleted',
            'volunteer_registration',
            volunteer.id,
            JSON.stringify({
              full_name: volunteer.full_name,
              email: volunteer.email,
              status: volunteer.status,
              created_at: volunteer.created_at
            })
          ]
        )

        deleteResults.push({
          volunteer_id: volunteer.id,
          success: true
        })
      }

      return {
        deletes: deleteResults
      }
    })

    return NextResponse.json({
      message: `Successfully deleted ${results.deletes.length} volunteer(s)`,
      results: results
    })

  } catch (error: any) {
    console.error('Error in bulk volunteer delete:', error)
    
    // Provide more specific error messages
    if (error.code === '23503') { // Foreign key violation
      return NextResponse.json(
        { error: 'Cannot delete volunteers due to existing references' },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error during bulk delete' },
      { status: 500 }
    )
  }
}

export const POST = withRole(['admin'], handlePost as any)
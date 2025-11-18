import { NextRequest, NextResponse } from 'next/server'
import { query, queryMany, transaction } from '@/lib/db'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const dynamic = 'force-dynamic'

// POST /api/admin/users/bulk-delete - Bulk delete users
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const body = await request.json()
    const { userIds } = body

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'User IDs array is required' }, { status: 400 })
    }

    // Prevent admin from deleting themselves
    if (userIds.includes(decoded.userId)) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const results = await transaction(async (client) => {
      const deletedUsers = []
      const errors = []

      for (const userId of userIds) {
        try {
          // Check if user exists and is not the current admin
          if (parseInt(userId) === decoded.userId) {
            errors.push(`Cannot delete your own account (User ID: ${userId})`)
            continue
          }

          // Get user before deletion for audit log
          const userResult = await client.query('SELECT * FROM users WHERE id = $1', [userId])
          const userToDelete = userResult.rows[0]
          if (!userToDelete) {
            errors.push(`User not found (ID: ${userId})`)
            continue
          }

          // Delete related records first (due to foreign key constraints)
          // Delete candidate profile if exists
          await client.query('DELETE FROM candidates WHERE user_id = $1', [userId])

          // Delete agent profile if exists
          await client.query('DELETE FROM agents WHERE user_id = $1', [userId])

          // Delete the user
          await client.query('DELETE FROM users WHERE id = $1', [userId])

          deletedUsers.push(userToDelete)
        } catch (error) {
          errors.push(`Failed to delete user ${userId}: ${error}`)
        }
      }

      // Audit log for bulk operation
      if (deletedUsers.length > 0) {
        await client.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_ids, old_values, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            decoded.userId,
            'bulk_delete_users',
            'user',
            JSON.stringify(deletedUsers.map(u => u.id)),
            JSON.stringify({ 
              count: deletedUsers.length,
              users: deletedUsers.map(u => ({ id: u.id, email: u.email, role: u.role }))
            }),
            request.headers.get('x-forwarded-for') || 'unknown',
          ]
        )
      }

      return { deletedUsers, errors }
    })

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${results.deletedUsers.length} users`,
      data: {
        deleted: results.deletedUsers,
        errors: results.errors,
      },
    })
  } catch (error) {
    console.error('Error in bulk user delete:', error)
    return NextResponse.json({ error: 'Failed to delete users' }, { status: 500 })
  }
}
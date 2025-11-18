import { NextRequest, NextResponse } from 'next/server'
import { query, queryMany, transaction } from '@/lib/db'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const dynamic = 'force-dynamic'

// POST /api/admin/users/bulk-update - Bulk activate/deactivate users
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
    const { userIds, action } = body

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'User IDs array is required' }, { status: 400 })
    }

    if (!action || (action !== 'activate' && action !== 'deactivate')) {
      return NextResponse.json({ error: 'Valid action (activate/deactivate) is required' }, { status: 400 })
    }

    // Prevent admin from deactivating themselves
    if (action === 'deactivate' && userIds.includes(decoded.userId)) {
      return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
    }

    const newActiveStatus = action === 'activate'

    const results = await transaction(async (client) => {
      const updatedUsers = []
      const errors = []

      for (const userId of userIds) {
        try {
          // Check if user exists and is not the current admin
          if (parseInt(userId) === decoded.userId && action === 'deactivate') {
            errors.push(`Cannot deactivate your own account (User ID: ${userId})`)
            continue
          }

          const result = await client.query(
            'UPDATE users SET active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, full_name, active',
            [newActiveStatus, userId]
          )

          if (result.rows.length > 0) {
            updatedUsers.push(result.rows[0])
          } else {
            errors.push(`User not found (ID: ${userId})`)
          }
        } catch (error) {
          errors.push(`Failed to update user ${userId}: ${error}`)
        }
      }

      // Audit log for bulk operation
      if (updatedUsers.length > 0) {
        await client.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_ids, new_values, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            decoded.userId,
            `bulk_${action}_users`,
            'user',
            JSON.stringify(updatedUsers.map(u => u.id)),
            JSON.stringify({ action, count: updatedUsers.length }),
            request.headers.get('x-forwarded-for') || 'unknown',
          ]
        )
      }

      return { updatedUsers, errors }
    })

    return NextResponse.json({
      success: true,
      message: `Successfully ${action}d ${results.updatedUsers.length} users`,
      data: {
        updated: results.updatedUsers,
        errors: results.errors,
      },
    })
  } catch (error) {
    console.error('Error in bulk user update:', error)
    return NextResponse.json({ error: 'Failed to update users' }, { status: 500 })
  }
}
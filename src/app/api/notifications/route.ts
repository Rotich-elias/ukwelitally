import { NextRequest, NextResponse } from 'next/server'
import { query, queryMany } from '@/lib/db'
import { withAuth } from '@/middleware/auth'

export const dynamic = 'force-dynamic'

// GET /api/notifications - List notifications for the current user
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user

    const { searchParams } = new URL(req.url)
    const unreadOnly = searchParams.get('unread') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 200)

    const notifications = await queryMany(
      `SELECT
         id, title, message, type, related_entity_type, related_entity_id, read, sent_at
       FROM notifications
       WHERE user_id = $1 ${unreadOnly ? 'AND read = FALSE' : ''}
       ORDER BY sent_at DESC
       LIMIT $2`,
      [user.userId, limit]
    )

    const unreadResult = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = FALSE',
      [user.userId]
    )

    return NextResponse.json({
      success: true,
      notifications,
      unread_count: parseInt(unreadResult.rows[0]?.count || '0'),
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/notifications - Mark notifications as read
async function handlePatch(req: NextRequest) {
  try {
    const user = (req as any).user
    const body = await req.json()
    const { id, all } = body

    if (all) {
      await query(
        'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
        [user.userId]
      )
    } else if (id) {
      await query(
        'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
        [id, user.userId]
      )
    } else {
      return NextResponse.json(
        { error: 'Provide a notification id or set all=true' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, message: 'Notifications updated' })
  } catch (error) {
    console.error('Error updating notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withAuth(handleGet as any)
export const PATCH = withAuth(handlePatch as any)

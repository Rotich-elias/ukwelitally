import { query, queryMany } from '@/lib/db'
import { NotificationType } from '@/types/database'

/**
 * Notification helpers.
 *
 * The `notifications` table backs the in-app notification feed. Notifications
 * are created for review outcomes, discrepancies and submission status changes
 * so users can see what happened without polling every screen.
 */

/**
 * Create a notification for a user.
 */
export async function createNotification(params: {
  userId: number
  title: string
  message: string
  type: NotificationType
  relatedEntityType?: string
  relatedEntityId?: number
}): Promise<number | null> {
  const result = await query<{ id: number }>(
    `INSERT INTO notifications (
       user_id, title, message, type, related_entity_type, related_entity_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      params.userId,
      params.title,
      params.message,
      params.type,
      params.relatedEntityType ?? null,
      params.relatedEntityId ?? null,
    ]
  )

  return result.rows[0]?.id ?? null
}

/**
 * Notify every admin about an event.
 */
export async function notifyAdmins(params: {
  title: string
  message: string
  type: NotificationType
  relatedEntityType?: string
  relatedEntityId?: number
}): Promise<void> {
  const admins = await queryMany<{ id: number }>(
    `SELECT id FROM users WHERE role = 'admin' AND active = TRUE`
  )

  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      title: params.title,
      message: params.message,
      type: params.type,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
    })
  }
}

/**
 * Notify the owner of a submission (the submitting user) about an event.
 */
export async function notifySubmissionOwner(
  submissionId: number,
  params: {
    title: string
    message: string
    type: NotificationType
  }
): Promise<void> {
  const owner = await query<{ user_id: number }>(
    'SELECT user_id FROM submissions WHERE id = $1',
    [submissionId]
  )

  if (owner.rows.length === 0) return

  await createNotification({
    userId: owner.rows[0].user_id,
    title: params.title,
    message: params.message,
    type: params.type,
    relatedEntityType: 'submission',
    relatedEntityId: submissionId,
  })
}

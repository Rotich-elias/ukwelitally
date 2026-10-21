import { query } from '@/lib/db'

/**
 * Audit trail helper.
 *
 * The application already writes to the `audit_logs` table from every route
 * that performs a security relevant action. This helper centralises the
 * insert so the new submission-control and fallback-review actions record
 * their actor, the entity they touched and the values that changed in a
 * consistent way.
 *
 * The table is append only: nothing in the application updates or deletes
 * audit rows.
 */

export interface AuditEntry {
  /** The user that performed the action. Null for system actions. */
  userId?: number | null
  /** Action name, e.g. 'submission_window_opened'. */
  action: string
  /** Entity type, e.g. 'submission_window'. */
  entityType: string
  /** Id of the affected row, when there is one. */
  entityId?: number | null
  /** Values before the change. */
  oldValues?: Record<string, unknown> | null
  /** Values after the change. */
  newValues?: Record<string, unknown> | null
  /** Client IP, when the caller knows it. */
  ipAddress?: string | null
  /** Client user agent, when the caller knows it. */
  userAgent?: string | null
}

/**
 * Write one row to the audit trail.
 *
 * Failures are logged but never thrown: an audit write must not roll back a
 * successful business operation, and a missing audit row must not take the
 * whole request down. Security decisions are still enforced in code.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (
         user_id, action, entity_type, entity_id,
         old_values, new_values, ip_address, user_agent
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.userId ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        entry.newValues ? JSON.stringify(entry.newValues) : null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
      ]
    )
  } catch (error) {
    console.error('[audit] Failed to write audit log entry:', {
      action: entry.action,
      entityType: entry.entityType,
      error: error instanceof Error ? error.message : error,
    })
  }
}

/**
 * Read the client IP and user agent from a request, for the audit trail.
 */
export function auditRequestContext(req: {
  headers: { get(name: string): string | null }
}): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: req.headers.get('user-agent'),
  }
}

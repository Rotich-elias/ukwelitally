import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { readdirSync } from 'fs'
import path from 'path'
import { authenticateRequest } from '@/lib/authenticate'

export const dynamic = 'force-dynamic'

/**
 * Health check.
 *
 * Reports whether the database is reachable and whether every migration has
 * been applied. The summary is public so monitoring can poll it, but the
 * detailed checks (including database error messages and the names of
 * pending migrations) contain deployment internals and are only returned to
 * an authenticated administrator.
 */
export async function GET(request: NextRequest) {
  const checks: Record<string, unknown> = {}
  let healthy = true

  try {
    await query('SELECT 1')
    checks.database = 'ok'
  } catch (error) {
    healthy = false
    checks.database = 'error'
    checks.database_error = error instanceof Error ? error.message : 'unknown'
  }

  try {
    const migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations')
    // The tracking table stores the full filename including the ".sql"
    // extension, so both sides are compared on the same value.
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const rows = await query<{ filename: string }>('SELECT filename FROM schema_migrations')
    const applied = new Set(rows.rows.map((r) => r.filename))
    const pending = files.filter((f) => !applied.has(f))

    checks.migrations_total = files.length
    checks.migrations_applied = files.length - pending.length
    checks.migrations_pending = pending

    if (pending.length > 0) {
      healthy = false
      checks.migrations = 'pending'
    } else {
      checks.migrations = 'ok'
    }
  } catch (error) {
    // schema_migrations may not exist yet on a brand new database.
    healthy = false
    checks.migrations = 'error'
    checks.migrations_error = error instanceof Error ? error.message : 'unknown'
  }

  const status = healthy ? 'ok' : 'degraded'
  const timestamp = new Date().toISOString()
  const statusCode = healthy ? 200 : 503

  const user = await authenticateRequest(request)
  if (user?.role === 'admin') {
    return NextResponse.json({ status, checks, timestamp }, { status: statusCode })
  }

  return NextResponse.json({ status, timestamp }, { status: statusCode })
}

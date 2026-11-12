import crypto from 'crypto'
import { query, queryOne } from '@/lib/db'
import { checkRateLimit, type RateLimitResult } from '@/lib/rateLimit'

/**
 * Rate limiting shared across server instances.
 *
 * checkRateLimit() counts in memory, per instance. On Vercel requests are
 * spread over many instances and their memory is lost on a cold start, so an
 * attacker effectively got a multiple of the configured budget for login and
 * the public endpoints. This limiter keeps a fixed-window counter in Postgres
 * (migration 033) so every instance sees the same count.
 *
 * The in-memory limiter is still consulted first: a flood against one
 * instance is refused without touching the database, and if the database is
 * unavailable (or the migration has not been run) the in-memory limit still
 * applies rather than failing open or breaking the endpoint.
 */
export async function checkSharedRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const local = checkRateLimit(key, limit, windowMs)
  if (!local.allowed) return local

  try {
    // The raw key contains IP and email addresses, so only a hash is stored.
    const keyHash = crypto.createHash('sha256').update(key).digest('hex')

    // One statement both resets an expired window and counts this request,
    // so concurrent requests on different instances cannot both pass.
    const row = await queryOne<{ count: number; reset_at_ms: string }>(
      `INSERT INTO rate_limit_buckets (key_hash, window_start, count)
       VALUES ($1, NOW(), 1)
       ON CONFLICT (key_hash) DO UPDATE SET
         count = CASE
           WHEN rate_limit_buckets.window_start <= NOW() - ($2::int * INTERVAL '1 millisecond')
             THEN 1
           ELSE rate_limit_buckets.count + 1
         END,
         window_start = CASE
           WHEN rate_limit_buckets.window_start <= NOW() - ($2::int * INTERVAL '1 millisecond')
             THEN NOW()
           ELSE rate_limit_buckets.window_start
         END
       RETURNING count,
                 (EXTRACT(EPOCH FROM window_start) * 1000 + $2::int)::bigint AS reset_at_ms`,
      [keyHash, windowMs]
    )

    pruneOccasionally()

    if (!row) return local

    const count = Number(row.count)
    const resetAt = Number(row.reset_at_ms)
    const allowed = count <= limit
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      limit,
      resetAt,
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    }
  } catch (error) {
    console.error('Shared rate limit unavailable, using the in-memory limit:', error)
    return local
  }
}

// Delete windows older than a day now and then, so the table stays small.
// Done without awaiting, outside the request's critical path.
function pruneOccasionally() {
  if (Math.random() > 0.01) return
  query(`DELETE FROM rate_limit_buckets WHERE window_start < NOW() - INTERVAL '1 day'`).catch(
    (error) => console.error('Could not prune rate limit buckets:', error)
  )
}

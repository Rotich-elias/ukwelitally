/**
 * In-process rate limiting.
 *
 * A fixed-window limiter keyed by client IP and route. This protects the
 * unauthenticated endpoints (login, registration, volunteer signup) from
 * brute force and spam. It is intentionally dependency free and process local.
 *
 * For a multi-instance deployment, swap the in-memory Map for a shared store
 * such as Redis; the interface below is all the call sites depend on.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Periodically drop expired buckets so the map does not grow without bound.
const CLEANUP_INTERVAL_MS = 60 * 1000
let lastCleanup = Date.now()

function cleanupExpiredBuckets() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/**
 * Resolve the client IP from proxy headers.
 */
export function getClientIp(req: {
  headers: { get(name: string): string | null }
}): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for may hold a comma separated chain; the first entry is
    // the original client.
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }

  return req.headers.get('x-real-ip') || 'unknown'
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: number
  retryAfterSeconds: number
}

/**
 * Consume one unit from the rate limit bucket for a key.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  cleanupExpiredBuckets()

  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    const bucket: Bucket = { count: 1, resetAt: now + windowMs }
    buckets.set(key, bucket)
    return {
      allowed: true,
      remaining: limit - 1,
      limit,
      resetAt: bucket.resetAt,
      retryAfterSeconds: 0,
    }
  }

  existing.count += 1
  const allowed = existing.count <= limit

  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    limit,
    resetAt: existing.resetAt,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/**
 * Standard limit policies for the sensitive endpoints.
 */
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  volunteerRegister: { limit: 5, windowMs: 60 * 60 * 1000 },
  submission: { limit: 60, windowMs: 60 * 1000 },
} as const

/**
 * Build a rate limit key that combines a route namespace and the client IP.
 */
export function rateLimitKey(namespace: string, ip: string): string {
  return `${namespace}:${ip}`
}

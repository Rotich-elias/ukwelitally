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
 *
 * `x-forwarded-for` is a comma separated chain that a client can prepend to.
 * The left-most entry is therefore attacker controlled unless the deployment
 * guarantees it rewrites the header. This application runs behind a platform
 * proxy, which sets `x-real-ip` to the address it observed and appends the
 * entry it saw to `x-forwarded-for`, so the reliable value is `x-real-ip` and,
 * failing that, the right-most chain entry (the one written by the closest
 * proxy). Never trust the left-most value for security decisions.
 */
export function getClientIp(req: {
  headers: { get(name: string): string | null }
  ip?: string
}): string {
  const realIp = normalizeIp(req.headers.get('x-real-ip'))
  if (realIp) return realIp

  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const entries = forwardedFor.split(',')
    for (let i = entries.length - 1; i >= 0; i--) {
      const ip = normalizeIp(entries[i])
      if (ip) return ip
    }
  }

  // NextRequest exposes the connection address on platforms that provide it
  // (for example Vercel). Local `next dev` leaves it undefined, which is why
  // callers that need per-client buckets should key on more than the IP.
  const directIp = normalizeIp(req.ip)
  if (directIp) return directIp

  return 'unknown'
}

/**
 * Trim an address and strip a trailing port when the value is clearly a
 * single host. Returns null for empty and placeholder values.
 */
function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null
  let candidate = value.trim()
  if (!candidate) return null

  // "[2001:db8::1]:443" -> "2001:db8::1"
  if (candidate.startsWith('[')) {
    const closing = candidate.indexOf(']')
    if (closing > 1) candidate = candidate.slice(1, closing)
  } else if (candidate.includes(':') && candidate.indexOf(':') === candidate.lastIndexOf(':')) {
    // "203.0.113.5:443" -> "203.0.113.5". A bare IPv6 address has several
    // colons, so it is kept intact.
    candidate = candidate.slice(0, candidate.indexOf(':'))
  }

  candidate = candidate.trim()
  if (!candidate || candidate === 'unknown') return null
  return candidate
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
  // A per-address cap that is applied in addition to the per-account cap. It
  // stops an attacker from rotating email addresses to get a fresh bucket for
  // every guess.
  loginIp: { limit: 50, windowMs: 15 * 60 * 1000 },
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  volunteerRegister: { limit: 5, windowMs: 60 * 60 * 1000 },
  submission: { limit: 60, windowMs: 60 * 1000 },
  fallbackDecision: { limit: 30, windowMs: 60 * 1000 },
  agentCreate: { limit: 30, windowMs: 60 * 60 * 1000 },
  pollVote: { limit: 30, windowMs: 60 * 60 * 1000 },
} as const

/**
 * Build a rate limit key that combines a route namespace and the client IP.
 */
export function rateLimitKey(namespace: string, ip: string): string {
  return `${namespace}:${ip}`
}

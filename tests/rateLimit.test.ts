import { describe, it, expect, vi } from 'vitest'
import { checkRateLimit, getClientIp, rateLimitKey } from '@/lib/rateLimit'

describe('checkRateLimit', () => {
  it('allows requests up to the limit', () => {
    const key = rateLimitKey('test-allow', '1.2.3.4')
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit(key, 3, 60_000)
      expect(result.allowed).toBe(true)
    }
  })

  it('blocks requests beyond the limit', () => {
    const key = rateLimitKey('test-block', '5.6.7.8')
    checkRateLimit(key, 2, 60_000)
    checkRateLimit(key, 2, 60_000)
    const third = checkRateLimit(key, 2, 60_000)

    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
    expect(third.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('tracks buckets independently per key', () => {
    const a = rateLimitKey('test-independent', '10.0.0.1')
    const b = rateLimitKey('test-independent', '10.0.0.2')

    checkRateLimit(a, 1, 60_000)
    expect(checkRateLimit(a, 1, 60_000).allowed).toBe(false)
    expect(checkRateLimit(b, 1, 60_000).allowed).toBe(true)
  })

  it('starts a fresh window once the previous one expires', () => {
    // The window is driven by a mocked clock. With a real clock the window
    // can expire between the two calls, which made this test flaky.
    vi.useFakeTimers()
    try {
      const key = rateLimitKey('test-expiry', '20.0.0.1')
      const first = checkRateLimit(key, 1, 1_000)
      expect(first.allowed).toBe(true)

      // Still inside the window, so the request is blocked.
      expect(checkRateLimit(key, 1, 1_000).allowed).toBe(false)

      // Past the window, so a fresh one starts and the request is allowed.
      vi.advanceTimersByTime(1_001)
      expect(checkRateLimit(key, 1, 1_000).allowed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('getClientIp', () => {
  const req = (headers: Record<string, string>) => ({
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  })

  it('uses the first entry of x-forwarded-for', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip', () => {
    expect(getClientIp(req({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7')
  })

  it('falls back to the request ip', () => {
    expect(getClientIp({ ...req({}), ip: '192.0.2.10' })).toBe('192.0.2.10')
  })

  it('prefers proxy headers over the request ip', () => {
    expect(
      getClientIp({
        ...req({ 'x-forwarded-for': '203.0.113.5' }),
        ip: '192.0.2.10',
      })
    ).toBe('203.0.113.5')
  })

  it('returns unknown when no header or ip is present', () => {
    expect(getClientIp(req({}))).toBe('unknown')
  })
})

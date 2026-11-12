import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ query: vi.fn() }))

import { auditRequestContext } from '@/lib/audit'

/**
 * Audit logs recorded the leftmost x-forwarded-for entry, which is whatever
 * the client sent, so anyone could write a fake address into the trail. The
 * address the platform added (x-real-ip, or the rightmost entry) is used.
 */

function headers(values: Record<string, string>) {
  return { headers: { get: (name: string) => values[name.toLowerCase()] ?? null } }
}

describe('auditRequestContext', () => {
  it('ignores an address the client put in front of x-forwarded-for', () => {
    const ctx = auditRequestContext(headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))
    expect(ctx.ipAddress).toBe('203.0.113.9')
  })

  it('prefers x-real-ip, which the platform sets', () => {
    const ctx = auditRequestContext(
      headers({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '1.2.3.4' })
    )
    expect(ctx.ipAddress).toBe('198.51.100.7')
  })

  it('records nothing rather than a placeholder when there is no address', () => {
    expect(auditRequestContext(headers({})).ipAddress).toBeNull()
  })
})

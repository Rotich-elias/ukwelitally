import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

/**
 * An administrator can reset the password of any account (for example when a
 * user has forgotten it). The old password can never be shown because only a
 * bcrypt hash is stored, so the route accepts a new one, hashes it and revokes
 * the user's existing sessions.
 */

const executed: Array<{ text: string; params?: any[] }> = []
let targetUser: Record<string, any> | null = null
let caller: { userId: number; role: string } | null = null

vi.mock('@/lib/authenticate', () => ({
  authenticateRequest: vi.fn(async () => caller),
}))

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    return { rows: [], rowCount: 0 }
  }),
  queryOne: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    if (/SELECT \* FROM users WHERE id/.test(text)) return targetUser
    if (/^UPDATE users/.test(text.trim())) {
      return { ...targetUser, password_hash: 'should-not-leak' }
    }
    return null
  }),
}))

const { PUT } = await import('@/app/api/admin/users/route')

function putRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/users', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function userUpdate() {
  return executed.find((q) => /^UPDATE users/.test(q.text.trim()))
}

describe('admin password reset', () => {
  beforeEach(() => {
    executed.length = 0
    caller = { userId: 1, role: 'admin' }
    targetUser = {
      id: 42,
      email: 'someone@example.com',
      phone: '+254700000000',
      full_name: 'Some One',
      role: 'candidate',
      active: true,
      password_hash: 'old-hash',
    }
  })

  for (const role of ['candidate', 'agent', 'observer', 'admin']) {
    it(`resets the password of a ${role} account`, async () => {
      targetUser!.role = role
      const res = await PUT(putRequest({ user_id: 42, password: 'NewPass123' }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.data.password_hash).toBeUndefined()

      const update = userUpdate()
      expect(update).toBeDefined()
      expect(update!.text).toContain('password_hash =')
      expect(update!.text).toContain('token_version = token_version + 1')
      const storedHash = update!.params!.find(
        (p) => typeof p === 'string' && p.startsWith('$2')
      )
      expect(await bcrypt.compare('NewPass123', storedHash)).toBe(true)
    })
  }

  it('never writes the plain-text password to the audit log', async () => {
    await PUT(putRequest({ user_id: 42, password: 'NewPass123' }))
    const audit = executed.find((q) => /INSERT INTO audit_logs/.test(q.text))
    expect(audit).toBeDefined()
    expect(JSON.stringify(audit!.params)).not.toContain('NewPass123')
    const newValues = JSON.parse(audit!.params![5])
    expect(newValues.password_changed).toBe(true)
  })

  it('rejects a weak password', async () => {
    const res = await PUT(putRequest({ user_id: 42, password: 'weak' }))
    expect(res.status).toBe(400)
    expect(userUpdate()).toBeUndefined()
  })

  it('refuses non-admin callers', async () => {
    caller = { userId: 7, role: 'candidate' }
    const res = await PUT(putRequest({ user_id: 42, password: 'NewPass123' }))
    expect(res.status).toBe(403)
    expect(userUpdate()).toBeUndefined()
  })
})

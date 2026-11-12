import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

/**
 * Guards on admin user management:
 * - an admin cannot deactivate their own account (a sole admin would lock
 *   everyone out);
 * - creating a user checks the role and the password policy, and validates a
 *   candidate's area before anything is written, in one transaction.
 */

const executed: Array<{ text: string; params?: any[] }> = []
let target: Record<string, unknown> | null = null

vi.mock('@/lib/authenticate', () => ({
  authenticateRequest: vi.fn(async () => ({ userId: 1, role: 'admin', email: 'a@test.local' })),
}))

vi.mock('@/lib/candidateLocation', () => ({
  validateCandidateLocation: vi.fn(async () => ({ ok: true })),
}))

function run(text: string, params?: any[]) {
  executed.push({ text, params })
  let rows: any[] = []
  if (/SELECT \* FROM users WHERE id/.test(text)) rows = target ? [target] : []
  else if (/INSERT INTO users/.test(text)) rows = [{ id: 50, email: params![0], role: params![4] }]
  return { rows, rowCount: rows.length }
}

vi.mock('@/lib/db', () => {
  const client = { query: vi.fn(async (t: string, p?: any[]) => run(t, p)) }
  return {
    query: vi.fn(async (t: string, p?: any[]) => run(t, p)),
    queryOne: vi.fn(async (t: string, p?: any[]) => run(t, p).rows[0] ?? null),
    transaction: vi.fn(async (cb: (c: any) => Promise<any>) => cb(client)),
  }
})

const { POST, PUT } = await import('@/app/api/admin/users/route')

function req(method: string, body: unknown) {
  return new NextRequest('http://localhost/api/admin/users', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ran = (pattern: RegExp) => executed.some((q) => pattern.test(q.text))

const NEW_USER = {
  email: 'new@example.com',
  phone: '0712345678',
  full_name: 'New User',
  id_number: '12345678',
  role: 'agent',
  password: 'Str0ng!Pass',
}

beforeEach(() => {
  executed.length = 0
  target = { id: 1, role: 'admin', active: true, email: 'a@test.local' }
})

describe('admin self-deactivation', () => {
  it('is refused', async () => {
    const res = await PUT(req('PUT', { user_id: 1, active: false }))
    expect(res.status).toBe(400)
    expect(ran(/^UPDATE users/)).toBe(false)
  })

  it('still allows deactivating another account', async () => {
    target = { id: 2, role: 'agent', active: true, email: 'b@test.local' }
    const res = await PUT(req('PUT', { user_id: 2, active: false }))
    expect(res.status).toBe(200)
  })
})

describe('creating a user', () => {
  it('refuses an unknown role', async () => {
    const res = await POST(req('POST', { ...NEW_USER, role: 'superuser' }))
    expect(res.status).toBe(400)
    expect(ran(/INSERT INTO users/)).toBe(false)
  })

  it('refuses a weak or published password', async () => {
    for (const password of ['1234', 'Agent123!']) {
      const res = await POST(req('POST', { ...NEW_USER, password }))
      expect(res.status).toBe(400)
    }
    expect(ran(/INSERT INTO users/)).toBe(false)
  })

  it('validates a candidate area before creating the account', async () => {
    const res = await POST(req('POST', { ...NEW_USER, role: 'candidate', position: 'mca' }))
    expect(res.status).toBe(400)
    expect(ran(/INSERT INTO users/)).toBe(false)
  })

  it('creates a candidate and their profile in one transaction', async () => {
    const res = await POST(
      req('POST', { ...NEW_USER, role: 'candidate', position: 'mca', ward_id: 1400 })
    )
    expect(res.status).toBe(201)
    expect(ran(/INSERT INTO users/)).toBe(true)
    expect(ran(/INSERT INTO candidates/)).toBe(true)
  })
})

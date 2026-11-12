import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

/**
 * - Bulk user delete returned whole user rows, password hashes included.
 * - Volunteer assignment ran BEGIN/COMMIT through the connection pool, so the
 *   statements could land on different connections, and generated a
 *   'Pass' + 4 digit password.
 */

const poolQueries: string[] = []
const clientQueries: Array<{ text: string; params?: any[] }> = []

vi.mock('@/lib/authenticate', () => ({
  authenticateRequest: vi.fn(async () => ({ userId: 1, role: 'admin', email: 'a@test.local' })),
}))

function rowsFor(text: string): any[] {
  if (/FROM users WHERE id/.test(text)) {
    // Whatever is selected, a careless SELECT * would also return these.
    return [{ id: 42, email: 'x@test.local', role: 'agent', full_name: 'X' }]
  }
  if (/FROM volunteer_registrations WHERE id/.test(text)) {
    return [{ id: 5, email: 'v@test.local', phone: '+254700000001', full_name: 'Vol', id_number: '12345678', polling_station_id: 7, password_hash: null, status: 'approved' }]
  }
  if (/FROM candidates c\s+JOIN users u/.test(text)) return [{ id: 10, full_name: 'Cand' }]
  if (/INSERT INTO users/.test(text)) return [{ id: 300 }]
  if (/INSERT INTO agents/.test(text)) return [{ id: 400 }]
  if (/COUNT\(\*\)::int AS cnt/.test(text)) return [{ cnt: 0 }]
  return []
}

vi.mock('@/lib/db', () => {
  const client = {
    query: vi.fn(async (text: string, params?: any[]) => {
      clientQueries.push({ text, params })
      const rows = rowsFor(text)
      return { rows, rowCount: rows.length }
    }),
  }
  const pool = async (text: string) => {
    poolQueries.push(text)
    const rows = rowsFor(text)
    return { rows, rowCount: rows.length }
  }
  return {
    query: vi.fn(pool),
    queryOne: vi.fn(async (text: string) => (await pool(text)).rows[0] ?? null),
    queryMany: vi.fn(async (text: string) => (await pool(text)).rows),
    transaction: vi.fn(async (cb: (c: any) => Promise<any>) => cb(client)),
  }
})

const { POST: bulkDelete } = await import('@/app/api/admin/users/bulk-delete/route')
const { POST: assignVolunteer } = await import('@/app/api/admin/volunteers/route')
const { isStrongPassword } = await import('@/lib/auth')

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  poolQueries.length = 0
  clientQueries.length = 0
})

describe('bulk user delete', () => {
  it('selects only identifying fields, so no hash or ID number reaches the browser', async () => {
    const res = await bulkDelete(post('/api/admin/users/bulk-delete', { userIds: [42] }))
    expect(res.status).toBe(200)
    const select = clientQueries.find((q) => /FROM users WHERE id/.test(q.text))!
    expect(select.text).not.toContain('SELECT *')
    expect(select.text).not.toMatch(/password_hash|id_number/)
  })
})

describe('volunteer assignment', () => {
  it('runs every write on one transaction connection, never BEGIN through the pool', async () => {
    const res = await assignVolunteer(
      post('/api/admin/volunteers', { volunteer_id: 5, candidate_id: 10 })
    )
    expect(res.status).toBe(201)
    expect(poolQueries.some((q) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(q.trim()))).toBe(false)
    expect(poolQueries.some((q) => /INSERT INTO|UPDATE volunteer_registrations/.test(q))).toBe(false)
    for (const pattern of [/INSERT INTO users/, /INSERT INTO agents/, /UPDATE volunteer_registrations/, /INSERT INTO audit_logs/]) {
      expect(clientQueries.some((q) => pattern.test(q.text))).toBe(true)
    }
  })

  it('generates a strong random password', async () => {
    const res = await assignVolunteer(
      post('/api/admin/volunteers', { volunteer_id: 5, candidate_id: 10 })
    )
    const body = await res.json()
    const password = body.credentials.password
    expect(password).not.toMatch(/^Pass\d{4}$/)
    expect(isStrongPassword(password).valid).toBe(true)
    const insert = clientQueries.find((q) => /INSERT INTO users/.test(q.text))!
    expect(await bcrypt.compare(password, insert.params![2])).toBe(true)
  })
})

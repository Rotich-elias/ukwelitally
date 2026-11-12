import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

/**
 * Imported agents used to get the shared default password "Agent123!", which
 * was also printed in the public CSV template. Each new agent now gets its own
 * random password, returned once, and a password in the file must meet the
 * policy and may not be a published example.
 */

const executed: Array<{ text: string; params?: any[] }> = []

vi.mock('@/lib/authenticate', () => ({
  authenticateRequest: vi.fn(async () => ({ userId: 1, role: 'admin', email: 'a@test.local' })),
}))

function run(text: string, params?: any[]) {
  executed.push({ text, params })
  let rows: any[] = []
  if (/FROM counties/.test(text)) rows = [{ id: 47, name: 'Nairobi' }]
  else if (/FROM constituencies/.test(text)) rows = [{ id: 290, name: 'Westlands', county_id: 47 }]
  else if (/FROM wards/.test(text)) {
    rows = [{ id: 1400, name: 'Parklands/Highridge', constituency_id: 290, county_id: 47 }]
  } else if (/FROM candidates c\s+JOIN users u/.test(text)) rows = [{ id: 10, name: 'Jane Wanjiru' }]
  else if (/FROM polling_stations/.test(text)) {
    rows = [{ id: 7, name: 'Westlands Primary School', code: '047001', stream: null, ward_id: 1400 }]
  } else if (/SELECT id FROM candidates WHERE id/.test(text)) rows = [{ id: 10 }]
  else if (/SELECT id FROM polling_stations WHERE id/.test(text)) rows = [{ id: 7 }]
  else if (/INSERT INTO users/.test(text)) rows = [{ id: 555 }]
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

const { POST } = await import('@/app/api/agents/import/route')
const { generateSecurePassword, isPublishedPassword, isStrongPassword } = await import('@/lib/auth')

const HEADER =
  'full_name,email,phone,id_number,candidate,county,constituency,ward,polling_station,stream,is_primary,password'

function importCsv(rows: string[]) {
  const form = new FormData()
  form.append('file', new File([[HEADER, ...rows].join('\n')], 'agents.csv', { type: 'text/csv' }))
  form.append('mode', 'update')
  return POST(new NextRequest('http://localhost/api/agents/import', { method: 'POST', body: form }))
}

const ROW = (password: string) =>
  `John Doe,john@example.com,0712345678,12345678,Jane Wanjiru,Nairobi,Westlands,Parklands/Highridge,Westlands Primary School,,true,${password}`

describe('generateSecurePassword', () => {
  it('always meets the password policy and differs each time', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const password = generateSecurePassword()
      expect(isStrongPassword(password).valid).toBe(true)
      seen.add(password)
    }
    expect(seen.size).toBe(200)
  })
})

describe('isPublishedPassword', () => {
  it('refuses the example passwords from the templates', () => {
    expect(isPublishedPassword('Agent123!')).toBe(true)
    expect(isPublishedPassword(' admin123 ')).toBe(true)
    expect(isPublishedPassword(generateSecurePassword())).toBe(false)
  })
})

describe('agent import passwords', () => {
  beforeEach(() => {
    executed.length = 0
  })

  it('gives a new agent without a password its own random password and returns it once', async () => {
    const res = await importCsv([ROW('')])
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.imported).toBe(1)
    expect(body.credentials).toHaveLength(1)
    const { password } = body.credentials[0]
    expect(isStrongPassword(password).valid).toBe(true)

    const insert = executed.find((q) => /INSERT INTO users/.test(q.text))!
    const storedHash = insert.params![2]
    expect(await bcrypt.compare(password, storedHash)).toBe(true)
    expect(await bcrypt.compare('Agent123!', storedHash)).toBe(false)

    // The plain-text password is never written to the audit log.
    const audit = executed.find((q) => /INSERT INTO audit_logs/.test(q.text))
    expect(JSON.stringify(audit?.params)).not.toContain(password)
  })

  it('refuses the published example password', async () => {
    const res = await importCsv([ROW('Agent123!')])
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.errors[0]).toContain('published example')
    expect(executed.some((q) => /INSERT INTO users/.test(q.text))).toBe(false)
  })

  it('refuses a weak password in the file', async () => {
    const res = await importCsv([ROW('abc')])
    expect(res.status).toBe(400)
  })

  it('uses a strong password from the file and does not echo it back', async () => {
    const res = await importCsv([ROW('Str0ng!Pass')])
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.credentials).toEqual([])
    const insert = executed.find((q) => /INSERT INTO users/.test(q.text))!
    expect(await bcrypt.compare('Str0ng!Pass', insert.params![2])).toBe(true)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

/**
 * - Login gives the same answer, after the same bcrypt work, for an unknown
 *   email, a wrong password and a deactivated account with a wrong password,
 *   so it cannot be used to find out which accounts exist.
 * - Logout revokes the account's tokens instead of only clearing the cookie.
 */

const executed: Array<{ text: string; params?: any[] }> = []
let account: Record<string, unknown> | null = null
const compareSpy = vi.spyOn(bcrypt, 'compare')

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    return { rows: [], rowCount: 1 }
  }),
  queryOne: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    return /FROM users WHERE email/.test(text) ? account : null
  }),
}))

const { POST: login } = await import('@/app/api/auth/login/route')
const { POST: logout } = await import('@/app/api/auth/logout/route')
const { generateToken } = await import('@/lib/auth')

let ip = 0
function loginRequest(email: string, password: string) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': `10.1.0.${++ip}` },
    body: JSON.stringify({ email, password }),
  })
}

const PASSWORD = 'Str0ng!Pass'
const HASH = bcrypt.hashSync(PASSWORD, 4)

beforeEach(() => {
  executed.length = 0
  compareSpy.mockClear()
  account = { id: 7, email: 'user@example.com', role: 'agent', active: true, password_hash: HASH, token_version: 3 }
})

describe('login', () => {
  async function attempt(email: string, password: string) {
    const res = await login(loginRequest(email, password))
    return { status: res.status, body: await res.json() }
  }

  it('answers an unknown email exactly like a wrong password, after a bcrypt comparison', async () => {
    const wrong = await attempt('user@example.com', 'Wrong!Pass1')
    account = null
    compareSpy.mockClear()
    const unknown = await attempt('nobody@example.com', 'Wrong!Pass1')

    expect(unknown).toEqual(wrong)
    expect(unknown.status).toBe(401)
    expect(compareSpy).toHaveBeenCalledTimes(1)
  })

  it('does not reveal that an account is deactivated without its password', async () => {
    account = { ...account!, active: false }
    const res = await attempt('user@example.com', 'Wrong!Pass1')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid email or password')
  })

  it('tells the owner of a deactivated account who signs in correctly', async () => {
    account = { ...account!, active: false }
    const res = await attempt('user@example.com', PASSWORD)
    expect(res.status).toBe(403)
  })
})

describe('logout', () => {
  it("revokes the account's tokens", async () => {
    const token = generateToken({ userId: 7, email: 'user@example.com', role: 'agent', tokenVersion: 3 })
    const res = await logout(
      new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    )
    expect(res.status).toBe(200)
    const update = executed.find((q) => /token_version = token_version \+ 1/.test(q.text))
    expect(update?.params).toEqual([7, 3])
  })

  it('also works from the session cookie alone', async () => {
    const token = generateToken({ userId: 7, email: 'user@example.com', role: 'agent', tokenVersion: 3 })
    await logout(
      new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie: `ukwelitally_session=${token}` },
      })
    )
    expect(executed.some((q) => /token_version = token_version \+ 1/.test(q.text))).toBe(true)
  })

  it('still clears the cookie without a valid token', async () => {
    const res = await logout(new NextRequest('http://localhost/api/auth/logout', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('ukwelitally_session=;')
    expect(executed).toHaveLength(0)
  })
})

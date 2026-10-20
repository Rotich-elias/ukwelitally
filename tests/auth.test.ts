import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The token helpers read JWT_SECRET when their module is first loaded, so a
// real secret has to be in place before the import below runs. vi.hoisted is
// evaluated before the imports.
vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

import {
  hashPassword,
  verifyPassword,
  normalizePhoneNumber,
  isValidKenyanPhone,
  isValidEmail,
  isStrongPassword,
  extractTokenFromHeader,
  generateToken,
  verifyToken,
  sanitizeUser,
} from '@/lib/auth'
import { isPlaceholderSecret } from '@/lib/jwtPlaceholders'

describe('hashPassword / verifyPassword', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('SecurePass123')
    expect(await verifyPassword('SecurePass123', hash)).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('SecurePass123')
    expect(await verifyPassword('WrongPass123', hash)).toBe(false)
  })

  it('produces a different hash for the same password each time', async () => {
    const a = await hashPassword('SecurePass123')
    const b = await hashPassword('SecurePass123')
    expect(a).not.toBe(b)
  })
})

describe('normalizePhoneNumber', () => {
  it('converts a local 07 number to international format', () => {
    expect(normalizePhoneNumber('0712345678')).toBe('+254712345678')
  })

  it('converts a local 01 number to international format', () => {
    expect(normalizePhoneNumber('0123456789')).toBe('+254123456789')
  })

  it('leaves an already international number unchanged', () => {
    expect(normalizePhoneNumber('+254712345678')).toBe('+254712345678')
  })

  it('strips spaces and dashes', () => {
    expect(normalizePhoneNumber('0712 345 678')).toBe('+254712345678')
    expect(normalizePhoneNumber('0712-345-678')).toBe('+254712345678')
  })
})

describe('isValidKenyanPhone', () => {
  it('accepts valid Kenyan formats', () => {
    expect(isValidKenyanPhone('0712345678')).toBe(true)
    expect(isValidKenyanPhone('+254712345678')).toBe(true)
    expect(isValidKenyanPhone('0123456789')).toBe(true)
  })

  it('rejects invalid numbers', () => {
    expect(isValidKenyanPhone('12345')).toBe(false)
    expect(isValidKenyanPhone('+25412345678')).toBe(false)
  })
})

describe('isValidEmail', () => {
  it('accepts a normal email', () => {
    expect(isValidEmail('someone@example.com')).toBe(true)
  })

  it('rejects malformed emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('missing@domain')).toBe(false)
  })
})

describe('isStrongPassword', () => {
  it('accepts a strong password', () => {
    const result = isStrongPassword('SecurePass123')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('reports every weakness', () => {
    const result = isStrongPassword('weak')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(1)
  })
})

describe('extractTokenFromHeader', () => {
  it('extracts the token from a bearer header', () => {
    expect(extractTokenFromHeader('Bearer abc123')).toBe('abc123')
  })

  it('returns null for a missing or malformed header', () => {
    expect(extractTokenFromHeader(null)).toBeNull()
    expect(extractTokenFromHeader('abc123')).toBeNull()
    expect(extractTokenFromHeader('Basic abc123')).toBeNull()
  })
})

describe('generateToken / verifyToken', () => {
  it('round trips a payload', () => {
    const token = generateToken({ userId: 42, email: 'a@b.com', role: 'admin' })
    const payload = verifyToken(token)

    expect(payload).not.toBeNull()
    expect(payload?.userId).toBe(42)
    expect(payload?.role).toBe('admin')
  })

  it('rejects a tampered token', () => {
    const token = generateToken({ userId: 1, email: 'a@b.com', role: 'agent' })
    const tampered = token.slice(0, -3) + 'xyz'

    expect(verifyToken(tampered)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ userId: 1, role: 'admin' })).toString('base64url'),
      'invalidsignature',
    ].join('.')

    expect(verifyToken(forged)).toBeNull()
  })
})

describe('token issuance fails closed without a real secret', () => {
  const original = process.env.JWT_SECRET

  afterEach(() => {
    process.env.JWT_SECRET = original
  })

  it('refuses to issue a token when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET

    expect(() =>
      generateToken({ userId: 1, email: 'a@b.com', role: 'admin' })
    ).toThrow(/JWT_SECRET/)
  })

  it('refuses to issue a token when JWT_SECRET is still a placeholder', () => {
    process.env.JWT_SECRET = 'your-secret-key-change-in-production'

    expect(() =>
      generateToken({ userId: 1, email: 'a@b.com', role: 'admin' })
    ).toThrow(/JWT_SECRET/)
  })

  it('issues a token when a real secret is configured', () => {
    process.env.JWT_SECRET = 'a-real-secret-for-this-test'

    const token = generateToken({ userId: 1, email: 'a@b.com', role: 'admin' })
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)
  })
})

describe('isPlaceholderSecret', () => {
  it('treats a missing or empty secret as a placeholder', () => {
    expect(isPlaceholderSecret(undefined)).toBe(true)
    expect(isPlaceholderSecret(null)).toBe(true)
    expect(isPlaceholderSecret('')).toBe(true)
    expect(isPlaceholderSecret('   ')).toBe(true)
  })

  it('treats the documented placeholders as placeholders', () => {
    expect(isPlaceholderSecret('your-secret-key-change-in-production')).toBe(true)
    expect(isPlaceholderSecret('your-secret-key-here')).toBe(true)
    expect(isPlaceholderSecret('change-me')).toBe(true)
  })

  it('does not treat a real secret as a placeholder', () => {
    expect(isPlaceholderSecret('a-real-secret-for-this-test')).toBe(false)
  })
})

describe('sanitizeUser', () => {
  it('strips sensitive fields', () => {
    const result = sanitizeUser({
      id: 1,
      email: 'a@b.com',
      phone: '+254700000000',
      full_name: 'Test User',
      role: 'admin',
      verified: true,
      password_hash: 'super-secret',
      id_number: '12345678',
    })

    expect(result).not.toHaveProperty('password_hash')
    expect(result).not.toHaveProperty('id_number')
    expect(result.email).toBe('a@b.com')
  })
})

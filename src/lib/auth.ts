import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { JWTPayload, AuthUser, UserRole } from '@/types/database'
import { getJwtSecret, isJwtSecretConfigured } from '@/lib/jwtSecret'

const JWT_SECRET = getJwtSecret()
const SALT_ROUNDS = 10

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

// Verify password
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Generate JWT token
//
// Refuses to issue a token when no real secret is configured. Without a real
// secret the token would be signed with the random per-process fallback, so
// it would be rejected by every other instance: the user would appear to log
// in and then be logged out on the next request. Failing here turns that
// confusing behaviour into an obvious server error.
export function generateToken(payload: JWTPayload): string {
  if (!isJwtSecretConfigured()) {
    throw new Error(
      'JWT_SECRET is not configured. Set JWT_SECRET to a strong random value ' +
        '(for example: openssl rand -base64 32) before issuing tokens.'
    )
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d', // Token expires in 7 days
  })
}

// Verify JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    return decoded
  } catch (error) {
    console.error('JWT verification failed:', error)
    return null
  }
}

// Extract token from Authorization header
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.substring(7)
}

// Validate phone number (Kenyan format)
export function isValidKenyanPhone(phone: string): boolean {
  // Kenyan phone: +254XXXXXXXXX or 07XXXXXXXX or 01XXXXXXXX
  const kenyanPhoneRegex = /^(\+254|0)(7|1)\d{8}$/
  return kenyanPhoneRegex.test(phone)
}

// Normalize phone number to international format
export function normalizePhoneNumber(phone: string): string {
  // Remove spaces and dashes
  let normalized = phone.replace(/[\s-]/g, '')

  // Convert 07XX to +2547XX
  if (normalized.startsWith('07') || normalized.startsWith('01')) {
    normalized = '+254' + normalized.substring(1)
  }

  // Convert 7XX to +2547XX
  if (normalized.startsWith('7') || normalized.startsWith('1')) {
    normalized = '+254' + normalized
  }

  return normalized
}

// Normalize an email address for storage and lookup.
//
// Postgres compares text case-sensitively, so an address stored as
// "User@Example.com" does not match a login for "user@example.com". Every
// account creation path and the login lookup go through this helper so the
// two always agree.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Validate email
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validate ID number (simple check - adjust based on Kenyan ID format)
export function isValidIdNumber(idNumber: string): boolean {
  // Basic validation: 7-8 digits
  const idRegex = /^\d{7,8}$/
  return idRegex.test(idNumber)
}

// Check if user has required role
export function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole)
}

// Check if user is admin
export function isAdmin(userRole: UserRole): boolean {
  return userRole === 'admin'
}

// Validate password strength
export function isStrongPassword(password: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// Generate OTP (for phone verification)
export function generateOTP(length: number = 6): string {
  const digits = '0123456789'
  let otp = ''
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)]
  }
  return otp
}

// Sanitize user data (remove sensitive fields)
export function sanitizeUser(user: any): AuthUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    full_name: user.full_name,
    role: user.role,
    verified: user.verified,
  }
}

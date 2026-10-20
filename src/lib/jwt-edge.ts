/**
 * Edge-runtime-safe JWT verification.
 *
 * Next.js middleware runs on the Edge runtime, where Node's `crypto` module
 * and the `jsonwebtoken` package are unavailable. This module verifies an
 * HS256 JWT using the Web Crypto API, which is available in both runtimes.
 *
 * It is intentionally strict: the algorithm must be HS256, the signature must
 * match, and the token must not be expired.
 */

export interface EdgeJwtPayload {
  userId: number
  email: string
  role: string
  exp?: number
  iat?: number
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4)

  const binary = atob(withPadding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

/**
 * Verify an HS256 JWT and return its payload, or null when the token is
 * invalid, malformed, or expired.
 */
export async function verifyJwtEdge(
  token: string,
  secret: string
): Promise<EdgeJwtPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerPart, payloadPart, signaturePart] = parts

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerPart)))
    if (header?.alg !== 'HS256') return null

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const signedData = new TextEncoder().encode(`${headerPart}.${payloadPart}`)
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signaturePart) as unknown as BufferSource,
      signedData as unknown as BufferSource
    )
    if (!isValid) return null

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)))

    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      return null
    }

    return payload as EdgeJwtPayload
  } catch {
    return null
  }
}

/**
 * Sign an HS256 JWT. Used by the login route to issue the session cookie.
 */
export async function signJwtEdge(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const body = { ...payload, iat: now, exp: now + expiresInSeconds }

  const headerPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))
  const payloadPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(body)))
  const signedData = new TextEncoder().encode(`${headerPart}.${payloadPart}`)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, signedData)
  return `${headerPart}.${payloadPart}.${base64UrlEncode(new Uint8Array(signature))}`
}

/**
 * Constant-time string comparison for non-secret values.
 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b))
}

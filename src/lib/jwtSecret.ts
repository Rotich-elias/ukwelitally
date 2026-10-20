// Resolve the JWT signing secret.
//
// The application must never fall back to a well-known secret: a known key
// lets anybody forge an admin token. This helper therefore fails closed.
//
// - If JWT_SECRET is set to a real value it is returned as-is.
// - If it is missing, empty, or still one of the documented placeholder
//   values, a random per-process secret is returned instead. Tokens signed
//   with it cannot be reproduced by an attacker, and they cannot be verified
//   by a different instance either, so a misconfigured deployment cannot
//   authenticate anybody rather than authenticating everybody.
//
// The random value is generated once per process, so signing and verifying
// still work within a single instance.
//
// This module uses node:crypto and therefore only runs on the Node runtime.
// The Edge middleware uses src/lib/jwtPlaceholders.ts instead.

import { randomBytes } from 'crypto'
import { isPlaceholderSecret } from '@/lib/jwtPlaceholders'

let fallbackSecret: string | null = null

/**
 * True when a real, non-placeholder JWT secret is configured.
 *
 * Callers that issue tokens should check this first: without a real secret a
 * token is signed with the random per-process fallback, which no other
 * instance can verify.
 */
export function isJwtSecretConfigured(): boolean {
  return !isPlaceholderSecret(process.env.JWT_SECRET)
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()

  if (secret && !isPlaceholderSecret(secret)) {
    return secret
  }

  if (!fallbackSecret) {
    fallbackSecret = randomBytes(48).toString('hex')
    console.error(
      '[auth] JWT_SECRET is not configured (missing or still a placeholder value). ' +
        'A random per-process secret is being used instead, so no token can be ' +
        'forged but no session can survive a restart or cross instances. ' +
        'Set JWT_SECRET to a strong random value, e.g. "openssl rand -base64 32".'
    )
  }

  return fallbackSecret
}

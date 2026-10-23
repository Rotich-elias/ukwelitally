// Known placeholder values for JWT_SECRET.
//
// This module is deliberately free of any Node.js dependency so it can also
// be imported by the Edge middleware, which cannot use node:crypto. Keep it
// that way: anything added here must run in the Edge runtime.

/** Values that are documentation placeholders, not real secrets. */
export const JWT_PLACEHOLDER_SECRETS: ReadonlySet<string> = new Set([
  'your-secret-key-change-in-production',
  'your-secret-key-change-this',
  'your-secret-key-here',
  'change-me',
  'changeme',
])

/**
 * True when the given value is missing, empty, or still a placeholder.
 *
 * A placeholder must never be treated as a real secret: it is published in
 * .env.example, so anybody could sign a token with it.
 */
export function isPlaceholderSecret(secret: string | null | undefined): boolean {
  if (!secret) return true

  const trimmed = secret.trim()
  if (!trimmed) return true

  return JWT_PLACEHOLDER_SECRETS.has(trimmed)
}

/**
 * Return the secret exactly as it must be used for signing and verification,
 * or null when it is missing or still a placeholder.
 *
 * Trimming matters: the Node helpers in src/lib/auth.ts trim JWT_SECRET before
 * signing, so the Edge middleware has to trim it the same way. Without this a
 * trailing space in .env produces a token that verifies in the API but not in
 * middleware, and the user is bounced straight back to /login after a
 * successful login.
 */
export function resolveJwtSecretForEdge(
  secret: string | null | undefined
): string | null {
  if (isPlaceholderSecret(secret)) return null
  return secret!.trim()
}

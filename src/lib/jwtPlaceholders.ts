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

/**
 * Recovery from stale JavaScript chunks.
 *
 * A browser can end up with chunks from two different builds: an old tab that
 * is still open after a deployment, a service worker that cached a chunk, or a
 * dev server that rebuilt while the page was open. The webpack runtime then
 * fails with messages such as:
 *
 *   ChunkLoadError: Loading chunk 123 failed
 *   TypeError: Cannot read properties of undefined (reading 'call')
 *
 * None of those are recoverable in the current document. Reloading the page
 * fetches a runtime and chunks from the same build. These helpers detect the
 * failure and reload at most once per cooldown, so a genuine application error
 * can never trap the browser in a reload loop.
 */

/** sessionStorage key holding the time of the last automatic reload. */
const RELOAD_KEY = 'ukwelitally:chunk-recovery-at'

/** Do not reload again within this window, even if the error repeats. */
const RELOAD_COOLDOWN_MS = 15_000

/**
 * Messages browsers and bundlers use when a chunk cannot be loaded.
 *
 * The webpack "reading 'call'" message is included because it is the
 * observable symptom of a chunk/runtime mismatch in a minified production
 * bundle, where the missing module factory is reported only as an undefined
 * value being called.
 */
const CHUNK_ERROR_SIGNATURES: RegExp[] = [
  /ChunkLoadError/i,
  /Loading chunk [\w.-]+ failed/i,
  /Loading CSS chunk [\w.-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Cannot read properties of undefined \(reading 'call'\)/i,
]

function partsOf(error: unknown, depth = 0): string[] {
  if (error === null || error === undefined) return []
  if (typeof error === 'string') return [error]
  if (typeof error !== 'object') return [String(error)]
  if (depth > 3) return []

  const value = error as {
    name?: unknown
    message?: unknown
    reason?: unknown
    error?: unknown
    cause?: unknown
  }

  const parts: string[] = []
  if (typeof value.name === 'string') parts.push(value.name)
  if (typeof value.message === 'string') parts.push(value.message)
  if (value.reason) parts.push(...partsOf(value.reason, depth + 1))
  if (value.error) parts.push(...partsOf(value.error, depth + 1))
  if (value.cause) parts.push(...partsOf(value.cause, depth + 1))

  return parts
}

/**
 * The human-readable text of an unknown error, including nested causes.
 */
export function chunkErrorMessage(error: unknown): string {
  return partsOf(error).join(' ')
}

/**
 * Does this error mean that the page and the loaded chunks are from
 * different builds?
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = chunkErrorMessage(error)
  if (!message) return false
  return CHUNK_ERROR_SIGNATURES.some((signature) => signature.test(message))
}

/**
 * Is a reload allowed, given when the last automatic reload happened?
 */
export function shouldAttemptChunkRecovery(
  lastAttempt: number | null | undefined,
  now: number = Date.now()
): boolean {
  if (typeof lastAttempt !== 'number' || !Number.isFinite(lastAttempt)) return true
  return now - lastAttempt >= RELOAD_COOLDOWN_MS
}

function readLastAttempt(): number | null {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_KEY)
    if (!raw) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). In that
    // case the cooldown is skipped rather than disabling recovery entirely.
    return null
  }
}

function rememberAttempt(now: number) {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    // Ignore: recovery still works, it just loses the reload-loop guard.
  }
}

/**
 * Delete the caches that can hold chunks from an earlier build.
 *
 * Only caches owned by this app are touched. The service worker repopulates
 * them after the reload.
 */
async function clearAppCaches(): Promise<void> {
  if (typeof caches === 'undefined') return

  try {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith('ukwelitally'))
        .map((key) => caches.delete(key))
    )
  } catch {
    // A failed cache cleanup must not block the reload.
  }
}

/**
 * Reload the page so that runtime and chunks come from the same build.
 *
 * Returns `false` without reloading when the cooldown is active or when there
 * is no browser (server rendering).
 */
export async function recoverFromChunkLoadError(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  const now = Date.now()
  if (!shouldAttemptChunkRecovery(readLastAttempt(), now)) return false

  // Record the attempt before doing anything async, so two errors raised at
  // the same time cannot both trigger a reload.
  rememberAttempt(now)

  await clearAppCaches()
  window.location.reload()
  return true
}

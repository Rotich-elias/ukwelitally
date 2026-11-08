import { describe, expect, it } from 'vitest'
import {
  chunkErrorMessage,
  isChunkLoadError,
  shouldAttemptChunkRecovery,
} from '@/lib/chunkRecovery'

/**
 * Stale chunk recovery.
 *
 * A page can outlive a deployment or a dev rebuild. Its webpack runtime then
 * tries to load chunks from the new build and fails with one of a handful of
 * messages. Recognising those messages is what lets the app reload itself
 * instead of showing a broken page.
 */

describe('isChunkLoadError', () => {
  it('recognises a webpack ChunkLoadError', () => {
    const error = new Error('Loading chunk 123 failed.')
    error.name = 'ChunkLoadError'
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('recognises the minified webpack runtime error', () => {
    expect(
      isChunkLoadError(
        new TypeError("Cannot read properties of undefined (reading 'call')")
      )
    ).toBe(true)
  })

  it('recognises a failed dynamic import', () => {
    expect(
      isChunkLoadError(
        new TypeError('Failed to fetch dynamically imported module: /app.js')
      )
    ).toBe(true)
  })

  it('recognises a bare message string', () => {
    expect(isChunkLoadError('Loading CSS chunk 4 failed.')).toBe(true)
  })

  it('recognises the reason of a rejected promise', () => {
    expect(
      isChunkLoadError({
        reason: { name: 'ChunkLoadError', message: 'Loading chunk 9 failed.' },
      })
    ).toBe(true)
  })

  it('recognises an error wrapped in a cause', () => {
    expect(
      isChunkLoadError({
        message: 'Import failed',
        cause: new Error('Importing a module script failed.'),
      })
    ).toBe(true)
  })

  it('leaves ordinary application errors alone', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false)
    expect(isChunkLoadError('Not authenticated')).toBe(false)
  })

  it('handles missing errors without throwing', () => {
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(chunkErrorMessage(null)).toBe('')
  })
})

describe('shouldAttemptChunkRecovery', () => {
  const now = 1_700_000_000_000

  it('allows the first recovery', () => {
    expect(shouldAttemptChunkRecovery(null, now)).toBe(true)
    expect(shouldAttemptChunkRecovery(undefined, now)).toBe(true)
  })

  it('blocks a reload during the cooldown', () => {
    expect(shouldAttemptChunkRecovery(now - 1_000, now)).toBe(false)
    expect(shouldAttemptChunkRecovery(now - 14_999, now)).toBe(false)
  })

  it('allows a reload after the cooldown', () => {
    expect(shouldAttemptChunkRecovery(now - 15_000, now)).toBe(true)
    expect(shouldAttemptChunkRecovery(now - 60_000, now)).toBe(true)
  })

  it('ignores a corrupt timestamp instead of locking recovery out', () => {
    expect(shouldAttemptChunkRecovery(Number.NaN, now)).toBe(true)
  })
})

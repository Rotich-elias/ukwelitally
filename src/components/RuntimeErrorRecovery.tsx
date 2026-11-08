'use client'

import { useEffect } from 'react'
import { isChunkLoadError, recoverFromChunkLoadError } from '@/lib/chunkRecovery'

/**
 * Reloads the page when a stale JavaScript chunk breaks the app.
 *
 * Errors during navigation and lazy imports are reported to `window`, not to
 * a React error boundary, so the listeners here catch the chunk failures a
 * boundary would miss. A genuine error is left alone.
 */
export default function RuntimeErrorRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        void recoverFromChunkLoadError()
      }
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        void recoverFromChunkLoadError()
      }
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}

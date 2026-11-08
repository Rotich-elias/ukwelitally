'use client'

import { useEffect } from 'react'
import { isChunkLoadError, recoverFromChunkLoadError } from '@/lib/chunkRecovery'

/**
 * Last-resort boundary for errors in the root layout.
 *
 * It replaces the root layout, so the global stylesheet is not guaranteed to
 * be loaded. The styles are inline on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const chunkError = isChunkLoadError(error)

  useEffect(() => {
    console.error('Application error:', error)
    if (chunkError) void recoverFromChunkLoadError()
  }, [error, chunkError])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#050814',
          color: '#e2e8f0',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <main
          style={{
            width: '100%',
            maxWidth: '480px',
            textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px',
            background: 'rgba(255,255,255,0.03)',
            padding: '32px',
          }}
        >
          <h1 style={{ margin: '0 0 12px', fontSize: '24px' }}>
            {chunkError ? 'Reloading the latest version' : 'UkweliTally could not start'}
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 }}>
            {chunkError
              ? 'The app was updated while this page was open. Reloading fetches the matching files.'
              : 'An unexpected error stopped the page from loading. Try again; if it keeps happening, reload the page.'}
          </p>
          <button
            onClick={() => {
              if (chunkError) {
                void recoverFromChunkLoadError()
                return
              }
              reset()
            }}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(90deg, #2563eb, #06b6d4)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {chunkError ? 'Reload page' : 'Try again'}
          </button>
          {error.digest ? (
            <p style={{ margin: '18px 0 0', fontSize: '12px', color: '#64748b' }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}

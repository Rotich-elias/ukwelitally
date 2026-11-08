'use client'

import { useEffect } from 'react'
import { isChunkLoadError, recoverFromChunkLoadError } from '@/lib/chunkRecovery'

/**
 * Error boundary for the pages.
 *
 * A chunk error is usually caused by a stale tab after a deployment, so it is
 * repaired by reloading automatically. Other errors keep the boundaries'
 * "try again" behaviour, which re-renders the failed segment without losing
 * the rest of the app.
 */
export default function Error({
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="glow-orb left-1/2 top-0 h-72 w-[32rem] -translate-x-1/2 bg-brand-600/20 animate-pulse-slow" />

      <div className="relative w-full max-w-lg">
        <div className="glass-effect rounded-3xl p-6 text-center shadow-soft sm:p-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-amber-400">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.5 13A1.5 1.5 0 004.14 19.5h15.72a1.5 1.5 0 001.3-2.56l-7.5-13a1.5 1.5 0 00-2.62 0z"
              />
            </svg>
          </div>

          <span className="badge-warning mt-5">
            {chunkError ? 'New version available' : 'Something went wrong'}
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {chunkError ? 'Reloading the latest version' : 'This page hit an error'}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-dark-400">
            {chunkError ? (
              <>
                The app was updated while this page was open. Reloading fetches the
                matching files. If it does not recover automatically, reload the page.
              </>
            ) : (
              <>
                The rest of the app is still available. Try this page again, or go back
                to your dashboard.
              </>
            )}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => {
                if (chunkError) {
                  void recoverFromChunkLoadError()
                  return
                }
                reset()
              }}
              className="btn-primary flex-1 py-3"
            >
              {chunkError ? 'Reload page' : 'Try again'}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn-secondary flex-1 py-3"
            >
              Reload
            </button>
          </div>

          {error.digest ? (
            <p className="mt-5 text-xs text-dark-500">Reference: {error.digest}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'

/**
 * An image that falls back to a placeholder when it cannot be loaded.
 *
 * A stored reference can point at a file that is no longer in storage (for
 * example an upload from before the storage backend was made durable). The
 * broken image is replaced with a neutral placeholder instead of leaving a
 * broken image icon on the page.
 */
interface SafeImageProps {
  src?: string | null
  alt: string
  className?: string
  /** Rendered instead of the generic person placeholder. */
  fallback?: React.ReactNode
}

export default function SafeImage({ src, alt, className = '', fallback }: SafeImageProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <>
        {fallback ?? (
          <div
            className={`${className} bg-dark-800 flex items-center justify-center overflow-hidden`}
            role="img"
            aria-label={`${alt} (no photo available)`}
          >
            <svg
              className="w-1/2 h-1/2 text-dark-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
        )}
      </>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

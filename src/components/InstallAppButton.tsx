'use client'

import { useEffect, useRef, useState } from 'react'
import { useInstallPrompt } from '@/lib/pwa'

/**
 * The "Install App" button.
 *
 * The button offers the install prompt of the browser when the browser has
 * one. The browser only hands that prompt over when the manifest, the
 * service worker and the secure origin are all in place, so the app never
 * promises an installation it cannot do. When there is no prompt, the button
 * explains how to install the app from the browser menu instead.
 *
 * The button disappears once the app is running as an installed app.
 */
interface InstallAppButtonProps {
  /** 'primary' for the landing page, 'compact' for the dashboard navigation. */
  variant?: 'primary' | 'compact'
  className?: string
  label?: string
}

function DownloadIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
      />
    </svg>
  )
}

export default function InstallAppButton({
  variant = 'primary',
  className = '',
  label = 'Install App',
}: InstallAppButtonProps) {
  const { availability, install, instructions } = useInstallPrompt()
  const [showInstructions, setShowInstructions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // The instructions close when the user clicks outside of them.
  useEffect(() => {
    if (!showInstructions) return

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowInstructions(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [showInstructions])

  // The app is already installed: there is nothing left to offer.
  if (availability === 'installed') return null

  const handleClick = async () => {
    const outcome = await install()

    // The browser had no prompt of its own, or the user closed it: explain
    // how to install the app from the browser menu.
    if (outcome === 'unavailable' || outcome === 'dismissed') {
      setShowInstructions((open) => !open)
    }
  }

  const compact = variant === 'compact'

  const buttonClass = compact
    ? 'flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 hover:border-blue-400 transition-colors'
    : 'btn-secondary flex items-center gap-2'

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        className={buttonClass}
        aria-label="Install UkweliTally on this device"
        title="Install UkweliTally on this device"
      >
        <DownloadIcon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        <span className={compact ? 'hidden sm:inline' : ''}>{label}</span>
      </button>

      {showInstructions && (
        <div
          className={`absolute z-50 mt-2 w-72 glass-effect rounded-lg shadow-lg border border-dark-700 p-4 text-left ${
            compact ? 'right-0' : 'left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0'
          }`}
          role="dialog"
          aria-label="How to install UkweliTally"
        >
          <p className="text-sm font-semibold text-white">{instructions.title}</p>
          <ol className="mt-2 space-y-1 text-xs text-dark-300 list-decimal list-inside">
            {instructions.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setShowInstructions(false)}
            className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}

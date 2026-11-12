'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Analytics consent banner.
 *
 * The only cookie the site needs to operate is the httpOnly session cookie used
 * to protect the dashboards, so no banner is shown by default. A banner is only
 * rendered when a third-party analytics ID is configured, and no analytics
 * script is loaded until the visitor explicitly accepts.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim()
const CONSENT_KEY = 'ukwelitally_analytics_consent'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!GA_ID) return
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true)
    } catch {
      // Storage may be blocked; the banner simply does not persist a choice.
      setVisible(true)
    }
  }, [])

  if (!GA_ID || !visible) return null

  const decide = (value: 'granted' | 'denied') => {
    try {
      localStorage.setItem(CONSENT_KEY, value)
    } catch {
      // Ignore storage failures; the choice still applies to this page view.
    }
    setVisible(false)
    window.dispatchEvent(new Event('ukwelitally:consent-change'))
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Analytics cookie consent"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/10 bg-dark-950/95 px-4 py-4 backdrop-blur-xl sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-dark-300 sm:max-w-2xl sm:text-sm">
          We use an essential session cookie to keep you signed in. With your
          permission we would also use privacy-friendly analytics to understand
          how the site is used. Nothing non-essential loads before you accept.
          Read our{' '}
          <Link href="/privacy" className="font-medium text-brand-300 underline-offset-2 hover:underline">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => decide('denied')} className="btn-secondary px-4 py-2.5 text-sm">
            Reject analytics
          </button>
          <button type="button" onClick={() => decide('granted')} className="btn-primary px-4 py-2.5 text-sm">
            Accept analytics
          </button>
        </div>
      </div>
    </div>
  )
}

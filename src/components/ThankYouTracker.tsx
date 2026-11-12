'use client'

import { useEffect } from 'react'

const CONSENT_KEY = 'ukwelitally_analytics_consent'

interface ThankYouTrackerProps {
  eventName: string
  params?: Record<string, unknown>
}

/**
 * Fires a GA4 conversion event when a thank-you page is reached, but only after
 * the visitor has accepted analytics. Keeping it separate from the page keeps
 * the success page a server component with its own metadata.
 */
export default function ThankYouTracker({ eventName, params }: ThankYouTrackerProps) {
  useEffect(() => {
    let allowed = false
    try {
      allowed = localStorage.getItem(CONSENT_KEY) === 'granted'
    } catch {
      allowed = false
    }
    if (!allowed) return

    const send = () => {
      window.gtag?.('event', eventName, params ?? {})
    }

    // If gtag is already available, send now; otherwise wait for the analytics
    // component to announce that the script has loaded.
    if (window.gtag) send()
    window.addEventListener('ukwelitally:analytics-ready', send)
    return () => window.removeEventListener('ukwelitally:analytics-ready', send)
  }, [eventName, params])

  return null
}

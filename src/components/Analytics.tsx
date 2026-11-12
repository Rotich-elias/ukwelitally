'use client'

import Script from 'next/script'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Consent-gated Google Analytics 4.
 *
 * Nothing is requested from Google until the visitor has accepted analytics in
 * the cookie banner. The measurement ID is supplied at build time through
 * NEXT_PUBLIC_GA_ID; without it this component renders nothing, so the site
 * never ships a broken or partial tracker.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim()
const CONSENT_KEY = 'ukwelitally_analytics_consent'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

function sendPageView(path: string) {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', 'page_view', { page_path: path })
}

export default function Analytics() {
  const pathname = usePathname()
  const consent = useRef(false)
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (!GA_ID) return

    const readConsent = () => {
      try {
        return localStorage.getItem(CONSENT_KEY) === 'granted'
      } catch {
        return false
      }
    }

    consent.current = readConsent()

    const onChange = () => {
      consent.current = readConsent()
      if (consent.current) sendPageView(window.location.pathname)
    }

    window.addEventListener('ukwelitally:consent-change', onChange)
    return () => window.removeEventListener('ukwelitally:consent-change', onChange)
  }, [])

  useEffect(() => {
    if (!GA_ID || !consent.current) return

    // The first page view is sent when the gtag script finishes loading; only
    // client-side navigations after that are tracked here.
    if (lastPath.current === null) {
      lastPath.current = pathname
      return
    }
    if (lastPath.current === pathname) return

    lastPath.current = pathname
    sendPageView(pathname)
  }, [pathname])

  if (!GA_ID) return null

  return (
    <>
      <Script
        id="ga-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
        onLoad={() => sendPageView(window.location.pathname)}
      />
      <Script
        id="ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { send_page_view: false });
            window.dispatchEvent(new Event('ukwelitally:analytics-ready'));
          `,
        }}
      />
    </>
  )
}

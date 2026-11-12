/**
 * Small helper for conversion events. It is safe to call from any client
 * component: events are dropped unless analytics is configured and the visitor
 * has explicitly granted consent.
 */
export const ANALYTICS_CONSENT_KEY = 'ukwelitally_analytics_consent'

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return

  try {
    if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== 'granted') return
  } catch {
    return
  }

  const target = window as Window & { gtag?: (...args: unknown[]) => void }
  target.gtag?.('event', name, params ?? {})
}

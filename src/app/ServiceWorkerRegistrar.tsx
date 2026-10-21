'use client'

import { useEffect } from 'react'
import { registerServiceWorker, watchInstallPrompt } from '@/lib/pwa'

/**
 * Registers the service worker once the app has mounted.
 *
 * Kept in a separate client component so the root layout can stay a server
 * component.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker()

    // The browser hands the install prompt over early, so it is watched from
    // the start: the button of the app can then show it whenever the user
    // asks for it.
    const stopWatching = watchInstallPrompt()

    return stopWatching
  }, [])

  return null
}

'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/pwa'

/**
 * Registers the service worker once the app has mounted.
 *
 * Kept in a separate client component so the root layout can stay a server
 * component.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker()
  }, [])

  return null
}

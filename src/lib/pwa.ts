'use client'

// PWA utilities for service worker registration and offline support

/**
 * Register the service worker that powers offline support.
 *
 * Registration is skipped during server rendering and when the browser does
 * not support service workers.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration)

        // Check for updates periodically
        setInterval(() => {
          registration.update()
        }, 60000) // Check every minute
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error)
      })
  })

  // Listen for service worker updates
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service Worker updated')
  })
}

/**
 * Unregister all service workers. Used when disabling offline support.
 */
export function unregisterServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.ready.then((registration) => {
    registration.unregister()
  })
}

/**
 * Check if the app is running in standalone mode (installed PWA).
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

/**
 * Prompt the user to install the PWA.
 *
 * The beforeinstallprompt event fires before the browser decides whether to
 * show its own install UI, so the event is captured here and the returned
 * handle is used to trigger the prompt on demand.
 */
export function promptInstall() {
  if (typeof window === 'undefined') {
    return { show: async () => false }
  }

  let deferredPrompt: any = null

  const onBeforeInstallPrompt = (e: Event) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault()
    deferredPrompt = e
    console.log('Install prompt available')
  }

  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

  return {
    /**
     * Trigger the install prompt. Returns whether the user accepted.
     */
    show: async () => {
      if (!deferredPrompt) return false

      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      console.log(`User response: ${outcome}`)
      deferredPrompt = null

      if (outcome === 'accepted') {
        window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      }

      return outcome === 'accepted'
    },
  }
}

/**
 * Track the browser's online/offline status.
 *
 * Hooks must be called unconditionally, so the initial state is safe for both
 * server rendering and the browser.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = React.useState(true)

  React.useEffect(() => {
    // Sync the initial value once mounted.
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      console.log('App is online')
    }

    const handleOffline = () => {
      setIsOnline(false)
      console.log('App is offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

/**
 * Queue a submission for background sync.
 *
 * The submission is stored in IndexedDB and a background sync tag is
 * registered so the service worker can flush it when connectivity returns.
 */
export async function queueSubmission(data: any) {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return false

  try {
    // Store submission in IndexedDB
    await saveToIndexedDB('pending-submissions', data)

    // Register background sync
    const registration = await navigator.serviceWorker.ready
    await (registration as any).sync.register('sync-submissions')

    console.log('Submission queued for sync')
    return true
  } catch (error) {
    console.error('Error queuing submission:', error)
    return false
  }
}

// IndexedDB helper functions
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('UkweliTally', 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('pending-submissions')) {
        db.createObjectStore('pending-submissions', { keyPath: 'id', autoIncrement: true })
      }
    }
  })
}

export async function saveToIndexedDB(storeName: string, data: any): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.add({ ...data, timestamp: Date.now() })

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getPendingSubmissions(): Promise<any[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending-submissions'], 'readonly')
    const store = transaction.objectStore('pending-submissions')
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

export async function clearPendingSubmission(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending-submissions'], 'readwrite')
    const store = transaction.objectStore('pending-submissions')
    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

import React from 'react'

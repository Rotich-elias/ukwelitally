// PWA utilities for service worker registration and offline support

export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
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
      // Optionally show a notification to the user
    })
  }
}

export function unregisterServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.unregister()
    })
  }
}

// Check if app is running in standalone mode (installed PWA)
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
}

// Prompt user to install PWA
export function promptInstall() {
  // This will be populated by the beforeinstallprompt event
  let deferredPrompt: any = null

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later
      deferredPrompt = e
      // Update UI to show install button
      console.log('Install prompt available')
    })

    return {
      show: async () => {
        if (!deferredPrompt) {
          return false
        }
        // Show the install prompt
        deferredPrompt.prompt()
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice
        console.log(`User response: ${outcome}`)
        // Clear the deferred prompt
        deferredPrompt = null
        return outcome === 'accepted'
      },
    }
  }

  return { show: async () => false }
}

// Check online/offline status
export function useOnlineStatus() {
  if (typeof window === 'undefined') return true

  const [isOnline, setIsOnline] = React.useState(navigator.onLine)

  React.useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      console.log('App is online')
    }

    function handleOffline() {
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

// Queue a submission for background sync
export async function queueSubmission(data: any) {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
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
  return false
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

// React is needed for the hook
import React from 'react'

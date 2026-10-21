'use client'

import React from 'react'

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
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as any).standalone === true
  )
}

/* -------------------------------------------------------------------------- */
/*                            Installing the app                               */
/* -------------------------------------------------------------------------- */

/**
 * What happened when the user asked to install the app.
 */
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'installed'

/**
 * What the app can offer the user.
 *
 * - `installed`: the app is already running as an installed app
 * - `native`: the browser offered its own install prompt
 * - `instructions`: the user has to install the app from the browser menu
 */
export type InstallAvailability = 'installed' | 'native' | 'instructions'

export interface InstallEnvironment {
  /** The app runs as an installed app. */
  standalone: boolean
  /** The browser knows the install prompt. */
  supportsPrompt: boolean
  /** The page is on a secure origin, which an installation needs. */
  secure: boolean
  userAgent: string
}

export interface InstallInstructions {
  title: string
  steps: string[]
}

/**
 * The prompt the browser offered, kept until the user asks for it.
 */
let deferredPrompt: any = null

/**
 * The app was installed. The browser does not say so again, so it is kept.
 */
let appInstalled = false

/**
 * The parts of the app that want to know when the install state changes.
 */
const installSubscribers = new Set<(state: { canPrompt: boolean; installed: boolean }) => void>()

function notifyInstallSubscribers() {
  const state = { canPrompt: Boolean(deferredPrompt), installed: appInstalled }
  installSubscribers.forEach((subscriber) => subscriber(state))
}

/**
 * Listen for the install prompt of the browser and keep it.
 *
 * The browser fires the event before it decides to show its own prompt, so
 * the event is held back here and shown when the user asks for it. The
 * listener is attached once, when the app starts, so the prompt is captured
 * even when the user only clicks the button later.
 */
export function watchInstallPrompt(): () => void {
  if (typeof window === 'undefined') return () => {}

  const onBeforeInstallPrompt = (event: Event) => {
    // Hold back the mini-infobar of the browser: the app shows its own button.
    event.preventDefault()
    deferredPrompt = event
    notifyInstallSubscribers()
  }

  const onAppInstalled = () => {
    deferredPrompt = null
    appInstalled = true
    notifyInstallSubscribers()
  }

  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)

  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', onAppInstalled)
  }
}

/**
 * Follow the install state of the browser.
 */
export function subscribeInstallState(
  subscriber: (state: { canPrompt: boolean; installed: boolean }) => void
): () => void {
  installSubscribers.add(subscriber)
  subscriber({ canPrompt: Boolean(deferredPrompt), installed: appInstalled })

  return () => {
    installSubscribers.delete(subscriber)
  }
}

/**
 * What the browser supports right now.
 *
 * The browser decides whether the app can be installed: it only fires the
 * install prompt when the manifest, the service worker and the secure origin
 * are all in place. The app therefore never claims to be installable on its
 * own, it only offers the prompt the browser hands over.
 */
export function detectInstallEnvironment(): InstallEnvironment {
  if (typeof window === 'undefined') {
    return { standalone: false, supportsPrompt: false, secure: false, userAgent: '' }
  }

  return {
    standalone: isStandalone(),
    supportsPrompt: 'onbeforeinstallprompt' in window,
    secure: window.isSecureContext !== false,
    userAgent: navigator.userAgent || '',
  }
}

/**
 * Is this an iPhone, an iPad or an iPod?
 */
export function isIosUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent)
}

/**
 * Is this an Android device?
 */
export function isAndroidUserAgent(userAgent: string): boolean {
  return /Android/i.test(userAgent)
}

/**
 * Is this Safari?
 *
 * The Chromium browsers carry Safari in their user agent too, so their own
 * token has to be absent.
 */
export function isSafariUserAgent(userAgent: string): boolean {
  return (
    /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|Android|OPR/i.test(userAgent)
  )
}

/**
 * Is this Firefox?
 */
export function isFirefoxUserAgent(userAgent: string): boolean {
  return /Firefox/i.test(userAgent) && !/Seamonkey/i.test(userAgent)
}

/**
 * What the app can offer, from what the browser says.
 */
export function resolveInstallAvailability(environment: {
  standalone: boolean
  canPrompt: boolean
}): InstallAvailability {
  if (environment.standalone) return 'installed'
  if (environment.canPrompt) return 'native'
  return 'instructions'
}

/**
 * How to install the app when the browser cannot show its own prompt.
 */
export function getInstallInstructions(environment: InstallEnvironment): InstallInstructions {
  const { userAgent, secure } = environment

  if (!secure) {
    return {
      title: 'Installation needs a secure address',
      steps: [
        'Open UkweliTally over an https:// address.',
        'A browser only installs an app from a secure origin.',
      ],
    }
  }

  if (isIosUserAgent(userAgent)) {
    return {
      title: 'Add UkweliTally to your home screen',
      steps: [
        'Tap the Share button, the square with an arrow.',
        'Choose "Add to Home Screen".',
        'Tap "Add" to install UkweliTally.',
      ],
    }
  }

  if (isAndroidUserAgent(userAgent)) {
    return {
      title: 'Install UkweliTally',
      steps: [
        'Open the browser menu, the three dots.',
        'Choose "Install app" or "Add to Home screen".',
        'Confirm the installation.',
      ],
    }
  }

  if (isSafariUserAgent(userAgent)) {
    return {
      title: 'Add UkweliTally to your Dock',
      steps: [
        'Open the File menu of Safari.',
        'Choose "Add to Dock...".',
        'Confirm the installation.',
      ],
    }
  }

  if (isFirefoxUserAgent(userAgent)) {
    return {
      title: 'Firefox does not install web apps',
      steps: [
        'Open UkweliTally in Chrome or Edge on a computer, or in a browser on Android.',
        'Use the browser menu to install the app.',
      ],
    }
  }

  return {
    title: 'Install UkweliTally',
    steps: [
      'Open the browser menu.',
      'Choose "Install UkweliTally", "Install app" or "Add to Home screen".',
      'Confirm the installation.',
    ],
  }
}

/**
 * Show the install prompt of the browser.
 *
 * The prompt is only shown when the browser offered one, which it only does
 * when the app can really be installed. The result says what happened.
 */
export async function promptInstall(): Promise<InstallOutcome> {
  if (typeof window === 'undefined') return 'unavailable'
  if (isStandalone()) return 'installed'
  if (!deferredPrompt) return 'unavailable'

  try {
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    const outcome: InstallOutcome = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed'

    deferredPrompt = null
    notifyInstallSubscribers()

    return outcome
  } catch (error) {
    console.error('The install prompt could not be shown:', error)
    deferredPrompt = null
    notifyInstallSubscribers()

    return 'unavailable'
  }
}

/**
 * The install state of the app, for the components that offer the install.
 */
export function useInstallPrompt() {
  const [state, setState] = React.useState({ canPrompt: false, installed: false })
  const [environment, setEnvironment] = React.useState<InstallEnvironment>({
    standalone: false,
    supportsPrompt: false,
    secure: false,
    userAgent: '',
  })

  React.useEffect(() => {
    setEnvironment(detectInstallEnvironment())
    return subscribeInstallState(setState)
  }, [])

  const installed = environment.standalone || state.installed
  const availability = resolveInstallAvailability({
    standalone: installed,
    canPrompt: state.canPrompt,
  })

  const instructions = React.useMemo(
    () => getInstallInstructions(environment),
    [environment]
  )

  return {
    availability,
    canPrompt: state.canPrompt,
    installed,
    install: promptInstall,
    instructions,
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

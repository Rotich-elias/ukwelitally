import { describe, it, expect } from 'vitest'
import {
  detectInstallEnvironment,
  getInstallInstructions,
  isAndroidUserAgent,
  isFirefoxUserAgent,
  isIosUserAgent,
  isSafariUserAgent,
  isStandalone,
  resolveInstallAvailability,
  type InstallEnvironment,
} from '@/lib/pwa'

/**
 * The install button.
 *
 * The app may only offer the install prompt of the browser when the browser
 * hands it over: the browser only does that when the manifest, the service
 * worker and the secure origin are in place. Everywhere else the button has
 * to explain how to install the app from the browser menu, for the browser
 * the user is on.
 */

const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'

function environment(overrides: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return {
    standalone: false,
    supportsPrompt: false,
    secure: true,
    userAgent: CHROME_MAC,
    ...overrides,
  }
}

describe('the browser of the user', () => {
  it('tells an iPhone from the other phones', () => {
    expect(isIosUserAgent(IOS)).toBe(true)
    expect(isIosUserAgent(ANDROID)).toBe(false)
    expect(isIosUserAgent(CHROME_MAC)).toBe(false)
  })

  it('tells an Android phone from the other phones', () => {
    expect(isAndroidUserAgent(ANDROID)).toBe(true)
    expect(isAndroidUserAgent(IOS)).toBe(false)
  })

  it('tells Safari from the Chromium browsers that carry its name', () => {
    expect(isSafariUserAgent(SAFARI_MAC)).toBe(true)
    expect(isSafariUserAgent(CHROME_MAC)).toBe(false)
    expect(isSafariUserAgent(ANDROID)).toBe(false)
  })

  it('tells Firefox from the other browsers', () => {
    expect(isFirefoxUserAgent(FIREFOX)).toBe(true)
    expect(isFirefoxUserAgent(CHROME_MAC)).toBe(false)
  })
})

describe('what the app can offer', () => {
  it('offers nothing when the app is already installed', () => {
    expect(resolveInstallAvailability({ standalone: true, canPrompt: false })).toBe('installed')
    expect(resolveInstallAvailability({ standalone: true, canPrompt: true })).toBe('installed')
  })

  it('offers the prompt of the browser when the browser handed one over', () => {
    expect(resolveInstallAvailability({ standalone: false, canPrompt: true })).toBe('native')
  })

  it('offers the instructions of the browser menu when there is no prompt', () => {
    expect(resolveInstallAvailability({ standalone: false, canPrompt: false })).toBe('instructions')
  })
})

describe('the instructions of the browser menu', () => {
  it('says that a secure address is needed when the page is not secure', () => {
    const instructions = getInstallInstructions(environment({ secure: false }))

    expect(instructions.title).toContain('secure')
    expect(instructions.steps.join(' ')).toContain('https://')
  })

  it('asks an iPhone to add the app to the home screen', () => {
    const instructions = getInstallInstructions(environment({ userAgent: IOS }))

    expect(instructions.title).toContain('home screen')
    expect(instructions.steps.join(' ')).toContain('Add to Home Screen')
  })

  it('asks an Android phone to use the browser menu', () => {
    const instructions = getInstallInstructions(environment({ userAgent: ANDROID }))

    expect(instructions.steps.join(' ')).toContain('browser menu')
  })

  it('asks Safari on a computer to add the app to the Dock', () => {
    const instructions = getInstallInstructions(environment({ userAgent: SAFARI_MAC }))

    expect(instructions.title).toContain('Dock')
    expect(instructions.steps.join(' ')).toContain('Add to Dock')
  })

  it('tells Firefox that it cannot install a web app', () => {
    const instructions = getInstallInstructions(environment({ userAgent: FIREFOX }))

    expect(instructions.title).toContain('Firefox')
    expect(instructions.steps.join(' ')).toContain('Chrome or Edge')
  })

  it('falls back on the menu of the browser', () => {
    const instructions = getInstallInstructions(environment({ userAgent: CHROME_MAC }))

    expect(instructions.title).toBe('Install UkweliTally')
    expect(instructions.steps[0]).toContain('browser menu')
  })
})

describe('the app on the server', () => {
  it('reports nothing installed while the page is rendered on the server', () => {
    expect(isStandalone()).toBe(false)

    const environment = detectInstallEnvironment()
    expect(environment.standalone).toBe(false)
    expect(environment.supportsPrompt).toBe(false)
    expect(environment.secure).toBe(false)
    expect(environment.userAgent).toBe('')
  })
})

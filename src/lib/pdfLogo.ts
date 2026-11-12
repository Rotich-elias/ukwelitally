import type { jsPDF } from 'jspdf'
import { BRAND } from './branding'

/**
 * The brand emblem for generated PDFs (the election report and the training
 * guides), so every exported document carries the same logo.
 */

/** Alias under which the emblem is embedded; jsPDF stores it once per file. */
const LOGO_ALIAS = 'ukwelitally-logo'

/** Reads the brand emblem as a data URL so it can be embedded in a PDF. */
export async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(BRAND.logoUrl, { cache: 'force-cache' })
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    return `data:image/png;base64,${btoa(binary)}`
  } catch {
    // A missing logo must never stop a document from being produced.
    return null
  }
}

/**
 * Draws the emblem as a square of `size` mm with its top-left corner at
 * (x, y). Does nothing without a logo, so documents still render offline.
 */
export function drawLogo(doc: jsPDF, logo: string | null, x: number, y: number, size: number) {
  if (!logo) return
  doc.addImage(logo, 'PNG', x, y, size, size, LOGO_ALIAS)
}

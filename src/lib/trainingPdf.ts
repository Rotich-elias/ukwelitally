import { jsPDF } from 'jspdf'
import { BRAND, brandWebsiteLabel } from './branding'
import { drawLogo, loadLogoDataUrl } from './pdfLogo'
import { getTrainingGuide, TRAINING_SUPPORT, type TrainingGuide } from './trainingGuides'

/**
 * Branded training guide PDF.
 *
 * Loaded through dynamic import from the dashboard so the PDF library is only
 * downloaded when someone actually asks for a guide.
 */

const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN = 16
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const FOOTER_Y = 286

const COLORS = {
  navy: '#0f172a',
  slate: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  panel: '#f8fafc',
  blue: '#1d4ed8',
  cyan: '#0891b2',
  emerald: '#047857',
  amber: '#b45309',
  white: '#ffffff',
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function setFill(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setFillColor(r, g, b)
}

function setText(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setTextColor(r, g, b)
}

function setDraw(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setDrawColor(r, g, b)
}

/** A soft gradient band built from thin strips, matching the result report. */
function drawGradientBand(doc: jsPDF, y: number, height: number, strips = 60) {
  const step = PAGE_WIDTH / strips
  const from = hexToRgb(COLORS.navy)
  const to = hexToRgb(COLORS.cyan)

  for (let i = 0; i < strips; i += 1) {
    const ratio = strips === 1 ? 0 : i / (strips - 1)
    const blend = (a: number, b: number) => Math.round(a + (b - a) * ratio)
    doc.setFillColor(blend(from[0], to[0]), blend(from[1], to[1]), blend(from[2], to[2]))
    doc.rect(i * step, y, step + 0.1, height, 'F')
  }
}

function drawFooter(doc: jsPDF, page: number, total: number, logo: string | null) {
  setDraw(doc, COLORS.line)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, FOOTER_Y - 5, PAGE_WIDTH - MARGIN, FOOTER_Y - 5)

  // A small emblem on every page, so a single printed page still shows where
  // it came from.
  const footerLogo = 5
  drawLogo(doc, logo, MARGIN, FOOTER_Y - 3.6, footerLogo)
  const textX = logo ? MARGIN + footerLogo + 2 : MARGIN

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setText(doc, COLORS.muted)
  doc.text(
    `${BRAND.name} training guide · ${brandWebsiteLabel()} · Powered by ${BRAND.poweredBy.name}`,
    textX,
    FOOTER_Y
  )
  doc.text(`Page ${page} of ${total}`, PAGE_WIDTH - MARGIN, FOOTER_Y, { align: 'right' })
}

interface RenderState {
  doc: jsPDF
  y: number
  page: number
}

function newPage(state: RenderState) {
  state.doc.addPage()
  state.page += 1
  state.y = MARGIN
}

function ensureSpace(state: RenderState, needed: number) {
  if (state.y + needed > FOOTER_Y - 12) {
    newPage(state)
  }
}

function wrappedLines(doc: jsPDF, text: string, width: number, size: number): string[] {
  doc.setFontSize(size)
  return doc.splitTextToSize(text, width) as string[]
}

export function renderGuide(guide: TrainingGuide, logo: string | null = null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const state: RenderState = { doc, y: 0, page: 1 }

  doc.setProperties({
    title: guide.title,
    subject: `${BRAND.name} training guide for ${guide.audience}`,
    author: BRAND.name,
    creator: `${BRAND.name} (${BRAND.website})`,
  })

  /* ------------------------------------------------------------ cover band */
  drawGradientBand(doc, 0, 46)

  // The emblem sits on the left of the band, vertically centred, with the
  // wordmark and title beside it.
  const coverLogo = 30
  drawLogo(doc, logo, MARGIN, (46 - coverLogo) / 2, coverLogo)
  const textX = logo ? MARGIN + coverLogo + 6 : MARGIN

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setText(doc, COLORS.white)
  doc.text(BRAND.name, textX, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(BRAND.tagline.toUpperCase(), textX, 24)
  doc.text(`${BRAND.election} · ${brandWebsiteLabel()}`, textX, 29)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.text(guide.title, textX, 39)

  state.y = 56

  /* ---------------------------------------------------------- introduction */
  setFill(doc, COLORS.panel)
  setDraw(doc, COLORS.line)
  doc.roundedRect(MARGIN, state.y - 6, CONTENT_WIDTH, 24, 2.5, 2.5, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setText(doc, COLORS.navy)
  doc.text(`For ${guide.audience}`, MARGIN + 4, state.y + 1)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.8)
  setText(doc, COLORS.slate)
  const summaryLines = wrappedLines(doc, guide.summary, CONTENT_WIDTH - 8, 8.8)
  doc.text(summaryLines, MARGIN + 4, state.y + 6.5)
  doc.setFontSize(8)
  setText(doc, COLORS.muted)
  doc.text(
    `Estimated reading time: ${guide.estimatedMinutes} minutes · Print or keep this PDF for reference`,
    MARGIN + 4,
    state.y + 6.5 + summaryLines.length * 4
  )
  state.y += 25

  /* ------------------------------------------------------------- sections */
  for (const [index, section] of guide.sections.entries()) {
    ensureSpace(state, 24)

    // Section number chip and heading.
    setFill(doc, index % 2 === 0 ? COLORS.blue : COLORS.cyan)
    doc.roundedRect(MARGIN, state.y - 4.5, 6.5, 6.5, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    setText(doc, COLORS.white)
    doc.text(String(index + 1), MARGIN + 3.25, state.y + 0.2, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    setText(doc, COLORS.navy)
    const headingLines = wrappedLines(doc, section.heading.replace(/^\d+\.\s*/, ''), CONTENT_WIDTH - 10, 11.5)
    doc.text(headingLines, MARGIN + 9, state.y)
    state.y += headingLines.length * 5.2 + 1.5

    if (section.body) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      setText(doc, COLORS.slate)
      const lines = wrappedLines(doc, section.body, CONTENT_WIDTH - 2, 9)
      for (const line of lines) {
        ensureSpace(state, 5.5)
        doc.text(line, MARGIN, state.y)
        state.y += 4.4
      }
      state.y += 1.5
    }

    if (section.steps?.length) {
      for (const [stepIndex, step] of section.steps.entries()) {
        ensureSpace(state, 8)
        const label = `${stepIndex + 1}.`
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.6)
        setText(doc, COLORS.blue)
        doc.text(label, MARGIN + 1, state.y)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.8)
        setText(doc, COLORS.slate)
        const lines = wrappedLines(doc, step, CONTENT_WIDTH - 10, 8.8)
        for (const line of lines) {
          ensureSpace(state, 5.5)
          doc.text(line, MARGIN + 7, state.y)
          state.y += 4.3
        }
        state.y += 0.8
      }
    }

    if (section.tips?.length) {
      ensureSpace(state, 10)
      const tipText = section.tips.join(' ')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.4)
      const lines = wrappedLines(doc, tipText, CONTENT_WIDTH - 8, 8.4)
      const boxHeight = lines.length * 4 + 6

      ensureSpace(state, boxHeight + 2)
      setFill(doc, '#fffbeb')
      setDraw(doc, '#fcd34d')
      doc.roundedRect(MARGIN, state.y - 3, CONTENT_WIDTH, boxHeight, 2, 2, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      setText(doc, COLORS.amber)
      doc.text('TIP', MARGIN + 3, state.y + 0.5)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.4)
      setText(doc, '#78350f')
      doc.text(lines, MARGIN + 4, state.y + 4.5)
      state.y += boxHeight + 2
    }

    state.y += 2.5
  }

  /* ------------------------------------------------------------ checklist */
  ensureSpace(state, 38)
  setFill(doc, COLORS.panel)
  setDraw(doc, COLORS.line)
  doc.roundedRect(MARGIN, state.y - 4, CONTENT_WIDTH, 12, 2.5, 2.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setText(doc, COLORS.navy)
  doc.text('Before you finish', MARGIN + 4, state.y + 4)
  state.y += 14

  for (const item of guide.checklist) {
    ensureSpace(state, 7)
    doc.rect(MARGIN + 1, state.y - 2.8, 3.4, 3.4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.8)
    setText(doc, COLORS.slate)
    const lines = wrappedLines(doc, item, CONTENT_WIDTH - 9, 8.8)
    for (const line of lines) {
      ensureSpace(state, 5.5)
      doc.text(line, MARGIN + 7, state.y)
      state.y += 4.3
    }
    state.y += 0.6
  }

  /* --------------------------------------------------------------- support */
  ensureSpace(state, 20)
  state.y += 3
  setFill(doc, '#ecfdf5')
  setDraw(doc, '#6ee7b7')
  doc.roundedRect(MARGIN, state.y - 4, CONTENT_WIDTH, 16, 2.5, 2.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setText(doc, COLORS.emerald)
  doc.text('Need help?', MARGIN + 4, state.y + 2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setText(doc, '#065f46')
  doc.text(TRAINING_SUPPORT, MARGIN + 4, state.y + 7)
  doc.text(
    `Keep this guide and your account details safe. Never share your password.`,
    MARGIN + 4,
    state.y + 11
  )

  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    drawFooter(doc, page, total, logo)
  }

  return doc
}

export function trainingFileName(role: string): string {
  const guide = getTrainingGuide(role)
  const date = new Date().toISOString().split('T')[0]
  return `UkweliTally-${guide.role}-training-${date}.pdf`
}

/** Build and download the guide for a role, with the brand emblem. */
export async function downloadTrainingGuide(role: string): Promise<void> {
  const guide = getTrainingGuide(role)
  const logo = await loadLogoDataUrl()
  const doc = renderGuide(guide, logo)
  doc.save(trainingFileName(guide.role))
}

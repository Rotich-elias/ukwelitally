import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BRAND, brandWebsiteLabel } from './branding'

export interface ReportProfile {
  full_name: string
  party_name: string
  position: string
  electoral_area: string
}

export interface ReportSummary {
  total_votes_cast: number
  registered_voters: number
  rejected_votes: number
  turnout_percentage: number
  total_stations: number
  stations_reported: number
  reporting_percentage: number
  /** Stations whose result came from an agent primary submission. */
  agent_primary_results?: number
  /** Stations whose result came from a candidate approved observer fallback. */
  observer_fallback_results?: number
}

export interface ReportResult {
  candidate_name: string
  party_name: string
  total_votes: number
  percentage: number
}

export interface ElectionReportData {
  profile: ReportProfile
  summary: ReportSummary
  results: ReportResult[]
}

/* ------------------------------------------------------------------ layout */

const PAGE_WIDTH = 210
const MARGIN = 15
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const LETTERHEAD_HEIGHT = 38
const CONTINUATION_HEADER_HEIGHT = 12
/** Space reserved at the top of every page the results table flows onto. */
const TABLE_MARGIN = { top: 18, bottom: 20, left: MARGIN, right: MARGIN }
const FOOTER_Y = 289

const COLORS = {
  navy: '#0f172a',
  slate: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  panel: '#f8fafc',
  blue: '#3b82f6',
  deepBlue: '#1e3a8a',
  purple: '#8b5cf6',
  emerald: '#059669',
  gold: '#b45309',
  silver: '#64748b',
  bronze: '#c2410c',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
}

/* ----------------------------------------------------------------- helpers */

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function mix(from: string, to: string, ratio: number): [number, number, number] {
  const [r1, g1, b1] = hexToRgb(from)
  const [r2, g2, b2] = hexToRgb(to)
  const blend = (a: number, b: number) => Math.round(a + (b - a) * ratio)
  return [blend(r1, r2), blend(g1, g2), blend(b1, b2)]
}

/** Draws a horizontal gradient band by stacking thin filled rectangles. */
function drawGradientBand(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  from: string,
  to: string,
  strips = 72
) {
  const step = width / strips
  for (let i = 0; i < strips; i += 1) {
    const ratio = strips === 1 ? 0 : i / (strips - 1)
    const [r, g, b] = mix(from, to, ratio)
    doc.setFillColor(r, g, b)
    doc.rect(x + i * step, y, step + 0.1, height, 'F')
  }
}

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString('en-KE')
}

function formatPercent(value: number): string {
  return `${Number(value || 0).toFixed(1)}%`
}

function slugify(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const POSITION_LABELS: Record<string, string> = {
  president: 'President',
  governor: 'Governor',
  senator: 'Senator',
  women_rep: 'Women Representative',
  mp: 'Member of Parliament',
  mca: 'Member of County Assembly',
}

/** Turns a stored position code into a readable label for the report. */
export function positionLabel(position: string): string {
  const known = POSITION_LABELS[position]
  if (known) return known
  return position
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word, index) =>
      index > 0 && ['of', 'the', 'and'].includes(word.toLowerCase())
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ')
}

/** Human readable reference printed on the report, e.g. UKW-MP-20261021-KIRINYAGA. */
function reportReference(profile: ReportProfile): string {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const position = slugify(profile.position).toUpperCase().slice(0, 10)
  const area = slugify(profile.electoral_area).split('_')[0].toUpperCase().slice(0, 12)
  return `UKW-${position}-${date}-${area}`
}

/** Reads the brand emblem so it can be embedded in the PDF letterhead. */
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
    // A missing logo must never stop the report from being produced.
    return null
  }
}

/* --------------------------------------------------------------- letterhead */

/** Full brand letterhead: emblem, wordmark, tagline and contact details. */
function drawLetterhead(doc: jsPDF, logo: string | null) {
  drawGradientBand(doc, 0, 0, PAGE_WIDTH, LETTERHEAD_HEIGHT, COLORS.deepBlue, COLORS.purple)

  const logoSize = 24
  const logoX = MARGIN
  const logoY = (LETTERHEAD_HEIGHT - logoSize) / 2
  if (logo) {
    doc.addImage(logo, 'PNG', logoX, logoY, logoSize, logoSize, 'ukwelitally-logo')
  }

  const textX = logo ? logoX + logoSize + 6 : logoX
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(23)
  doc.text(BRAND.name, textX, 21)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#dbeafe')
  doc.text(BRAND.tagline, textX, 27.5)

  // Right hand contact block.
  doc.setFontSize(8.5)
  doc.setTextColor('#e0e7ff')
  doc.setFont('helvetica', 'bold')
  doc.text(BRAND.election, PAGE_WIDTH - MARGIN, 12.5, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor('#ffffff')
  doc.text(BRAND.email, PAGE_WIDTH - MARGIN, 18, { align: 'right' })
  doc.text(`WhatsApp: ${BRAND.phone}`, PAGE_WIDTH - MARGIN, 23, { align: 'right' })
  doc.text(brandWebsiteLabel(), PAGE_WIDTH - MARGIN, 28, { align: 'right' })

  // Accent strip under the band.
  doc.setFillColor('#10b981')
  doc.rect(0, LETTERHEAD_HEIGHT, PAGE_WIDTH, 1.2, 'F')
}

/** Slim brand bar repeated at the top of continuation pages. */
function drawContinuationHeader(doc: jsPDF) {
  drawGradientBand(doc, 0, 0, PAGE_WIDTH, CONTINUATION_HEADER_HEIGHT, COLORS.deepBlue, COLORS.purple, 36)
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(`${BRAND.name} — Election Results Report`, MARGIN, 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor('#e0e7ff')
  doc.text(BRAND.tagline, PAGE_WIDTH - MARGIN, 8, { align: 'right' })
}

/* ---------------------------------------------------------------- sections */

/** Draws a section title with its accent bar and returns the next free y. */
function drawSectionHeading(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(COLORS.blue)
  doc.rect(MARGIN, y - 3.6, 1.4, 4.8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(COLORS.navy)
  doc.text(title, MARGIN + 3.6, y)

  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y + 2.6, PAGE_WIDTH - MARGIN, y + 2.6)
  return y + 8
}

interface CandidateField {
  label: string
  value: string
}

/** Shortens text with an ellipsis until it fits the given width. */
function truncateToWidth(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}

/** Bordered panel listing the candidate the report was generated for. */
function drawCandidatePanel(doc: jsPDF, fields: CandidateField[], y: number): number {
  const columnWidth = CONTENT_WIDTH / 2
  const padding = 4
  const valueSize = 10
  const maxLines = 2

  // Wrap the values first so the panel can grow to fit them.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(valueSize)
  const wrapped = fields.map((field) => {
    const lines = doc.splitTextToSize(field.value || '-', columnWidth - padding * 2) as string[]
    if (lines.length <= maxLines) return lines
    const clipped = lines.slice(0, maxLines)
    clipped[maxLines - 1] = truncateToWidth(doc, clipped[maxLines - 1], columnWidth - padding * 2)
    return clipped
  })

  const rowHeights = [0, 1].map((row) => {
    const tallest = Math.max(
      ...wrapped.slice(row * 2, row * 2 + 2).map((lines) => 10.2 + (lines.length - 1) * 4.3)
    )
    return tallest + 2.5
  })
  const panelHeight = rowHeights[0] + rowHeights[1]

  doc.setFillColor(COLORS.panel)
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.3)
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, panelHeight, 1.5, 1.5, 'FD')

  fields.forEach((field, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const cellX = MARGIN + column * columnWidth
    const rowY = y + (row === 0 ? 0 : rowHeights[0])

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(COLORS.muted)
    doc.text(field.label.toUpperCase(), cellX + padding, rowY + 5.4)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(valueSize)
    doc.setTextColor(COLORS.navy)
    wrapped[index].forEach((line, lineIndex) => {
      doc.text(line, cellX + padding, rowY + 10.2 + lineIndex * 4.3)
    })
  })

  return y + panelHeight
}

interface StatCard {
  label: string
  value: string
  sub: string
  accent: string
}

/** Renders the summary statistics as a grid of cards. */
function drawStatCards(doc: jsPDF, cards: StatCard[], y: number, columns = 4): number {
  const gap = 4
  const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns
  const cardHeight = 24
  const rowHeight = cardHeight + 4

  cards.forEach((card, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const cardX = MARGIN + column * (cardWidth + gap)
    const cardY = y + row * rowHeight

    doc.setFillColor(COLORS.panel)
    doc.setDrawColor(COLORS.line)
    doc.setLineWidth(0.3)
    doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 1.5, 1.5, 'FD')

    doc.setFillColor(card.accent)
    doc.rect(cardX, cardY, cardWidth, 0.9, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(COLORS.muted)
    doc.text(card.label.toUpperCase(), cardX + 3, cardY + 7.6)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(COLORS.navy)
    doc.text(card.value, cardX + 3, cardY + 15.4)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(COLORS.muted)
    doc.text(card.sub, cardX + 3, cardY + 20.4)
  })

  return y + Math.ceil(cards.length / columns) * rowHeight
}

/* ------------------------------------------------------------------- table */

function drawResultsTable(doc: jsPDF, results: ReportResult[], startY: number) {
  const body = results.map((result, index) => [
    String(index + 1),
    result.candidate_name,
    result.party_name,
    formatNumber(result.total_votes),
    `${Number(result.percentage || 0).toFixed(2)}%`,
  ])

  autoTable(doc, {
    startY,
    margin: TABLE_MARGIN,
    head: [['#', 'Candidate Name', 'Party', 'Votes', 'Share']],
    body,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 2.2,
      textColor: COLORS.slate,
      lineColor: COLORS.line,
      lineWidth: 0.2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: COLORS.deepBlue,
      textColor: '#ffffff',
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 2.4,
    },
    alternateRowStyles: { fillColor: COLORS.panel },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 64, fontStyle: 'bold', textColor: COLORS.navy },
      2: { cellWidth: 44 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 36, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return
      const rank = data.row.index
      const colour = rank === 0 ? COLORS.gold : rank === 1 ? COLORS.silver : rank === 2 ? COLORS.bronze : COLORS.muted
      data.cell.styles.textColor = colour
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 4) return
      const percentage = Math.max(0, Math.min(100, Number(results[data.row.index]?.percentage || 0)))
      const barX = data.cell.x + 2
      const barWidth = data.cell.width - 4
      const barY = data.cell.y + data.cell.height - 2.4
      doc.setFillColor(COLORS.line)
      doc.rect(barX, barY, barWidth, 1, 'F')
      doc.setFillColor(COLORS.blue)
      doc.rect(barX, barY, (barWidth * percentage) / 100, 1, 'F')
    },
    // Keep a candidate on a single page instead of splitting the row.
    rowPageBreak: 'avoid',
    willDrawPage: (data) => {
      if (data.pageNumber > 1) drawContinuationHeader(doc)
    },
  })
}

/* ------------------------------------------------------------------ footer */

/** Footer applied to every page once the document is complete. */
function drawFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(COLORS.line)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, FOOTER_Y - 4, PAGE_WIDTH - MARGIN, FOOTER_Y - 4)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(COLORS.muted)
    doc.text(
      `${BRAND.name} — ${BRAND.tagline}  |  ${BRAND.email}  |  WhatsApp: ${BRAND.phone}`,
      MARGIN,
      FOOTER_Y
    )
    doc.text(`Page ${page} of ${total}`, PAGE_WIDTH - MARGIN, FOOTER_Y, { align: 'right' })
  }
}

/* ------------------------------------------------------------------ report */

/** Builds the election results report as a PDF document. */
export async function buildElectionReportPdf(data: ElectionReportData): Promise<jsPDF> {
  const { profile, summary, results } = data
  const logo = await loadLogoDataUrl()

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const reportDate = new Date().toLocaleString('en-KE', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'Africa/Nairobi',
  })
  const totalValidVotes = results.reduce((sum, result) => sum + (result.total_votes || 0), 0)
  const pendingStations = Math.max(0, (summary.total_stations || 0) - (summary.stations_reported || 0))
  const position = positionLabel(profile.position)

  doc.setProperties({
    title: `Election Results Report — ${position}`,
    subject: `${position} — ${profile.electoral_area}`,
    author: BRAND.name,
    creator: `${BRAND.name} (${BRAND.website})`,
  })

  drawLetterhead(doc, logo)

  // Title block.
  let y = LETTERHEAD_HEIGHT + 12
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(COLORS.navy)
  doc.text('ELECTION RESULTS REPORT', MARGIN, y)

  // "Official use only" chip.
  doc.setFillColor(COLORS.dangerSoft)
  doc.setDrawColor('#fecaca')
  doc.setLineWidth(0.3)
  doc.roundedRect(PAGE_WIDTH - MARGIN - 42, y - 6.5, 42, 8, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(COLORS.danger)
  doc.text('OFFICIAL USE ONLY', PAGE_WIDTH - MARGIN - 21, y - 1.4, { align: 'center' })

  // Subtitle: position and electoral area.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(COLORS.deepBlue)
  const subtitleLines = doc.splitTextToSize(
    `${position} — ${profile.electoral_area}`,
    CONTENT_WIDTH
  ) as string[]
  subtitleLines.forEach((line, index) => {
    doc.text(line, MARGIN, y + 7.5 + index * 5.5)
  })

  // Generation details.
  y += 7.5 + (subtitleLines.length - 1) * 5.5 + 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(COLORS.muted)
  doc.text(`Generated: ${reportDate}`, PAGE_WIDTH - MARGIN, y, { align: 'right' })
  doc.text(`Report ref: ${reportReference(profile)}`, MARGIN, y)

  y += 4
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)

  // Candidate information.
  y = drawSectionHeading(doc, 'Candidate Information', y + 8)
  y = drawCandidatePanel(
    doc,
    [
      { label: 'Full Name', value: profile.full_name },
      { label: 'Political Party', value: profile.party_name },
      { label: 'Position', value: position },
      { label: 'Electoral Area', value: profile.electoral_area },
    ],
    y
  )

  // Summary statistics.
  y = drawSectionHeading(doc, 'Summary Statistics', y + 10)
  y = drawStatCards(
    doc,
    [
      {
        label: 'Total Polling Stations',
        value: formatNumber(summary.total_stations),
        sub: 'In this electoral area',
        accent: COLORS.blue,
      },
      {
        label: 'Stations Reported',
        value: formatNumber(summary.stations_reported),
        sub: `${formatPercent(summary.reporting_percentage)} reporting`,
        accent: COLORS.emerald,
      },
      {
        label: 'Pending Stations',
        value: formatNumber(pendingStations),
        sub: 'Awaiting results',
        accent: COLORS.gold,
      },
      {
        label: 'Registered Voters',
        value: formatNumber(summary.registered_voters),
        sub: 'Total registered',
        accent: COLORS.purple,
      },
      {
        label: 'Total Votes Cast',
        value: formatNumber(summary.total_votes_cast),
        sub: 'Across reported stations',
        accent: COLORS.emerald,
      },
      {
        label: 'Voter Turnout',
        value: formatPercent(summary.turnout_percentage),
        sub: 'Of registered voters',
        accent: COLORS.blue,
      },
      {
        label: 'Valid Votes',
        value: formatNumber(totalValidVotes),
        sub: 'Sum of candidate votes',
        accent: COLORS.purple,
      },
      {
        label: 'Rejected Votes',
        value: formatNumber(summary.rejected_votes),
        sub: 'Excluded from the tally',
        accent: COLORS.gold,
      },
    ],
    y
  )

  // Detailed results.
  y = drawSectionHeading(doc, `Detailed Results — ${position}`, y + 10)
  if (results.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9.5)
    doc.setTextColor(COLORS.muted)
    doc.text(
      'No results are available yet. Results appear as polling stations submit their data.',
      MARGIN,
      y + 2
    )
    y += 8
  } else {
    drawResultsTable(doc, results, y)
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  }

  // Disclaimer.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  // A station whose result came from an approved observer fallback is called
  // out, so the report never presents a fallback as an agent result.
  const fallbackCount = Number(summary.observer_fallback_results || 0)
  const agentCount = Number(summary.agent_primary_results || 0)
  const sourceNote =
    fallbackCount > 0
      ? `Result sources: ${agentCount} station${agentCount === 1 ? '' : 's'} from agent primary submissions and ${fallbackCount} station${fallbackCount === 1 ? '' : 's'} from candidate approved observer fallbacks. ` +
        `The approved fallbacks are not agent submissions and are listed separately above. `
      : ''

  const note = doc.splitTextToSize(
    sourceNote +
      `This report was generated from the ${BRAND.name} Election Results System and reflects the figures submitted by agents at the time of generation. ` +
      `Percentages are calculated from the valid votes cast at the polling stations that have reported so far. ` +
      `Please verify all data before making public announcements. For inquiries contact ${BRAND.email} | WhatsApp: ${BRAND.phone}.`,
    CONTENT_WIDTH - 8
  ) as string[]

  const disclaimerHeight = 13 + note.length * 3.4
  let disclaimerY = y + 6
  if (disclaimerY + disclaimerHeight > FOOTER_Y - 8) {
    doc.addPage()
    drawContinuationHeader(doc)
    disclaimerY = TABLE_MARGIN.top
  }
  doc.setFillColor(COLORS.panel)
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.3)
  doc.roundedRect(MARGIN, disclaimerY, CONTENT_WIDTH, disclaimerHeight, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(COLORS.navy)
  doc.text('Notes & Disclaimer', MARGIN + 4, disclaimerY + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(COLORS.slate)
  doc.text(note, MARGIN + 4, disclaimerY + 11)

  drawFooters(doc)
  return doc
}

/** File name used for the downloaded report. */
export function buildReportFileName(profile: ReportProfile): string {
  const date = new Date().toISOString().split('T')[0]
  return [
    'Election_Report',
    slugify(profile.position),
    slugify(profile.electoral_area),
    date,
  ].join('_') + '.pdf'
}

/** Builds the report and saves it to the user's device. */
export async function downloadElectionReportPdf(data: ElectionReportData): Promise<void> {
  const doc = await buildElectionReportPdf(data)
  doc.save(buildReportFileName(data.profile))
}

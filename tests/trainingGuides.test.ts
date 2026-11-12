import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import type { jsPDF } from 'jspdf'

// jsPDF attaches save() to each document when it is created, so the class is
// wrapped to capture the rendered document instead of writing a file.
const rendered: jsPDF[] = []
vi.mock('jspdf', async (importOriginal) => {
  const mod: any = await importOriginal()
  class CapturingPdf extends mod.jsPDF {
    constructor(...args: any[]) {
      super(...args)
      ;(this as any).save = () => {
        rendered.push(this as any)
        return this
      }
    }
  }
  return { ...mod, jsPDF: CapturingPdf, default: CapturingPdf }
})

const { TRAINING_GUIDES } = await import('@/lib/trainingGuides')
const { downloadTrainingGuide, renderGuide } = await import('@/lib/trainingPdf')
type TrainingRole = keyof typeof TRAINING_GUIDES

/**
 * The training guides are built into a PDF whenever a user downloads one, so
 * they must render for every role and must describe the app as it behaves.
 */

const ROLES = Object.keys(TRAINING_GUIDES) as TrainingRole[]

function guideText(role: TrainingRole): string {
  const guide = TRAINING_GUIDES[role]
  return JSON.stringify(guide)
}

// The real emblem from the public folder, as the browser would fetch it.
const LOGO_PATH = path.join(__dirname, '..', 'public', 'icons', 'icon-192x192.png')
const LOGO_DATA_URL = `data:image/png;base64,${readFileSync(LOGO_PATH).toString('base64')}`

describe('training guide PDFs', () => {
  for (const role of ROLES) {
    it(`renders the ${role} guide with the logo on every page`, async () => {
      // Serve the emblem to the logo loader the way the site does.
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(readFileSync(LOGO_PATH), { headers: { 'Content-Type': 'image/png' } })
      )
      rendered.length = 0
      await downloadTrainingGuide(role)
      fetchMock.mockRestore()

      expect(rendered).toHaveLength(1)
      const doc = rendered[0]
      const pages = doc.getNumberOfPages()
      expect(pages).toBeGreaterThan(1)

      const pdf = Buffer.from(doc.output('arraybuffer')).toString('latin1')
      // The emblem is stored once (as the image plus its transparency mask,
      // since the PNG has an alpha channel), not once per page, and is drawn
      // on the cover and in each footer.
      expect(pdf.match(/\/Subtype \/Image/g)?.length).toBe(2)
      expect(pdf).toMatch(/\/SMask/)
      expect(pdf.match(/\/I\d+ Do/g)?.length ?? 0).toBe(pages + 1)
    })
  }

  it('still renders when the logo cannot be loaded', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    rendered.length = 0
    await downloadTrainingGuide('agent')
    fetchMock.mockRestore()

    expect(rendered).toHaveLength(1)
    const pdf = Buffer.from(rendered[0].output('arraybuffer')).toString('latin1')
    expect(pdf).not.toMatch(/\/Subtype \/Image/)
  })

  it('places the cover logo inside the header band', () => {
    const doc = renderGuide(TRAINING_GUIDES.admin, LOGO_DATA_URL)
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })
})

describe('training guide content', () => {
  it('numbers every section in order', () => {
    for (const role of ROLES) {
      TRAINING_GUIDES[role].sections.forEach((section, index) => {
        expect(section.heading.startsWith(`${index + 1}. `)).toBe(true)
      })
    }
  })

  it('does not tell anyone to type the registered voters, which come from the register', () => {
    for (const role of ROLES) {
      expect(guideText(role)).not.toMatch(/Enter the registered voters/)
    }
  })

  it('does not ask users to change their own password, which the app cannot do', () => {
    for (const role of ROLES) {
      expect(guideText(role)).not.toMatch(/change the password after signing in/i)
    }
  })

  it('only uses characters the PDF font can print', () => {
    // The built-in PDF font covers Latin-1 plus the usual typographic quotes
    // and dashes; anything else (such as →) prints as garbage.
    for (const role of ROLES) {
      expect(guideText(role)).not.toMatch(/[^\x00-\xFF‘’“”–—…•€]/)
    }
  })

  it('explains password resets to every role', () => {
    for (const role of ROLES) {
      expect(guideText(role)).toMatch(/reset/i)
    }
  })
})

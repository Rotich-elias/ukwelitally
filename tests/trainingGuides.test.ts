import { describe, it, expect, vi } from 'vitest'
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
const { downloadTrainingGuide } = await import('@/lib/trainingPdf')
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

describe('training guide PDFs', () => {
  for (const role of ROLES) {
    it(`renders the ${role} guide`, () => {
      rendered.length = 0
      downloadTrainingGuide(role)

      expect(rendered).toHaveLength(1)
      const doc = rendered[0]
      expect(doc.getNumberOfPages()).toBeGreaterThan(1)
      expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(5_000)
    })
  }
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

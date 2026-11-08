import { describe, expect, it } from 'vitest'
import { computeConfidenceScore, type ConfidenceInput } from '@/lib/confidence'

/**
 * The confidence score used to be a fixed set of assumptions and almost every
 * submission landed on the same number. These tests pin the evidence based
 * behaviour: complete evidence scores highly, missing evidence lowers the
 * score, and OCR only counts when it actually ran.
 */

function input(overrides: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    locationVerified: true,
    distanceMeters: 40,
    locationRadiusMeters: 500,
    photoTypes: ['full_form', 'closeup', 'signature', 'stamp', 'serial_number'],
    ocrConfidences: [100, 100],
    ocrAvailable: true,
    mathValid: true,
    submittedAt: new Date('2026-08-09T12:00:00Z'),
    formCapturedAt: new Date('2026-08-09T10:30:00Z'),
    hasAnomalies: false,
    ...overrides,
  }
}

describe('computeConfidenceScore', () => {
  it('awards a full score for complete evidence', () => {
    const result = computeConfidenceScore(input())

    expect(result.score).toBe(100)
    expect(result.breakdown.components).toHaveLength(5)
  })

  it('does not cap the score at 85 when OCR is unavailable', () => {
    const result = computeConfidenceScore(
      input({ ocrAvailable: false, ocrConfidences: [] })
    )

    expect(result.score).toBe(100)
    expect(result.breakdown.components.find((component) => component.key === 'ocr')?.available).toBe(false)
  })

  it('scores a provisional submission without result figures', () => {
    const result = computeConfidenceScore(
      input({ mathValid: null, ocrAvailable: false, ocrConfidences: [] })
    )

    // GPS, photos and timeliness are all strong. The arithmetic component is
    // unknown, not failed, so it is excluded rather than scored as zero.
    expect(result.score).toBe(100)
    expect(result.breakdown.available_weight).toBe(65)
  })

  it('returns zero when there is no evidence at all', () => {
    const result = computeConfidenceScore(
      input({
        locationVerified: false,
        distanceMeters: null,
        photoTypes: [],
        ocrAvailable: false,
        ocrConfidences: [],
        mathValid: false,
        submittedAt: new Date('2026-08-11T12:00:00Z'),
        formCapturedAt: new Date('2026-08-09T10:30:00Z'),
        hasAnomalies: false,
      })
    )

    expect(result.score).toBe(0)
  })

  it('lowers the score when the figures do not add up', () => {
    const valid = computeConfidenceScore(input())
    const invalid = computeConfidenceScore(input({ mathValid: false }))

    expect(invalid.score).toBeLessThan(valid.score)
  })

  it('penalises a submission with anomalies', () => {
    const clean = computeConfidenceScore(input())
    const flagged = computeConfidenceScore(input({ hasAnomalies: true }))

    expect(flagged.score).toBe(clean.score - 15)
    expect(flagged.breakdown.penalty).toBe(15)
  })

  it('lowers the timeliness score for a late submission', () => {
    const timely = computeConfidenceScore(input())
    const late = computeConfidenceScore(
      input({
        submittedAt: new Date('2026-08-10T12:00:00Z'),
      })
    )

    expect(late.score).toBeLessThan(timely.score)
  })

  it('scores a blurry or missing form photo lower than a readable one', () => {
    const complete = computeConfidenceScore(input())
    const missing = computeConfidenceScore(input({ photoTypes: [] }))

    expect(missing.score).toBeLessThan(complete.score)
  })
})

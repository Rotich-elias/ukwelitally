import { describe, it, expect } from 'vitest'
import {
  validateVoteCounts,
  detectAnomalies,
  calculateVariance,
  calculateDistance,
  verifyLocation,
  calculateConfidenceScore,
} from '@/lib/validation'

describe('validateVoteCounts', () => {
  const base = {
    registered_voters: 1000,
    total_votes_cast: 800,
    valid_votes: 700,
    rejected_votes: 100,
  }

  it('accepts internally consistent counts', () => {
    const result = validateVoteCounts({
      ...base,
      candidate_votes: [
        { votes: 400 },
        { votes: 300 },
      ],
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects votes cast exceeding registered voters', () => {
    const result = validateVoteCounts({
      ...base,
      registered_voters: 100,
      candidate_votes: [{ votes: 700 }],
    })

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/exceeds registered voters/)
  })

  it('rejects valid plus rejected not equalling total cast', () => {
    const result = validateVoteCounts({
      ...base,
      valid_votes: 600,
      candidate_votes: [{ votes: 600 }],
    })

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/does not equal Total votes cast/)
  })

  it('rejects candidate votes not summing to valid votes', () => {
    const result = validateVoteCounts({
      ...base,
      candidate_votes: [{ votes: 100 }],
    })

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/does not equal valid votes/)
  })

  it('rejects negative counts', () => {
    const result = validateVoteCounts({
      ...base,
      rejected_votes: -5,
      candidate_votes: [{ votes: -1 }],
    })

    expect(result.valid).toBe(false)
  })
})

describe('detectAnomalies', () => {
  it('flags unusually high turnout', () => {
    const result = detectAnomalies({
      registered_voters: 1000,
      total_votes_cast: 980,
      valid_votes: 900,
      rejected_votes: 80,
      candidate_votes: [{ votes: 900 }],
    })

    expect(result.hasAnomalies).toBe(true)
    expect(result.flags.join(' ')).toMatch(/high turnout/i)
  })

  it('flags a high rejection rate', () => {
    const result = detectAnomalies({
      registered_voters: 1000,
      total_votes_cast: 800,
      valid_votes: 600,
      rejected_votes: 200,
      candidate_votes: [{ votes: 600 }],
    })

    expect(result.flags.join(' ')).toMatch(/rejection rate/i)
  })

  it('flags a candidate with more than 90% of votes', () => {
    const result = detectAnomalies({
      registered_voters: 1000,
      total_votes_cast: 800,
      valid_votes: 700,
      rejected_votes: 100,
      candidate_votes: [{ votes: 680 }],
    })

    expect(result.flags.join(' ')).toMatch(/of votes/i)
  })

  it('reports no anomalies for a normal result', () => {
    const result = detectAnomalies({
      registered_voters: 1000,
      total_votes_cast: 500,
      valid_votes: 450,
      rejected_votes: 50,
      candidate_votes: [
        { votes: 250 },
        { votes: 200 },
      ],
    })

    expect(result.hasAnomalies).toBe(false)
  })
})

describe('calculateVariance', () => {
  it('reports zero variance for identical tallies', () => {
    const votes = [
      { candidate_name: 'A', votes: 100 },
      { candidate_name: 'B', votes: 50 },
    ]

    const result = calculateVariance(
      { candidate_votes: votes },
      { candidate_votes: votes }
    )

    expect(result.percentage).toBe(0)
  })

  it('reports the percentage difference between two tallies', () => {
    const result = calculateVariance(
      { candidate_votes: [{ candidate_name: 'A', votes: 100 }] },
      { candidate_votes: [{ candidate_name: 'A', votes: 120 }] }
    )

    expect(result.percentage).toBeCloseTo(20, 5)
    expect(result.details[0].diff).toBe(20)
  })

  it('ignores candidates that are missing from either side', () => {
    const result = calculateVariance(
      { candidate_votes: [{ candidate_name: 'A', votes: 100 }] },
      { candidate_votes: [{ candidate_name: 'B', votes: 100 }] }
    )

    expect(result.percentage).toBe(0)
  })
})

describe('calculateDistance', () => {
  it('returns zero for identical coordinates', () => {
    expect(calculateDistance(-1.286389, 36.817223, -1.286389, 36.817223)).toBe(0)
  })

  it('computes a plausible distance between two Nairobi locations', () => {
    // Central business district to Westlands, roughly 6km apart.
    const distance = calculateDistance(-1.286389, 36.817223, -1.2570, 36.7900)
    expect(distance).toBeGreaterThan(3000)
    expect(distance).toBeLessThan(9000)
  })
})

describe('verifyLocation', () => {
  it('verifies a submission within the radius', () => {
    const result = verifyLocation(-1.286389, 36.817223, -1.286389, 36.817223, 500)
    expect(result.verified).toBe(true)
    expect(result.distance).toBe(0)
  })

  it('rejects a submission outside the radius', () => {
    const result = verifyLocation(-1.300000, 36.900000, -1.286389, 36.817223, 500)
    expect(result.verified).toBe(false)
    expect(result.distance).toBeGreaterThan(500)
  })
})

describe('calculateConfidenceScore', () => {
  it('awards the maximum score for a perfect submission', () => {
    const score = calculateConfidenceScore({
      locationVerified: true,
      distance: 50,
      photoCount: 4,
      hasAllRequiredPhotos: true,
      mathValid: true,
      submittedWithinHours: 1,
      historicalMatch: true,
    })

    expect(score).toBe(100)
  })

  it('returns zero for a submission with no signals', () => {
    const score = calculateConfidenceScore({
      locationVerified: false,
      distance: 5000,
      photoCount: 0,
      hasAllRequiredPhotos: false,
      mathValid: false,
      submittedWithinHours: 48,
      historicalMatch: false,
    })

    expect(score).toBe(0)
  })

  it('keeps the score within 0 and 100', () => {
    const score = calculateConfidenceScore({
      locationVerified: true,
      distance: 0,
      photoCount: 10,
      hasAllRequiredPhotos: true,
      mathValid: true,
      submittedWithinHours: 1,
      historicalMatch: true,
    })

    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

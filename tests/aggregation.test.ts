import { describe, it, expect } from 'vitest'
import {
  buildCandidateBreakdown,
  computePercentages,
  computeReportingPercentage,
  computeTurnout,
} from '@/lib/aggregation'

describe('computePercentages', () => {
  it('scores every candidate against the same denominator', () => {
    const rows = [
      { candidate_name: 'A', party_name: 'P', total_votes: 600, stations_reporting: 2 },
      { candidate_name: 'B', party_name: 'Q', total_votes: 400, stations_reporting: 2 },
    ]

    const result = computePercentages(rows, 1000)

    expect(result[0].percentage).toBe(60)
    expect(result[1].percentage).toBe(40)
    expect(result[0].percentage + result[1].percentage).toBe(100)
  })

  it('produces percentages that sum to 100 when candidates cover different stations', () => {
    // Realistic scenario: station A reported both candidates, station B
    // reported both but with far fewer votes.
    //   Station A: valid 80,000 -> ELIAS 50,000, john 30,000
    //   Station B: valid    700 -> ELIAS    400, john    300
    // Scope totals: valid 80,700; ELIAS 50,400; john 30,300
    //
    // With per-candidate denominators the percentages would not sum to 100.
    const rows = [
      { candidate_name: 'ELIAS', party_name: null, total_votes: 50400, stations_reporting: 2 },
      { candidate_name: 'john', party_name: null, total_votes: 30300, stations_reporting: 2 },
    ]

    const result = computePercentages(rows, 80700)

    expect(result[0].percentage).toBeCloseTo(62.45, 2)
    expect(result[1].percentage).toBeCloseTo(37.55, 2)

    const total = result.reduce((sum, r) => sum + r.percentage, 0)
    expect(total).toBeCloseTo(100, 5)
  })

  it('uses the same denominator for every candidate', () => {
    // Candidate A reported at two stations, candidate B at one. Both must be
    // measured against the scope-wide denominator.
    const rows = [
      { candidate_name: 'A', party_name: null, total_votes: 50400, stations_reporting: 2 },
      { candidate_name: 'B', party_name: null, total_votes: 30000, stations_reporting: 1 },
    ]

    const result = computePercentages(rows, 80700)

    // A: 50400/80700, B: 30000/80700 - one shared denominator.
    expect(result[0].percentage).toBeCloseTo((50400 / 80700) * 100, 10)
    expect(result[1].percentage).toBeCloseTo((30000 / 80700) * 100, 10)
  })

  it('returns zero percentage when there are no valid votes', () => {
    const rows = [
      { candidate_name: 'A', party_name: null, total_votes: 100, stations_reporting: 1 },
    ]

    expect(computePercentages(rows, 0)[0].percentage).toBe(0)
  })
})

describe('computeTurnout', () => {
  it('computes turnout against registered voters', () => {
    expect(computeTurnout(90000, 100000)).toBe(90)
  })

  it('returns zero when there are no registered voters', () => {
    expect(computeTurnout(1000, 0)).toBe(0)
  })
})

describe('computeReportingPercentage', () => {
  it('computes the share of stations that reported', () => {
    expect(computeReportingPercentage(25, 100)).toBe(25)
  })

  it('returns zero when there are no stations in the area', () => {
    expect(computeReportingPercentage(0, 0)).toBe(0)
  })
})

describe('buildCandidateBreakdown', () => {
  it('sorts candidates by votes descending', () => {
    const rows = [
      { candidate_name: 'A', party_name: null, total_votes: 100, stations_reporting: 1 },
      { candidate_name: 'B', party_name: null, total_votes: 900, stations_reporting: 1 },
    ]

    const result = buildCandidateBreakdown(rows, {
      total_votes_cast: 1000,
      total_valid_votes: 1000,
      total_rejected_votes: 0,
      reported_registered_voters: 1000,
      stations_reporting: 1,
    })

    expect(result[0].candidate_name).toBe('B')
    expect(result[1].candidate_name).toBe('A')
  })

  it('uses the totals total_valid_votes as the shared denominator', () => {
    const rows = [
      { candidate_name: 'A', party_name: null, total_votes: 500, stations_reporting: 1 },
      { candidate_name: 'B', party_name: null, total_votes: 500, stations_reporting: 1 },
    ]

    const result = buildCandidateBreakdown(rows, {
      total_votes_cast: 1000,
      total_valid_votes: 1000,
      total_rejected_votes: 0,
      reported_registered_voters: 1000,
      stations_reporting: 1,
    })

    expect(result[0].percentage).toBe(50)
    expect(result[1].percentage).toBe(50)
  })
})

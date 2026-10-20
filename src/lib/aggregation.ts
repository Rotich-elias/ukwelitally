/**
 * Pure aggregation helpers for election results.
 *
 * These functions are deliberately free of database access so they can be
 * unit tested. The SQL in the API routes is responsible for producing the
 * grouped rows; this module is responsible for turning those rows into the
 * numbers that are published to users.
 *
 * The most important invariant enforced here: a single, shared denominator is
 * used for every candidate percentage. Percentages computed against
 * per-candidate denominators cannot be compared and do not sum to 100%.
 */

export interface CandidateVoteRow {
  candidate_name: string
  party_name: string | null
  total_votes: number
  stations_reporting: number
  profile_photo?: string | null
  candidate_number?: string | null
  position?: string | null
  official_name?: string | null
  electoral_area?: string | null
}

export interface AggregateTotals {
  /** Total votes cast across every distinct reporting station. */
  total_votes_cast: number
  /** Total valid votes across every distinct reporting station. */
  total_valid_votes: number
  /** Total rejected votes across every distinct reporting station. */
  total_rejected_votes: number
  /** Registered voters across every distinct reporting station. */
  reported_registered_voters: number
  /** Number of distinct stations that contributed a verified primary result. */
  stations_reporting: number
}

/**
 * Compute each candidate's share of the valid votes cast.
 *
 * `totalValidVotes` must be the total across the whole reporting area, so that
 * every candidate is measured against the same denominator and the resulting
 * percentages are directly comparable.
 */
export function computePercentages(
  rows: CandidateVoteRow[],
  totalValidVotes: number
): Array<CandidateVoteRow & { percentage: number }> {
  const denominator = Number.isFinite(totalValidVotes) ? totalValidVotes : 0

  return rows.map((row) => ({
    ...row,
    percentage: denominator > 0 ? (row.total_votes / denominator) * 100 : 0,
  }))
}

/**
 * Turnout is the share of registered voters who cast a ballot at the stations
 * that actually reported. Returns 0 when there is nothing to divide by.
 */
export function computeTurnout(totalVotesCast: number, registeredVoters: number): number {
  if (!registeredVoters || registeredVoters <= 0) return 0
  return (totalVotesCast / registeredVoters) * 100
}

/**
 * Percentage of the area's polling stations that have reported at all.
 */
export function computeReportingPercentage(
  stationsWithSubmissions: number,
  totalStations: number
): number {
  if (!totalStations || totalStations <= 0) return 0
  return (stationsWithSubmissions / totalStations) * 100
}

/**
 * Build the candidate breakdown, sorted by votes descending.
 */
export function buildCandidateBreakdown(
  rows: CandidateVoteRow[],
  totals: AggregateTotals
): Array<CandidateVoteRow & { percentage: number }> {
  return computePercentages(rows, totals.total_valid_votes).sort(
    (a, b) => b.total_votes - a.total_votes
  )
}

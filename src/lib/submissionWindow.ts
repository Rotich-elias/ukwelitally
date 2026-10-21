import { query, queryOne, queryMany, transaction, type PoolClient } from '@/lib/db'
import { UserRole } from '@/types/database'

/**
 * Candidate controlled reporting windows.
 *
 * A reporting window is the submission permission of a candidate's team: it
 * decides whether agents (and observers working in that scope) may submit
 * result data at all. It is deliberately separate from
 *
 *   - users.active          -> is the login account enabled?
 *   - candidates.access_status -> has the customer paid for / kept their access?
 *
 * The server clock is the only source of truth. A window that is scheduled
 * for the future opens by itself, and a window whose closing time has passed
 * expires by itself, whether or not the candidate is logged in.
 */

export type WindowStatus = 'closed' | 'open' | 'scheduled' | 'expired'
export type WindowState = 'closed' | 'open' | 'scheduled'
export type CandidateAccessStatus = 'active' | 'suspended' | 'revoked'

/** Row shape of the submission_windows table. */
export interface SubmissionWindowRow {
  id: number
  candidate_id: number
  position: string | null
  status: WindowState
  opens_at: Date | null
  closes_at: Date | null
  opened_by: number | null
  opened_at: Date | null
  closed_by: number | null
  closed_at: Date | null
  schedule_cancelled_at: Date | null
  schedule_cancelled_by: number | null
  created_at?: Date
  updated_at?: Date
}

/** The result of evaluating a window against the server clock. */
export interface WindowEvaluation {
  status: WindowStatus
  /** True when a submission is accepted right now. */
  canSubmit: boolean
  opensAt: Date | null
  closesAt: Date | null
  /** Machine readable reason, used by the API and the dashboards. */
  code: WindowCode
  /** Human readable explanation, safe to show to the submitting user. */
  message: string
}

export type WindowCode =
  | 'open'
  | 'closed'
  | 'scheduled'
  | 'expired'
  | 'no_window'

/**
 * Africa/Nairobi is UTC+3 with no daylight saving, so a fixed offset is
 * exact for every date.
 */
export const NAIROBI_UTC_OFFSET_MINUTES = 180

/**
 * Parse a timestamp supplied by a client.
 *
 * An ISO string with an offset (or Z) is used as it is. A naive local
 * datetime string is interpreted as East Africa Time, which is what the
 * candidate dashboard sends when the candidate picks a wall clock time.
 */
export function parseScheduleDate(
  value: unknown
): { ok: true; date: Date } | { ok: false; error: string } {
  if (value === null || value === undefined || value === '') {
    return { ok: false, error: 'A date and time is required' }
  }

  if (typeof value !== 'string') {
    return { ok: false, error: 'Invalid date and time' }
  }

  const trimmed = value.trim()

  // A naive local datetime: "2026-10-22T08:00" or "2026-10-22 08:00:00".
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (naive) {
    const [, year, month, day, hour, minute, second] = naive
    const utcMs = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? '0')
    )
    const date = new Date(utcMs - NAIROBI_UTC_OFFSET_MINUTES * 60 * 1000)
    if (Number.isNaN(date.getTime())) {
      return { ok: false, error: 'Invalid date and time' }
    }
    return { ok: true, date }
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: 'Invalid date and time' }
  }
  return { ok: true, date: parsed }
}

/**
 * Validate a requested schedule.
 *
 * Rules:
 *   - a closing time must be after the opening time
 *   - a schedule that is entirely in the past is rejected
 *   - an opening time in the past is rejected (it would open immediately)
 */
export function validateSchedule(
  input: { opens_at?: unknown; closes_at?: unknown },
  now: Date = new Date()
): { valid: boolean; errors: string[]; opensAt: Date | null; closesAt: Date | null } {
  const errors: string[] = []
  let opensAt: Date | null = null
  let closesAt: Date | null = null

  const hasOpens = input.opens_at !== undefined && input.opens_at !== null && input.opens_at !== ''
  const hasCloses = input.closes_at !== undefined && input.closes_at !== null && input.closes_at !== ''

  if (!hasOpens && !hasCloses) {
    return {
      valid: false,
      errors: ['Provide an opening time, a closing time, or both'],
      opensAt: null,
      closesAt: null,
    }
  }

  if (hasOpens) {
    const parsed = parseScheduleDate(input.opens_at)
    if (!parsed.ok) {
      errors.push(`Opening time: ${parsed.error}`)
    } else {
      opensAt = parsed.date
    }
  }

  if (hasCloses) {
    const parsed = parseScheduleDate(input.closes_at)
    if (!parsed.ok) {
      errors.push(`Closing time: ${parsed.error}`)
    } else {
      closesAt = parsed.date
    }
  }

  if (opensAt && closesAt && closesAt.getTime() <= opensAt.getTime()) {
    errors.push('The closing time must be after the opening time')
  }

  if (opensAt && opensAt.getTime() <= now.getTime()) {
    errors.push('The opening time must be in the future')
  }

  if (!opensAt && closesAt && closesAt.getTime() <= now.getTime()) {
    errors.push('The closing time must be in the future')
  }

  return { valid: errors.length === 0, errors, opensAt, closesAt }
}

/**
 * Evaluate a stored window against the server clock.
 *
 * A missing window is a closed window: submission is closed by default for
 * every new candidate team.
 */
export function evaluateWindow(
  window: SubmissionWindowRow | null | undefined,
  now: Date = new Date()
): WindowEvaluation {
  if (!window) {
    return {
      status: 'closed',
      canSubmit: false,
      opensAt: null,
      closesAt: null,
      code: 'no_window',
      message:
        'Result submission is closed. Your candidate has not opened a reporting window yet.',
    }
  }

  const opensAt = window.opens_at ? new Date(window.opens_at) : null
  const closesAt = window.closes_at ? new Date(window.closes_at) : null

  if (window.status === 'closed') {
    return {
      status: 'closed',
      canSubmit: false,
      opensAt,
      closesAt,
      code: 'closed',
      message: 'Result submission is closed for your team.',
    }
  }

  if (window.status === 'scheduled') {
    if (opensAt && opensAt.getTime() > now.getTime()) {
      return {
        status: 'scheduled',
        canSubmit: false,
        opensAt,
        closesAt,
        code: 'scheduled',
        message: `Result submission is scheduled to open at ${formatNairobi(opensAt)}.`,
      }
    }
    // The scheduled opening time has passed: the window is open.
  }

  if (closesAt && closesAt.getTime() <= now.getTime()) {
    return {
      status: 'expired',
      canSubmit: false,
      opensAt,
      closesAt,
      code: 'expired',
      message: `The reporting window closed at ${formatNairobi(closesAt)}.`,
    }
  }

  return {
    status: 'open',
    canSubmit: true,
    opensAt,
    closesAt,
    code: 'open',
    message: closesAt
      ? `Result submission is open until ${formatNairobi(closesAt)}.`
      : 'Result submission is open.',
  }
}

/**
 * Format a timestamp for display in East Africa Time.
 */
export function formatNairobi(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return '—'
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

/**
 * SQL condition that restricts a query to the polling stations inside a
 * candidate's electoral area.
 *
 * The scope binds at most one parameter, at $1. A presidential candidate
 * covers the whole country, so the condition is always true for them.
 */
export function stationScopeCondition(
  position: string,
  location: { county_id?: number; constituency_id?: number; ward_id?: number }
): { clause: string; params: any[] } {
  if (position === 'mca' && location.ward_id) {
    return { clause: 'ps.ward_id = $1', params: [location.ward_id] }
  }
  if (position === 'mp' && location.constituency_id) {
    return { clause: 'ps.constituency_id = $1', params: [location.constituency_id] }
  }
  if (
    ['governor', 'senator', 'women_rep'].includes(position) &&
    location.county_id
  ) {
    return { clause: 'ps.county_id = $1', params: [location.county_id] }
  }
  return { clause: '1=1', params: [] }
}

/**
 * The positions that have a candidate with a team at a polling station.
 *
 * An observer reports a position rather than a single candidate, so this is
 * the list of races the observer can report from their station. Only races
 * that are actually being reported at that station are offered.
 */
export async function getPositionsForStation(
  pollingStationId: number
): Promise<Array<{ position: string; candidate_ids: number[] }>> {
  const rows = await queryMany<{ position: string; candidate_id: number }>(
    `SELECT c.position, c.id AS candidate_id
       FROM candidates c
       JOIN agents a ON a.candidate_id = c.id
       JOIN polling_stations ps ON ps.id = $1
      WHERE c.is_placeholder = FALSE
        AND c.is_system_user = TRUE
        AND a.polling_station_id = ps.id
        AND (
          (c.position = 'president')
          OR (c.position IN ('governor', 'senator', 'women_rep') AND c.county_id = ps.county_id)
          OR (c.position = 'mp' AND c.constituency_id = ps.constituency_id)
          OR (c.position = 'mca' AND c.ward_id = ps.ward_id)
        )
      ORDER BY c.position, c.id`,
    [pollingStationId]
  )

  const byPosition = new Map<string, number[]>()
  for (const row of rows) {
    const list = byPosition.get(row.position) ?? []
    list.push(row.candidate_id)
    byPosition.set(row.position, list)
  }

  return Array.from(byPosition.entries()).map(([position, candidateIds]) => ({
    position,
    candidate_ids: candidateIds,
  }))
}

/* -------------------------------------------------------------------------- */
/*                            Database accessors                               */
/* -------------------------------------------------------------------------- */

/**
 * Read the window of a candidate for a scope.
 *
 * The scope is the position. NULL means "every position", and a window for a
 * specific position takes precedence over the catch-all window.
 */
export async function getWindowForCandidate(
  candidateId: number,
  position?: string | null
): Promise<SubmissionWindowRow | null> {
  return queryOne<SubmissionWindowRow>(
    `SELECT * FROM submission_windows
      WHERE candidate_id = $1
        AND (position = $2 OR (position IS NULL AND $2 IS NOT NULL) OR (position IS NULL AND $2 IS NULL))
      ORDER BY (position IS NULL) ASC, id ASC
      LIMIT 1`,
    [candidateId, position ?? null]
  )
}

/**
 * Read the access status of a candidate.
 */
export async function getCandidateAccessStatus(
  candidateId: number
): Promise<CandidateAccessStatus> {
  const row = await queryOne<{ access_status: CandidateAccessStatus }>(
    'SELECT access_status FROM candidates WHERE id = $1',
    [candidateId]
  )
  return row?.access_status ?? 'suspended'
}

/**
 * The reporting scope of an observer submission.
 *
 * An observer reports a race at a polling station. The scope is the set of
 * candidates that are actually responsible for that station in that race:
 * they run for the position, their electoral area contains the station, AND
 * they have a team (an assigned agent) at that station.
 *
 * The team requirement is what stops an unrelated open window from
 * authorising the submission. A presidential candidate who is collecting
 * results in another county, or a candidate for a different race, is not in
 * the scope and their reporting window can never authorise a submission here.
 */
export async function resolveObserverReportingScope(
  pollingStationId: number,
  position: string
): Promise<{ candidateIds: number[]; agentUserIds: number[] }> {
  const rows = await queryMany<{ id: number; user_id: number }>(
    `SELECT c.id, MIN(a.user_id) AS user_id
       FROM candidates c
       JOIN agents a ON a.candidate_id = c.id
       JOIN polling_stations ps ON ps.id = $1
      WHERE c.position = $2
        AND c.is_placeholder = FALSE
        AND c.is_system_user = TRUE
        AND a.polling_station_id = ps.id
        AND (
          (c.position = 'president')
          OR (c.position IN ('governor', 'senator', 'women_rep') AND c.county_id = ps.county_id)
          OR (c.position = 'mp' AND c.constituency_id = ps.constituency_id)
          OR (c.position = 'mca' AND c.ward_id = ps.ward_id)
        )
      GROUP BY c.id
      ORDER BY c.id`,
    [pollingStationId, position]
  )

  return {
    candidateIds: rows.map((row) => row.id),
    agentUserIds: rows.map((row) => row.user_id),
  }
}

/**
 * The same scope, read inside a transaction.
 *
 * The scope is re-read when the result is written, so a candidate whose
 * team was withdrawn from the station in the meantime cannot authorise the
 * submission.
 */
export async function resolveObserverReportingScopeWith(
  client: PoolClient,
  pollingStationId: number,
  position: string
): Promise<{ candidateIds: number[] }> {
  const result = await client.query<{ id: number }>(
    `SELECT c.id
       FROM candidates c
       JOIN agents a ON a.candidate_id = c.id
       JOIN polling_stations ps ON ps.id = $1
      WHERE c.position = $2
        AND c.is_placeholder = FALSE
        AND c.is_system_user = TRUE
        AND c.access_status = 'active'
        AND a.polling_station_id = ps.id
        AND (
          (c.position = 'president')
          OR (c.position IN ('governor', 'senator', 'women_rep') AND c.county_id = ps.county_id)
          OR (c.position = 'mp' AND c.constituency_id = ps.constituency_id)
          OR (c.position = 'mca' AND c.ward_id = ps.ward_id)
        )
      GROUP BY c.id
      ORDER BY c.id`,
    [pollingStationId, position]
  )

  return { candidateIds: result.rows.map((row) => row.id) }
}

/**
 * Evaluate the window that governs a set of candidate scopes.
 *
 * The most permissive window wins: a submission is allowed when at least one
 * candidate in scope has opened reporting. When no candidate in scope has a
 * window the scope is closed.
 */
export async function evaluateScopeWindows(
  candidateIds: number[],
  position: string | null,
  now: Date = new Date()
): Promise<WindowEvaluation & { authorisedByCandidateId: number | null }> {
  if (candidateIds.length === 0) {
    return {
      status: 'closed',
      canSubmit: false,
      opensAt: null,
      closesAt: null,
      code: 'no_window',
      message:
        'No reporting window is open for this election scope. Ask the candidates in this area to open result submission.',
      authorisedByCandidateId: null,
    }
  }

  const evaluations: WindowEvaluation[] = []
  for (const candidateId of candidateIds) {
    const window = await getWindowForCandidate(candidateId, position)
    evaluations.push(evaluateWindow(window, now))
  }

  // The candidate whose window authorises the submission. The scope is
  // already restricted to the candidates that report this race at this
  // station, so this is the reporting scope the submission belongs to.
  const openIndex = evaluations.findIndex((evaluation) => evaluation.canSubmit)
  if (openIndex !== -1) {
    return { ...evaluations[openIndex], authorisedByCandidateId: candidateIds[openIndex] }
  }

  // Nothing is open: report the most informative state.
  const scheduledIndex = evaluations.findIndex(
    (evaluation) => evaluation.status === 'scheduled'
  )
  if (scheduledIndex !== -1) {
    return {
      ...evaluations[scheduledIndex],
      authorisedByCandidateId: null,
    }
  }

  const expiredIndex = evaluations.findIndex((evaluation) => evaluation.status === 'expired')
  if (expiredIndex !== -1) {
    return {
      ...evaluations[expiredIndex],
      authorisedByCandidateId: null,
    }
  }

  return { ...evaluations[0], authorisedByCandidateId: null }
}

/* -------------------------------------------------------------------------- */
/*                          Window mutations                                  */
/* -------------------------------------------------------------------------- */

export type WindowAction = 'open' | 'close' | 'schedule' | 'cancel_schedule'

export interface WindowMutationResult {
  ok: boolean
  window?: SubmissionWindowRow
  evaluation: WindowEvaluation
  error?: string
  errors?: string[]
}

/**
 * Apply a window action for a candidate.
 *
 * The caller must have already verified that the acting user owns the
 * candidate. Every transition is written to the audit trail by the route.
 */
export async function applyWindowAction(params: {
  candidateId: number
  position: string | null
  action: WindowAction
  actorId: number
  opensAt?: Date | null
  closesAt?: Date | null
  now?: Date
}): Promise<WindowMutationResult> {
  const now = params.now ?? new Date()
  const { candidateId, position, action, actorId } = params

  const existing = await getWindowForCandidate(candidateId, position)

  if (action === 'open' || action === 'close') {
    if (action === 'open' && params.closesAt && params.closesAt.getTime() <= now.getTime()) {
      return {
        ok: false,
        evaluation: evaluateWindow(existing, now),
        error: 'The closing time must be in the future',
      }
    }

    const window = await transaction(async (client: PoolClient) => {
      const row = await upsertWindow(client, candidateId, position)
      const windowId = row.rows[0].id

      if (action === 'open') {
        return client.query<SubmissionWindowRow>(
          `UPDATE submission_windows
              SET status = 'open',
                  opens_at = COALESCE($1::timestamptz, opens_at),
                  closes_at = $2::timestamptz,
                  opened_by = $3,
                  opened_at = $4::timestamptz,
                  closed_by = NULL,
                  closed_at = NULL,
                  schedule_cancelled_at = NULL,
                  schedule_cancelled_by = NULL,
                  updated_at = NOW()
            WHERE id = $5
            RETURNING *`,
          [
            params.opensAt ?? null,
            params.closesAt ?? null,
            actorId,
            now,
            windowId,
          ]
        )
      }

      return client.query<SubmissionWindowRow>(
        `UPDATE submission_windows
            SET status = 'closed',
                closed_by = $1,
                closed_at = $2::timestamptz,
                updated_at = NOW()
          WHERE id = $3
          RETURNING *`,
        [actorId, now, windowId]
      )
    })

    const saved = window.rows[0]
    return { ok: true, window: saved, evaluation: evaluateWindow(saved, now) }
  }

  if (action === 'schedule') {
    const validation = validateSchedule(
      { opens_at: params.opensAt, closes_at: params.closesAt },
      now
    )
    if (!validation.valid) {
      return {
        ok: false,
        evaluation: evaluateWindow(existing, now),
        error: validation.errors[0],
        errors: validation.errors,
      }
    }

    const window = await transaction(async (client: PoolClient) => {
      const row = await upsertWindow(client, candidateId, position)
      return client.query<SubmissionWindowRow>(
        `UPDATE submission_windows
            SET status = 'scheduled',
                opens_at = $1::timestamptz,
                closes_at = $2::timestamptz,
                opened_by = $3,
                opened_at = NULL,
                closed_by = NULL,
                closed_at = NULL,
                schedule_cancelled_at = NULL,
                schedule_cancelled_by = NULL,
                updated_at = NOW()
          WHERE id = $4
          RETURNING *`,
        [validation.opensAt, validation.closesAt, actorId, row.rows[0].id]
      )
    })

    const saved = window.rows[0]
    return { ok: true, window: saved, evaluation: evaluateWindow(saved, now) }
  }

  // cancel_schedule
  if (!existing || (existing.status !== 'scheduled' && !existing.opens_at)) {
    return {
      ok: false,
      evaluation: evaluateWindow(existing, now),
      error: 'There is no scheduled reporting window to cancel',
    }
  }

  const window = await transaction(async (client: PoolClient) => {
    const row = await upsertWindow(client, candidateId, position)
    return client.query<SubmissionWindowRow>(
      `UPDATE submission_windows
          SET status = 'closed',
              opens_at = NULL,
              closes_at = NULL,
              schedule_cancelled_at = $1::timestamptz,
              schedule_cancelled_by = $2,
              closed_by = $2,
              closed_at = $1::timestamptz,
              updated_at = NOW()
        WHERE id = $3
        RETURNING *`,
      [now, actorId, row.rows[0].id]
    )
  })

  const saved = window.rows[0]
  return { ok: true, window: saved, evaluation: evaluateWindow(saved, now) }
}

/**
 * Insert the window row when it does not exist yet, otherwise return it.
 */
async function upsertWindow(
  client: PoolClient,
  candidateId: number,
  position: string | null
): Promise<{ rows: Array<{ id: number }> }> {
  const existing = await client.query<{ id: number }>(
    `SELECT id FROM submission_windows
      WHERE candidate_id = $1 AND COALESCE(position, '') = COALESCE($2, '')
      LIMIT 1`,
    [candidateId, position]
  )
  if (existing.rows.length > 0) return existing

  const inserted = await client.query<{ id: number }>(
    `INSERT INTO submission_windows (candidate_id, position, status)
     VALUES ($1, $2, 'closed')
     RETURNING id`,
    [candidateId, position]
  )
  return inserted
}

/* -------------------------------------------------------------------------- */
/*                      Resolving the window of a user                        */
/* -------------------------------------------------------------------------- */

export interface UserWindowContext {
  evaluation: WindowEvaluation
  /** The candidate the window belongs to, when there is exactly one. */
  candidateId: number | null
  /** Candidates in scope, for observer submissions. */
  candidateIds: number[]
  /** The access status of the governing candidate. */
  accessStatus: CandidateAccessStatus | null
  /** The position the window applies to. */
  position: string | null
  /**
   * The candidate whose reporting window authorises the submission.
   *
   * For an observer this is the candidate that reports the race at the
   * station, so the authorisation is always tied to an explicit reporting
   * scope rather than to an unrelated open window.
   */
  authorisedByCandidateId: number | null
}

/**
 * Resolve the reporting window that governs an agent's submissions.
 *
 * An agent belongs to exactly one candidate team, so the window of that
 * candidate is the one that applies.
 */
export async function getAgentWindowContext(
  userId: number
): Promise<UserWindowContext | null> {
  const agent = await queryOne<{
    candidate_id: number
    position: string
    access_status: CandidateAccessStatus
  }>(
    `SELECT a.candidate_id, c.position, c.access_status
       FROM agents a
       JOIN candidates c ON c.id = a.candidate_id
      WHERE a.user_id = $1`,
    [userId]
  )

  if (!agent) return null

  const window = await getWindowForCandidate(agent.candidate_id, agent.position)
  const evaluation = evaluateWindow(window)

  return {
    evaluation,
    candidateId: agent.candidate_id,
    candidateIds: [agent.candidate_id],
    accessStatus: agent.access_status,
    position: agent.position,
    authorisedByCandidateId: agent.candidate_id,
  }
}

/**
 * Resolve the reporting window that governs an observer's submissions.
 *
 * An observer reports a race at a polling station. The scope is resolved
 * explicitly: the candidates that run for that race, whose electoral area
 * contains the station, and that have a team at that station. Only a window
 * from that scope can authorise the submission.
 */
export async function getObserverWindowContext(
  userId: number,
  pollingStationId: number,
  position: string
): Promise<UserWindowContext> {
  const scope = await resolveObserverReportingScope(pollingStationId, position)

  if (scope.candidateIds.length === 0) {
    return {
      evaluation: {
        status: 'closed',
        canSubmit: false,
        opensAt: null,
        closesAt: null,
        code: 'no_window',
        message:
          'No candidate is reporting that race at your polling station, so the result cannot be submitted.',
      },
      candidateId: null,
      candidateIds: [],
      accessStatus: null,
      position,
      authorisedByCandidateId: null,
    }
  }

  // A candidate whose access is suspended or revoked cannot authorise a
  // submission, so it is not part of the scope.
  const eligible: number[] = []
  for (const candidateId of scope.candidateIds) {
    const access = await getCandidateAccessStatus(candidateId)
    if (access === 'active') eligible.push(candidateId)
  }

  if (eligible.length === 0) {
    return {
      evaluation: {
        status: 'closed',
        canSubmit: false,
        opensAt: null,
        closesAt: null,
        code: 'no_window',
        message:
          'The candidate that reports that race at your polling station does not have an active subscription.',
      },
      candidateId: null,
      candidateIds: [],
      accessStatus: null,
      position,
      authorisedByCandidateId: null,
    }
  }

  const evaluation = await evaluateScopeWindows(eligible, position)

  return {
    evaluation,
    candidateId: eligible.length === 1 ? eligible[0] : null,
    candidateIds: eligible,
    accessStatus: await getCandidateAccessStatus(
      evaluation.authorisedByCandidateId ?? eligible[0]
    ),
    position,
    authorisedByCandidateId: evaluation.authorisedByCandidateId,
  }
}

/**
 * Re-check the window inside the transaction that writes the result.
 *
 * The rows are locked FOR SHARE, so a concurrent close waits for the
 * submission to finish and a submission can never sneak in after the window
 * was closed.
 */
export async function lockScopeWindows(
  client: PoolClient,
  params: { candidateIds: number[]; position: string | null },
  now: Date = new Date()
): Promise<WindowEvaluation> {
  if (params.candidateIds.length === 0) {
    return {
      status: 'closed',
      canSubmit: false,
      opensAt: null,
      closesAt: null,
      code: 'no_window',
      message:
        'No reporting window is open for this election scope. Ask the candidates in this area to open result submission.',
    }
  }

  const rows = await client.query<SubmissionWindowRow>(
    `SELECT * FROM submission_windows
      WHERE candidate_id = ANY($1::int[])
        AND (position = $2 OR position IS NULL)
      ORDER BY (position IS NULL) ASC, id ASC
      FOR SHARE`,
    [params.candidateIds, params.position]
  )

  const evaluations = rows.rows.map((window) => evaluateWindow(window, now))
  const open = evaluations.find((evaluation) => evaluation.canSubmit)
  if (open) return open

  const scheduled = evaluations.find((evaluation) => evaluation.status === 'scheduled')
  if (scheduled) return scheduled

  const expired = evaluations.find((evaluation) => evaluation.status === 'expired')
  if (expired) return expired

  return evaluations[0]
}

/* -------------------------------------------------------------------------- */
/*                          Submission authorization                           */
/* -------------------------------------------------------------------------- */export type SubmissionKind = 'agent' | 'observer'

export interface SubmissionAuthorizationInput {
  role: UserRole
  /** The login account of the submitting user. */
  accountActive: boolean
  /** The purchased access of the candidate the submission belongs to. */
  candidateAccessStatus: CandidateAccessStatus | null
  /** The window that governs the submission. */
  window: WindowEvaluation
  /** Is the user assigned to the polling station they are submitting for? */
  stationAssigned: boolean
  /** The kind of submission. */
  kind: SubmissionKind
}

export interface AuthorizationDecision {
  allowed: boolean
  code:
    | 'allowed'
    | 'account_inactive'
    | 'access_revoked'
    | 'access_suspended'
    | 'window_closed'
    | 'station_not_assigned'
    | 'wrong_role'
  message: string
}

/**
 * Decide whether a submission is allowed.
 *
 * All conditions have to hold: an active account, valid purchased access, an
 * assigned polling station, the right role and an open reporting window.
 * The check runs on the server, so a stale frontend cannot bypass it.
 */
export function evaluateSubmissionAuthorization(
  input: SubmissionAuthorizationInput
): AuthorizationDecision {
  if (input.role !== 'agent' && input.role !== 'observer') {
    return {
      allowed: false,
      code: 'wrong_role',
      message: 'Only agents and observers can submit results.',
    }
  }

  if (!input.accountActive) {
    return {
      allowed: false,
      code: 'account_inactive',
      message:
        'Your account is not active. Contact the candidate or an administrator to reactivate it.',
    }
  }

  if (input.candidateAccessStatus === 'revoked') {
    return {
      allowed: false,
      code: 'access_revoked',
      message: 'Your candidate no longer has an active subscription.',
    }
  }

  if (input.candidateAccessStatus === 'suspended') {
    return {
      allowed: false,
      code: 'access_suspended',
      message: 'Your candidate’s subscription is suspended. Submissions are disabled.',
    }
  }

  if (!input.stationAssigned) {
    return {
      allowed: false,
      code: 'station_not_assigned',
      message: 'You are not assigned to this polling station.',
    }
  }

  if (!input.window.canSubmit) {
    return {
      allowed: false,
      code: 'window_closed',
      message: input.window.message,
    }
  }

  return {
    allowed: true,
    code: 'allowed',
    message: 'Submission accepted.',
  }
}

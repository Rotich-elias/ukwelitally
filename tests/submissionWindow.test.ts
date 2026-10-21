import { describe, it, expect } from 'vitest'
import {
  evaluateWindow,
  evaluateSubmissionAuthorization,
  parseScheduleDate,
  validateSchedule,
  type SubmissionWindowRow,
} from '@/lib/submissionWindow'

function windowRow(overrides: Partial<SubmissionWindowRow> = {}): SubmissionWindowRow {
  return {
    id: 1,
    candidate_id: 10,
    position: 'mp',
    status: 'open',
    opens_at: null,
    closes_at: null,
    opened_by: 1,
    opened_at: null,
    closed_by: null,
    closed_at: null,
    schedule_cancelled_at: null,
    schedule_cancelled_by: null,
    ...overrides,
  }
}

describe('evaluateWindow', () => {
  const now = new Date('2026-10-21T10:00:00.000Z')

  it('treats a missing window as closed', () => {
    const result = evaluateWindow(null, now)

    expect(result.status).toBe('closed')
    expect(result.canSubmit).toBe(false)
    expect(result.code).toBe('no_window')
  })

  it('reports a closed window as closed', () => {
    const result = evaluateWindow(windowRow({ status: 'closed' }), now)

    expect(result.status).toBe('closed')
    expect(result.canSubmit).toBe(false)
  })

  it('reports an open window as open', () => {
    const result = evaluateWindow(windowRow({ status: 'open' }), now)

    expect(result.status).toBe('open')
    expect(result.canSubmit).toBe(true)
  })

  it('keeps a scheduled window closed until the opening time', () => {
    const result = evaluateWindow(
      windowRow({
        status: 'scheduled',
        opens_at: new Date('2026-10-21T12:00:00.000Z'),
        closes_at: new Date('2026-10-22T12:00:00.000Z'),
      }),
      now
    )

    expect(result.status).toBe('scheduled')
    expect(result.canSubmit).toBe(false)
  })

  it('opens a scheduled window on the server clock, without a login', () => {
    const result = evaluateWindow(
      windowRow({
        status: 'scheduled',
        opens_at: new Date('2026-10-21T08:00:00.000Z'),
        closes_at: new Date('2026-10-22T08:00:00.000Z'),
      }),
      now
    )

    expect(result.status).toBe('open')
    expect(result.canSubmit).toBe(true)
  })

  it('expires a window whose closing time has passed', () => {
    const result = evaluateWindow(
      windowRow({
        status: 'open',
        opens_at: new Date('2026-10-20T08:00:00.000Z'),
        closes_at: new Date('2026-10-21T09:00:00.000Z'),
      }),
      now
    )

    expect(result.status).toBe('expired')
    expect(result.canSubmit).toBe(false)
    expect(result.code).toBe('expired')
  })

  it('keeps a window open while the closing time is in the future', () => {
    const result = evaluateWindow(
      windowRow({
        status: 'open',
        closes_at: new Date('2026-10-21T11:00:00.000Z'),
      }),
      now
    )

    expect(result.status).toBe('open')
    expect(result.canSubmit).toBe(true)
  })
})

describe('parseScheduleDate', () => {
  it('reads a naive datetime as East Africa Time', () => {
    const parsed = parseScheduleDate('2026-10-22T08:00')

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    // 08:00 in Nairobi is 05:00 UTC.
    expect(parsed.date.toISOString()).toBe('2026-10-22T05:00:00.000Z')
  })

  it('keeps an explicit offset', () => {
    const parsed = parseScheduleDate('2026-10-22T08:00:00+03:00')

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.date.toISOString()).toBe('2026-10-22T05:00:00.000Z')
  })

  it('rejects an unparseable value', () => {
    const parsed = parseScheduleDate('not-a-date')

    expect(parsed.ok).toBe(false)
  })

  it('rejects an empty value', () => {
    expect(parseScheduleDate('').ok).toBe(false)
    expect(parseScheduleDate(null).ok).toBe(false)
  })
})

describe('validateSchedule', () => {
  const now = new Date('2026-10-21T10:00:00.000Z')

  it('accepts a schedule that opens and closes in the future', () => {
    const result = validateSchedule(
      { opens_at: '2026-10-22T08:00', closes_at: '2026-10-22T18:00' },
      now
    )

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects a closing time that is not after the opening time', () => {
    const result = validateSchedule(
      { opens_at: '2026-10-22T18:00', closes_at: '2026-10-22T08:00' },
      now
    )

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/after the opening time/)
  })

  it('rejects an opening time in the past', () => {
    const result = validateSchedule({ opens_at: '2026-10-20T08:00' }, now)

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/in the future/)
  })

  it('rejects a closing time in the past', () => {
    const result = validateSchedule({ closes_at: '2026-10-20T08:00' }, now)

    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/in the future/)
  })

  it('requires at least one time', () => {
    const result = validateSchedule({}, now)

    expect(result.valid).toBe(false)
  })
})

describe('evaluateSubmissionAuthorization', () => {
  const openWindow = {
    status: 'open' as const,
    canSubmit: true,
    opensAt: null,
    closesAt: null,
    code: 'open' as const,
    message: 'Result submission is open.',
  }

  const base = {
    role: 'agent' as const,
    accountActive: true,
    candidateAccessStatus: 'active' as const,
    window: openWindow,
    stationAssigned: true,
    kind: 'agent' as const,
  }

  it('allows a fully authorised submission', () => {
    const decision = evaluateSubmissionAuthorization(base)

    expect(decision.allowed).toBe(true)
    expect(decision.code).toBe('allowed')
  })

  it('rejects an inactive account', () => {
    const decision = evaluateSubmissionAuthorization({ ...base, accountActive: false })

    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe('account_inactive')
  })

  it('rejects a suspended subscription', () => {
    const decision = evaluateSubmissionAuthorization({
      ...base,
      candidateAccessStatus: 'suspended',
    })

    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe('access_suspended')
  })

  it('rejects a revoked subscription', () => {
    const decision = evaluateSubmissionAuthorization({
      ...base,
      candidateAccessStatus: 'revoked',
    })

    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe('access_revoked')
  })

  it('rejects a user who is not assigned to the polling station', () => {
    const decision = evaluateSubmissionAuthorization({ ...base, stationAssigned: false })

    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe('station_not_assigned')
  })

  it('rejects a submission while the window is closed', () => {
    const decision = evaluateSubmissionAuthorization({
      ...base,
      window: {
        ...openWindow,
        canSubmit: false,
        status: 'closed',
        code: 'closed',
        message: 'Result submission is closed for your team.',
      },
    })

    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe('window_closed')
  })

  it('rejects a role that may not submit', () => {
    const decision = evaluateSubmissionAuthorization({ ...base, role: 'candidate' })

    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe('wrong_role')
  })
})

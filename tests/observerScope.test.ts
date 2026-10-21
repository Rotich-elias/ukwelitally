import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The reporting scope of an observer submission.
 *
 * An observer reports a race at a polling station. The submission may only
 * be authorised by a window that belongs to a candidate that actually reports
 * that race at that station. A window of an unrelated candidate must never
 * authorise the submission.
 */

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

interface QueryHandler {
  match: RegExp
  handler: (text: string, params?: any[]) => any
}

const handlers: QueryHandler[] = []
const executed: Array<{ text: string; params?: any[] }> = []

function respond(rows: any[]) {
  return { rows, rowCount: rows.length }
}

function emptyResult() {
  return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] }
}

const client = {
  query: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    for (const entry of handlers) {
      if (entry.match.test(text)) {
        const result = entry.handler(text, params)
        return result && result.rows ? result : respond(result || [])
      }
    }
    return emptyResult()
  }),
}

vi.mock('@/lib/db', () => ({
  query: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    for (const entry of handlers) {
      if (entry.match.test(text)) {
        const result = entry.handler(text, params)
        return result && result.rows ? result : respond(result || [])
      }
    }
    return emptyResult()
  }),
  queryOne: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    for (const entry of handlers) {
      if (entry.match.test(text)) {
        const result = entry.handler(text, params)
        const rows = result && result.rows ? result.rows : result || []
        return rows[0] || null
      }
    }
    return null
  }),
  queryMany: vi.fn(async (text: string, params?: any[]) => {
    executed.push({ text, params })
    for (const entry of handlers) {
      if (entry.match.test(text)) {
        const result = entry.handler(text, params)
        const rows = result && result.rows ? result.rows : result || []
        return rows
      }
    }
    return []
  }),
  transaction: vi.fn(async (callback: (c: any) => Promise<any>) => callback(client)),
}))

vi.mock('@/lib/audit', () => ({
  recordAudit: vi.fn(async () => undefined),
  auditRequestContext: vi.fn(() => ({ ipAddress: null, userAgent: null })),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => 1),
  notifyAdmins: vi.fn(async () => undefined),
  notifySubmissionOwner: vi.fn(async () => undefined),
}))

import { generateToken } from '@/lib/auth'
import { getObserverWindowContext, resolveObserverReportingScope } from '@/lib/submissionWindow'
import { POST as submissionsPost } from '@/app/api/submissions/route'
import { POST as fallbackPost } from '@/app/api/candidates/observer-submissions/[id]/fallback/route'

const OBSERVER_USER = { id: 102, role: 'observer' as const }
const CANDIDATE_USER = { id: 100, role: 'candidate' as const }
const OTHER_CANDIDATE_USER = { id: 200, role: 'candidate' as const }

const STATION = 55
const OTHER_STATION = 99

function token(user: { id: number; role: string }) {
  return generateToken({
    userId: user.id,
    email: `${user.role}@test.local`,
    role: user.role as any,
  })
}

function openWindow(candidateId: number) {
  return {
    id: candidateId,
    candidate_id: candidateId,
    position: 'mp',
    status: 'open',
    opens_at: null,
    closes_at: null,
    opened_by: 1,
    opened_at: new Date(),
    closed_by: null,
    closed_at: null,
    schedule_cancelled_at: null,
    schedule_cancelled_by: null,
  }
}

function closedWindow(candidateId: number) {
  return {
    ...openWindow(candidateId),
    status: 'closed',
    opened_by: null,
    opened_at: null,
  }
}

/**
 * The scope query only returns candidates that have a team at the station.
 * The test controls what the database reports.
 */
function baseHandlers(overrides: QueryHandler[] = []) {
  handlers.length = 0
  handlers.push(...overrides)
  handlers.push(
    {
      // The observer's station assignment.
      match: /FROM observer_assignments\s+WHERE user_id = \$1 AND status = 'active'/,
      handler: () => [
        {
          id: 1,
          polling_station_id: STATION,
          assignment_type: 'presidential',
          status: 'active',
        },
      ],
    },
    {
      // The reporting scope: candidates with a team at the station.
      match: /SELECT c\.id, MIN\(a\.user_id\) AS user_id\s+FROM candidates c\s+JOIN agents a/,
      handler: () => [],
    },
    {
      match: /SELECT \* FROM polling_stations WHERE id/,
      handler: () => [
        {
          id: STATION,
          name: 'Test Station',
          code: 'PS55',
          registered_voters: 900,
          latitude: null,
          longitude: null,
          location_radius: 500,
        },
      ],
    },
    {
      match: /SELECT \* FROM submission_windows/,
      handler: () => [],
    },
    {
      match: /SELECT id FROM submission_windows/,
      handler: () => [{ id: 1 }],
    },
    {
      match: /INSERT INTO submission_windows/,
      handler: () => [{ id: 1 }],
    },
    {
      match: /UPDATE submission_windows/,
      handler: () => [openWindow(1)],
    },
    {
      match: /SELECT active FROM users/,
      handler: () => [{ active: true }],
    },
    {
      match: /SELECT access_status FROM candidates/,
      handler: () => [{ access_status: 'active' }],
    },
    {
      match: /SELECT id FROM candidates\s+WHERE position = \$1 AND is_placeholder/,
      handler: () => [{ id: 999 }],
    },
    {
      match: /FROM candidates WHERE id = \$1 AND is_placeholder = TRUE/,
      handler: () => [{ position: 'mp' }],
    },
    {
      match: /SELECT id, status FROM submissions/,
      handler: () => [],
    },
    {
      match: /INSERT INTO submissions/,
      handler: () => [
        {
          id: 500,
          polling_station_id: STATION,
          user_id: OBSERVER_USER.id,
          candidate_id: 999,
          submission_type: 'backup',
          submission_origin: 'observer',
          review_status: 'pending_review',
          scope_candidate_id: 1,
          status: 'pending',
          confidence_score: 0,
        },
      ],
    },
    {
      match: /UPDATE submissions SET confidence_score/,
      handler: () => [],
    },
    {
      match: /INSERT INTO audit_logs/,
      handler: () => [{ id: 1 }],
    }
  )
  executed.length = 0
}

describe('resolveObserverReportingScope', () => {
  beforeEach(() => {
    baseHandlers()
  })

  it('only returns candidates that have a team at the polling station', async () => {
    baseHandlers([
      {
        match: /SELECT c\.id, MIN\(a\.user_id\) AS user_id\s+FROM candidates c\s+JOIN agents a/,
        handler: () => [{ id: 7, user_id: 71 }],
      },
    ])

    const scope = await resolveObserverReportingScope(STATION, 'mp')

    expect(scope.candidateIds).toEqual([7])
  })

  it('is empty when no candidate reports that race at that station', async () => {
    const scope = await resolveObserverReportingScope(STATION, 'mp')

    expect(scope.candidateIds).toEqual([])
  })
})

describe('getObserverWindowContext', () => {
  beforeEach(() => {
    baseHandlers()
  })

  it('does not authorise a submission when no candidate reports the race at the station', async () => {
    const context = await getObserverWindowContext(OBSERVER_USER.id, STATION, 'mp')

    expect(context.evaluation.canSubmit).toBe(false)
    expect(context.evaluation.code).toBe('no_window')
    expect(context.candidateIds).toEqual([])
    expect(context.authorisedByCandidateId).toBeNull()
  })

  it('does not authorise a submission from an unrelated open window', async () => {
    // The scope is empty, so the open window of an unrelated candidate (a
    // presidential candidate who is collecting results elsewhere) must not
    // be consulted at all.
    baseHandlers([
      {
        match: /SELECT c\.id, MIN\(a\.user_id\) AS user_id\s+FROM candidates c\s+JOIN agents a/,
        handler: () => [],
      },
      {
        // An unrelated candidate with an open window.
        match: /SELECT \* FROM submission_windows/,
        handler: () => [openWindow(4242)],
      },
    ])

    const context = await getObserverWindowContext(OBSERVER_USER.id, STATION, 'mp')

    expect(context.evaluation.canSubmit).toBe(false)

    // The window of the unrelated candidate was never read.
    const windowReads = executed.filter((entry) => /FROM submission_windows/.test(entry.text))
    expect(windowReads).toHaveLength(0)
  })

  it('authorises a submission when a candidate in the scope has an open window', async () => {
    baseHandlers([
      {
        match: /SELECT c\.id, MIN\(a\.user_id\) AS user_id\s+FROM candidates c\s+JOIN agents a/,
        handler: () => [{ id: 7, user_id: 71 }],
      },
      {
        match: /SELECT \* FROM submission_windows/,
        handler: () => [openWindow(7)],
      },
    ])

    const context = await getObserverWindowContext(OBSERVER_USER.id, STATION, 'mp')

    expect(context.evaluation.canSubmit).toBe(true)
    expect(context.authorisedByCandidateId).toBe(7)
    expect(context.candidateIds).toEqual([7])
  })

  it('does not authorise a submission when the candidate in scope has closed', async () => {
    baseHandlers([
      {
        match: /SELECT c\.id, MIN\(a\.user_id\) AS user_id\s+FROM candidates c\s+JOIN agents a/,
        handler: () => [{ id: 7, user_id: 71 }],
      },
      {
        match: /SELECT \* FROM submission_windows/,
        handler: () => [closedWindow(7)],
      },
    ])

    const context = await getObserverWindowContext(OBSERVER_USER.id, STATION, 'mp')

    expect(context.evaluation.canSubmit).toBe(false)
    expect(context.authorisedByCandidateId).toBeNull()
  })

  it('reads the window of the scope only', async () => {
    baseHandlers([
      {
        match: /SELECT c\.id, MIN\(a\.user_id\) AS user_id\s+FROM candidates c\s+JOIN agents a/,
        handler: () => [{ id: 7, user_id: 71 }],
      },
      {
        match: /SELECT \* FROM submission_windows/,
        handler: () => [openWindow(7)],
      },
    ])

    await getObserverWindowContext(OBSERVER_USER.id, STATION, 'mp')

    const windowReads = executed.filter((entry) => /FROM submission_windows/.test(entry.text))
    expect(windowReads).toHaveLength(1)
    expect(windowReads[0].params?.[0]).toBe(7)
  })
})

describe('observer submission route', () => {
  beforeEach(() => {
    baseHandlers()
  })

  function observerRequest(fields: Record<string, string>) {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    return new NextRequest('http://localhost/api/submissions', {
      method: 'POST',
      body: form,
      headers: { authorization: `Bearer ${token(OBSERVER_USER)}` },
    })
  }

  it('refuses a submission for a station the observer is not assigned to', async () => {
    const response = await submissionsPost(
      observerRequest({
        polling_station_id: String(OTHER_STATION),
        submission_type: 'backup',
        position: 'mp',
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatch(/not assigned to this polling station/)
  })

  it('refuses a submission when no candidate reports the race at the station', async () => {
    const response = await submissionsPost(
      observerRequest({
        polling_station_id: String(STATION),
        submission_type: 'backup',
        position: 'mp',
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.code).toBe('window_closed')
  })

  it('records the candidate whose window authorised the submission', async () => {
    baseHandlers([
      {
        match: /SELECT c\.id, MIN\(a\.user_id\) AS user_id\s+FROM candidates c\s+JOIN agents a/,
        handler: () => [{ id: 7, user_id: 71 }],
      },
      {
        match: /SELECT \* FROM submission_windows/,
        handler: () => [openWindow(7)],
      },
    ])

    const response = await submissionsPost(
      observerRequest({
        polling_station_id: String(STATION),
        submission_type: 'backup',
        position: 'mp',
      }) as any
    )

    expect(response.status).toBe(201)

    const insert = executed.find((entry) => /INSERT INTO submissions/.test(entry.text))
    expect(insert?.text).toContain('scope_candidate_id')
    expect(insert?.params).toContain(7)
  })
})

describe('fallback approval across candidates', () => {
  beforeEach(() => {
    baseHandlers([
      {
        // The candidate that is trying to approve: a candidate for another
        // race, so the station is outside their scope.
        match: /FROM candidates c\s+JOIN users u ON u\.id = c\.user_id/,
        handler: () => [
          {
            id: 999,
            user_id: OTHER_CANDIDATE_USER.id,
            full_name: 'Other Candidate',
            party_name: 'Other Party',
            position: 'governor',
            county_id: 7,
            constituency_id: null,
            ward_id: null,
            access_status: 'active',
          },
        ],
      },
      {
        match: /FROM submissions\s+WHERE id = \$1\s+FOR UPDATE/,
        handler: () => [
          {
            id: 900,
            polling_station_id: STATION,
            user_id: OBSERVER_USER.id,
            submission_origin: 'observer',
            review_status: 'pending_review',
            status: 'pending',
            supersedes_submission_id: null,
          },
        ],
      },
      {
        match: /SELECT position FROM results WHERE submission_id/,
        handler: () => [{ position: 'mp' }],
      },
      {
        match: /SELECT id FROM selected_results/,
        handler: () => [],
      },
      {
        match: /FROM selected_results/,
        handler: () => [],
      },
      {
        match: /JOIN candidates c ON c\.id = s\.candidate_id/,
        handler: () => [],
      },
      {
        match: /FROM observer_assignments/,
        handler: () => [{ id: 1 }],
      },
      {
        // The candidate does not own the scope of the station.
        match: /FROM candidates c\s+JOIN polling_stations ps/,
        handler: () => [],
      },
      {
        match: /INSERT INTO selected_results/,
        handler: () => [
          {
            id: 3,
            polling_station_id: STATION,
            position: 'mp',
            submission_id: 900,
            source: 'observer_fallback',
            approved_by: 100,
            approved_at: new Date(),
          },
        ],
      },
      {
        match: /UPDATE submissions\s+SET review_status = 'approved_fallback'/,
        handler: () => [],
      },
      {
        match: /INSERT INTO audit_logs/,
        handler: () => [{ id: 1 }],
      },
    ])
    executed.length = 0
  })

  it('refuses to approve a submission that is outside the candidate scope', async () => {
    const response = await fallbackPost(
      new NextRequest(
        'http://localhost/api/candidates/observer-submissions/900/fallback',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token(OTHER_CANDIDATE_USER)}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ action: 'approve' }),
        }
      ) as any,
      { params: { id: '900' } }
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('not_in_scope')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The token helpers read JWT_SECRET when their module is first loaded, so a
// real secret has to be in place before the imports below run. vi.hoisted is
// evaluated before the imports.
vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

/**
 * Route level tests for the submission control and fallback workflow.
 *
 * The database is mocked, so these tests exercise the authorization rules
 * that the API applies: who may open a window, who may submit and who may
 * approve a fallback.
 */

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
import { GET as windowGet, POST as windowPost } from '@/app/api/candidates/submission-window/route'
import { POST as fallbackPost } from '@/app/api/candidates/observer-submissions/[id]/fallback/route'
import { GET as submissionsGet, POST as submissionsPost } from '@/app/api/submissions/route'

const CANDIDATE_USER = { id: 100, role: 'candidate' as const }
const AGENT_USER = { id: 101, role: 'agent' as const }
const OBSERVER_USER = { id: 102, role: 'observer' as const }

function token(user: { id: number; role: string }) {
  return generateToken({ userId: user.id, email: `${user.role}@test.local`, role: user.role as any })
}

function request(
  path: string,
  user: { id: number; role: string },
  init: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {}
) {
  return new NextRequest(`http://localhost${path}`, {
    method: init.method || 'GET',
    body: init.body,
    headers: {
      authorization: `Bearer ${token(user)}`,
      ...(init.headers || {}),
    },
  })
}

/** The candidate profile of the logged in candidate. */
const CANDIDATE = {
  id: 10,
  user_id: 100,
  full_name: 'Test Candidate',
  party_name: 'Test Party',
  position: 'mp',
  county_id: 1,
  constituency_id: 2,
  ward_id: undefined,
  access_status: 'active' as const,
}

/** Register the standard handlers and let a test override them. */
function baseHandlers(overrides: QueryHandler[] = []) {
  handlers.length = 0
  // Overrides are registered first so they take precedence.
  handlers.push(...overrides)
  handlers.push(
    {
      match: /FROM candidates c\s+JOIN users u ON u\.id = c\.user_id/,
      handler: () => [CANDIDATE],
    },
    {
      match: /FROM agents a\s+JOIN candidates c ON c\.id = a\.candidate_id/,
      handler: () => [
        { candidate_id: CANDIDATE.id, position: CANDIDATE.position, access_status: CANDIDATE.access_status },
      ],
    },
    {
      match: /SELECT id FROM submission_windows/,
      handler: () => [{ id: 1 }],
    },
    {
      match: /SELECT \* FROM submission_windows/,
      handler: () => [
        {
          id: 1,
          candidate_id: CANDIDATE.id,
          position: CANDIDATE.position,
          status: 'closed',
          opens_at: null,
          closes_at: null,
          opened_by: null,
          opened_at: null,
          closed_by: null,
          closed_at: null,
          schedule_cancelled_at: null,
          schedule_cancelled_by: null,
        },
      ],
    },
    {
      match: /INSERT INTO submission_windows/,
      handler: () => [{ id: 1 }],
    },
    {
      match: /UPDATE submission_windows/,
      handler: (text: string) => [
        {
          id: 1,
          candidate_id: CANDIDATE.id,
          position: CANDIDATE.position,
          status: text.includes("'closed'") ? 'closed' : 'open',
          opens_at: null,
          closes_at: null,
          opened_by: 100,
          opened_at: new Date(),
          closed_by: null,
          closed_at: null,
          schedule_cancelled_at: null,
          schedule_cancelled_by: null,
        },
      ],
    },
    {
      match: /FROM submission_windows/,
      handler: () => [],
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
      match: /SELECT \* FROM polling_stations WHERE id/,
      handler: () => [
        {
          id: 55,
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
      match: /SELECT \* FROM agents WHERE user_id = \$1 AND candidate_id = \$2/,
      handler: () => [
        {
          id: 7,
          user_id: AGENT_USER.id,
          candidate_id: CANDIDATE.id,
          polling_station_id: 55,
          is_primary: true,
        },
      ],
    },
    {
      match: /SELECT is_primary FROM agents/,
      handler: () => [{ is_primary: true }],
    },
    {
      match: /SELECT candidate_id FROM agents WHERE user_id = \$1/,
      handler: () => [{ candidate_id: CANDIDATE.id }],
    },
    {
      match: /SELECT polling_station_id FROM agents/,
      handler: () => [{ polling_station_id: 55 }],
    },
    {
      match: /FROM candidates\s+WHERE position = \$1 AND is_placeholder/,
      handler: () => [{ id: 999 }],
    },
    {
      match: /FROM observer_assignments/,
      handler: () => [
        { id: 1, polling_station_id: 55, assignment_type: 'presidential', status: 'active' },
      ],
    },
    {
      // The candidates that report a race at the polling station.
      match: /SELECT c\.id, MIN\(a\.user_id\) AS user_id\s+FROM candidates c\s+JOIN agents a/,
      handler: () => [{ id: CANDIDATE.id, user_id: AGENT_USER.id }],
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
          polling_station_id: 55,
          user_id: AGENT_USER.id,
          candidate_id: CANDIDATE.id,
          submission_type: 'primary',
          submission_origin: 'agent',
          review_status: null,
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
    },
    {
      match: /SELECT id FROM submission_photos/,
      handler: () => [],
    }
  )
  handlers.push(...overrides)
}

describe('candidate reporting window route', () => {
  beforeEach(() => {
    baseHandlers()
    executed.length = 0
  })

  it('rejects a non candidate', async () => {
    const response = await windowGet(request('/api/candidates/submission-window', AGENT_USER) as any)

    expect(response.status).toBe(403)
  })

  it('opens the window for the owning candidate', async () => {
    const response = await windowPost(
      request('/api/candidates/submission-window', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify({ action: 'open' }),
        headers: { 'content-type': 'application/json' },
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.window.status).toBe('open')
    expect(body.window.can_submit).toBe(true)
  })

  it('closes the window for the owning candidate', async () => {
    const response = await windowPost(
      request('/api/candidates/submission-window', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify({ action: 'close' }),
        headers: { 'content-type': 'application/json' },
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.window.status).toBe('closed')
    expect(body.window.can_submit).toBe(false)
  })

  it('refuses a candidate whose subscription is suspended', async () => {
    baseHandlers([
      {
        match: /FROM candidates c\s+JOIN users u ON u\.id = c\.user_id/,
        handler: () => [{ ...CANDIDATE, access_status: 'suspended' }],
      },
    ])

    const response = await windowPost(
      request('/api/candidates/submission-window', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify({ action: 'open' }),
        headers: { 'content-type': 'application/json' },
      }) as any
    )

    expect(response.status).toBe(403)
  })

  it('rejects an unknown action', async () => {
    const response = await windowPost(
      request('/api/candidates/submission-window', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify({ action: 'delete-everything' }),
        headers: { 'content-type': 'application/json' },
      }) as any
    )

    expect(response.status).toBe(400)
  })
})

describe('result submission route', () => {
  const OPEN_WINDOW = {
    id: 1,
    candidate_id: CANDIDATE.id,
    position: CANDIDATE.position,
    status: 'open',
    opens_at: null,
    closes_at: null,
    opened_by: 100,
    opened_at: new Date(),
    closed_by: null,
    closed_at: null,
    schedule_cancelled_at: null,
    schedule_cancelled_by: null,
  }

  function submissionRequest(
    user: { id: number; role: string },
    fields: Record<string, string>
  ) {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.append(key, value)

    return new NextRequest('http://localhost/api/submissions', {
      method: 'POST',
      body: form,
      headers: { authorization: `Bearer ${token(user)}` },
    })
  }

  beforeEach(() => {
    baseHandlers()
    executed.length = 0
  })

  it('rejects an agent submission while the window is closed', async () => {
    const response = await submissionsPost(
      submissionRequest(AGENT_USER, {
        polling_station_id: '55',
        candidate_id: String(CANDIDATE.id),
        submission_type: 'primary',
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.code).toBe('window_closed')
  })

  it('accepts an agent submission while the window is open', async () => {
    baseHandlers([
      {
        match: /SELECT \* FROM submission_windows/,
        handler: () => [OPEN_WINDOW],
      },
    ])

    const response = await submissionsPost(
      submissionRequest(AGENT_USER, {
        polling_station_id: '55',
        candidate_id: String(CANDIDATE.id),
        submission_type: 'primary',
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.submission.submission_origin).toBe('agent')
  })

  it('rejects a submission from an inactive account', async () => {
    baseHandlers([
      {
        match: /SELECT \* FROM submission_windows/,
        handler: () => [OPEN_WINDOW],
      },
      {
        match: /SELECT active FROM users/,
        handler: () => [{ active: false }],
      },
    ])

    const response = await submissionsPost(
      submissionRequest(AGENT_USER, {
        polling_station_id: '55',
        candidate_id: String(CANDIDATE.id),
        submission_type: 'primary',
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.code).toBe('account_inactive')
  })

  it('rejects a submission when the candidate subscription is suspended', async () => {
    baseHandlers([
      {
        match: /SELECT \* FROM submission_windows/,
        handler: () => [OPEN_WINDOW],
      },
      {
        match: /FROM agents a\s+JOIN candidates c ON c\.id = a\.candidate_id/,
        handler: () => [
          {
            candidate_id: CANDIDATE.id,
            position: CANDIDATE.position,
            access_status: 'suspended',
          },
        ],
      },
    ])

    const response = await submissionsPost(
      submissionRequest(AGENT_USER, {
        polling_station_id: '55',
        candidate_id: String(CANDIDATE.id),
        submission_type: 'primary',
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.code).toBe('access_suspended')
  })

  it('stores an observer submission as an alternative result awaiting review', async () => {
    baseHandlers([
      {
        match: /SELECT \* FROM submission_windows/,
        handler: () => [OPEN_WINDOW],
      },
      {
        match: /FROM observer_assignments/,
        handler: () => [
          { id: 1, polling_station_id: 55, assignment_type: 'presidential', status: 'active' },
        ],
      },
      {
        match: /FROM candidates WHERE id = \$1 AND is_placeholder = TRUE/,
        handler: () => [{ position: 'mp' }],
      },
    ])

    const response = await submissionsPost(
      submissionRequest(OBSERVER_USER, {
        polling_station_id: '55',
        submission_type: 'backup',
        position: 'mp',
      }) as any
    )
    expect(response.status).toBe(201)

    const insert = executed.find((entry) => /INSERT INTO submissions/.test(entry.text))
    expect(insert).toBeDefined()
    expect(insert?.text).toContain('submission_origin')
    expect(insert?.text).toContain('review_status')
    // The observer submission waits for a candidate decision.
    expect(insert?.params).toContain('observer')
    expect(insert?.params).toContain('pending_review')
  })

  it('refuses to let an observer submit a primary result', async () => {
    baseHandlers([
      {
        match: /SELECT \* FROM submission_windows/,
        handler: () => [OPEN_WINDOW],
      },
      {
        match: /FROM observer_assignments/,
        handler: () => [
          { id: 1, polling_station_id: 55, assignment_type: 'presidential', status: 'active' },
        ],
      },
      {
        match: /FROM candidates WHERE id = \$1 AND is_placeholder = TRUE/,
        handler: () => [{ position: 'mp' }],
      },
    ])

    const response = await submissionsPost(
      submissionRequest(OBSERVER_USER, {
        polling_station_id: '55',
        submission_type: 'primary',
        position: 'mp',
      }) as any
    )

    expect(response.status).toBe(400)
  })
})

describe('submission list route', () => {
  beforeEach(() => {
    baseHandlers()
    executed.length = 0
  })

  it('only returns the submissions of the signed in observer', async () => {
    const response = await submissionsGet(
      request('/api/submissions', OBSERVER_USER) as any
    )
    expect(response.status).toBe(200)

    const listQuery = executed.find((entry) => /FROM submissions s/.test(entry.text))
    expect(listQuery?.text).toContain('s.user_id = $1')
    expect(listQuery?.params?.[0]).toBe(OBSERVER_USER.id)
  })

  it('scopes an agent to their own candidate', async () => {
    const response = await submissionsGet(
      request('/api/submissions', AGENT_USER) as any
    )

    expect(response.status).toBe(200)

    const listQuery = executed.find((entry) => /FROM submissions s/.test(entry.text))
    expect(listQuery?.text).toContain('s.candidate_id = $1')
  })
})

describe('observer fallback route', () => {
  beforeEach(() => {
    baseHandlers([
      {
        match: /FROM submissions\s+WHERE id = \$1\s+FOR UPDATE/,
        handler: () => [
          {
            id: 900,
            polling_station_id: 55,
            user_id: OBSERVER_USER.id,
            submission_origin: 'observer',
            review_status: 'pending_review',
            status: 'pending',
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
        match: /FROM candidates c\s+JOIN polling_stations ps/,
        handler: () => [{ id: 1 }],
      },
      {
        match: /INSERT INTO selected_results/,
        handler: () => [
          {
            id: 3,
            polling_station_id: 55,
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

  it('rejects an observer', async () => {
    const response = await fallbackPost(
      request('/api/candidates/observer-submissions/900/fallback', OBSERVER_USER, {
        method: 'POST',
        body: JSON.stringify({ action: 'approve' }),
        headers: { 'content-type': 'application/json' },
      }) as any,
      { params: { id: '900' } }
    )

    expect(response.status).toBe(403)
  })

  it('approves an eligible fallback for the owning candidate', async () => {
    const response = await fallbackPost(
      request('/api/candidates/observer-submissions/900/fallback', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify({ action: 'approve', reason: 'No agent reported' }),
        headers: { 'content-type': 'application/json' },
      }) as any,
      { params: { id: '900' } }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.selected_result.source).toBe('observer_fallback')
    expect(body.selected_result.approved_by).toBe(100)
  })

  it('refuses to approve while an agent result exists', async () => {
    baseHandlers([
      {
        match: /FROM submissions\s+WHERE id = \$1\s+FOR UPDATE/,
        handler: () => [
          {
            id: 900,
            polling_station_id: 55,
            user_id: OBSERVER_USER.id,
            submission_origin: 'observer',
            review_status: 'pending_review',
            status: 'pending',
          },
        ],
      },
      {
        match: /SELECT position FROM results WHERE submission_id/,
        handler: () => [{ position: 'mp' }],
      },
      {
        match: /JOIN candidates c ON c\.id = s\.candidate_id/,
        handler: () => [{ id: 800, status: 'verified' }],
      },
      {
        match: /FROM selected_results/,
        handler: () => [],
      },
      {
        match: /FROM observer_assignments/,
        handler: () => [{ id: 1 }],
      },
      {
        match: /FROM candidates c\s+JOIN polling_stations ps/,
        handler: () => [{ id: 1 }],
      },
    ])

    const response = await fallbackPost(
      request('/api/candidates/observer-submissions/900/fallback', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify({ action: 'approve' }),
        headers: { 'content-type': 'application/json' },
      }) as any,
      { params: { id: '900' } }
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('agent_submission_exists')
  })

  it('requires a reason to reject', async () => {
    const response = await fallbackPost(
      request('/api/candidates/observer-submissions/900/fallback', CANDIDATE_USER, {
        method: 'POST',
        body: JSON.stringify({ action: 'reject' }),
        headers: { 'content-type': 'application/json' },
      }) as any,
      { params: { id: '900' } }
    )

    expect(response.status).toBe(400)
  })
})

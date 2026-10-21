import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The versioned correction workflow.
 *
 * A correction is stored as the next version of a submission. The original
 * submission, its figures and its evidence are never destroyed, and the
 * selected result only follows the approved version.
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
import { POST as submissionsPost } from '@/app/api/submissions/route'
import { POST as resultsPost } from '@/app/api/results/route'

const AGENT_USER = { id: 101, role: 'agent' as const }
const CANDIDATE = { id: 10, position: 'mp', constituency_id: 2, county_id: 1 }
const STATION = 55

function token(user: { id: number; role: string }) {
  return generateToken({
    userId: user.id,
    email: `${user.role}@test.local`,
    role: user.role as any,
  })
}

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

/**
 * The current version of the submission.
 *
 * `currentVersion` decides whether the agent is correcting an earlier
 * version or submitting for the first time.
 */
let currentVersion: {
  id: number
  status: string
  revision_number: number
} | null = null

function baseHandlers(overrides: QueryHandler[] = []) {
  handlers.length = 0
  handlers.push(...overrides)
  handlers.push(
    {
      match: /FROM agents a\s+JOIN candidates c ON c\.id = a\.candidate_id/,
      handler: () => [
        {
          candidate_id: CANDIDATE.id,
          position: CANDIDATE.position,
          access_status: 'active',
        },
      ],
    },
    {
      match: /SELECT \* FROM submission_windows/,
      handler: () => [OPEN_WINDOW],
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
      handler: () => [OPEN_WINDOW],
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
      match: /SELECT \* FROM agents WHERE user_id = \$1 AND candidate_id = \$2/,
      handler: () => [
        {
          id: 7,
          user_id: AGENT_USER.id,
          candidate_id: CANDIDATE.id,
          polling_station_id: STATION,
          is_primary: true,
        },
      ],
    },
    {
      match: /SELECT polling_station_id FROM agents/,
      handler: () => [{ polling_station_id: STATION }],
    },
    {
      match: /SELECT is_primary FROM agents/,
      handler: () => [{ is_primary: true }],
    },
    {
      // The current version of the submission.
      match: /ORDER BY revision_number DESC\s+LIMIT 1/,
      handler: () => (currentVersion ? [currentVersion] : []),
    },
    {
      match: /INSERT INTO submissions/,
      handler: () => [
        {
          id: 501,
          polling_station_id: STATION,
          user_id: AGENT_USER.id,
          candidate_id: CANDIDATE.id,
          submission_type: 'primary',
          submission_origin: 'agent',
          review_status: null,
          scope_candidate_id: CANDIDATE.id,
          supersedes_submission_id: null,
          revision_number: 1,
          revision_reason: null,
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

function agentSubmission(fields: Record<string, string>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return new NextRequest('http://localhost/api/submissions', {
    method: 'POST',
    body: form,
    headers: { authorization: `Bearer ${token(AGENT_USER)}` },
  })
}

describe('agent correction workflow', () => {
  beforeEach(() => {
    currentVersion = null
    baseHandlers()
  })

  it('never deletes the submission it corrects', async () => {
    currentVersion = { id: 400, status: 'flagged', revision_number: 1 }

    const response = await submissionsPost(
      agentSubmission({
        polling_station_id: String(STATION),
        candidate_id: String(CANDIDATE.id),
        submission_type: 'primary',
        revision_reason: 'Corrected the rejected votes total',
      }) as any
    )

    expect(response.status).toBe(201)

    // Nothing is deleted: the original submission and its evidence stay.
    const deletes = executed.filter((entry) => /DELETE FROM/i.test(entry.text))
    expect(deletes).toHaveLength(0)
  })

  it('stores the correction as the next version and links it to the original', async () => {
    currentVersion = { id: 400, status: 'flagged', revision_number: 1 }

    const response = await submissionsPost(
      agentSubmission({
        polling_station_id: String(STATION),
        candidate_id: String(CANDIDATE.id),
        submission_type: 'primary',
        revision_reason: 'Corrected the rejected votes total',
      }) as any
    )

    expect(response.status).toBe(201)

    const insert = executed.find((entry) => /INSERT INTO submissions/.test(entry.text))
    expect(insert?.text).toContain('supersedes_submission_id')
    expect(insert?.text).toContain('revision_number')
    expect(insert?.text).toContain('revision_reason')
    expect(insert?.params).toContain(400) // the submission it corrects
    expect(insert?.params).toContain(2) // the new revision number
  })

  it('requires a reason for a correction', async () => {
    currentVersion = { id: 400, status: 'flagged', revision_number: 1 }

    const response = await submissionsPost(
      agentSubmission({
        polling_station_id: String(STATION),
        candidate_id: String(CANDIDATE.id),
        submission_type: 'primary',
      }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/reason is required/i)
  })

  it('records the correction in the audit trail with user, time and reason', async () => {
    currentVersion = { id: 400, status: 'flagged', revision_number: 1 }

    await submissionsPost(
      agentSubmission({
        polling_station_id: String(STATION),
        candidate_id: String(CANDIDATE.id),
        submission_type: 'primary',
        revision_reason: 'Corrected the rejected votes total',
      }) as any
    )

    const audit = executed.find(
      (entry) => /INSERT INTO audit_logs/.test(entry.text) && /submission_revised/.test(entry.text)
    )
    expect(audit).toBeDefined()

    // The old values record the relationship, the new values the correction.
    const previous = JSON.parse(String(audit?.params?.[2]))
    const correction = JSON.parse(String(audit?.params?.[3]))
    expect(previous.superseded_submission_id).toBe(400)
    expect(correction.revision_reason).toBe('Corrected the rejected votes total')
    expect(correction.corrected_by).toBe(AGENT_USER.id)
    expect(correction.corrected_at).toBeTruthy()
  })

  it('still refuses a second submission while the current version is approved', async () => {
    currentVersion = { id: 400, status: 'verified', revision_number: 1 }

    const response = await submissionsPost(
      agentSubmission({
        polling_station_id: String(STATION),
        candidate_id: String(CANDIDATE.id),
        submission_type: 'primary',
        revision_reason: 'Trying again',
      }) as any
    )

    expect(response.status).toBe(409)
  })
})

describe('approved correction and the selected result', () => {
  beforeEach(() => {
    currentVersion = null
    baseHandlers()
  })

  it('moves the selected result to the approved version and supersedes the old one', async () => {
    baseHandlers([
      {
        // The position of the candidate the submission belongs to.
        match: /SELECT c\.position FROM candidates c WHERE c\.id = \$1/,
        handler: () => [{ position: 'mp' }],
      },
      {
        // The result of the corrected submission.
        match: /SELECT \* FROM submissions WHERE id = \$1/,
        handler: () => [
          {
            id: 501,
            polling_station_id: STATION,
            user_id: AGENT_USER.id,
            candidate_id: CANDIDATE.id,
            submission_type: 'primary',
            submission_origin: 'agent',
            status: 'pending',
            supersedes_submission_id: 400,
            revision_number: 2,
          },
        ],
      },
      {
        // The version the correction replaces.
        match: /SELECT id, status, revision_number, supersedes_submission_id,\s+superseded_by_submission_id, submission_origin\s+FROM submissions\s+WHERE id = \$1/,
        handler: () => [
          {
            id: 400,
            status: 'flagged',
            revision_number: 1,
            supersedes_submission_id: null,
            superseded_by_submission_id: null,
            submission_origin: 'agent',
          },
        ],
      },
      {
        // The selected result still points at the version being corrected.
        match: /FROM selected_results/,
        handler: () => [
          {
            id: 5,
            polling_station_id: STATION,
            position: 'mp',
            submission_id: 400,
            source: 'agent_primary',
            approved_by: null,
            approved_at: null,
          },
        ],
      },
      {
        match: /SELECT id FROM results WHERE submission_id/,
        handler: () => [],
      },
      {
        match: /SELECT id FROM results WHERE submission_id = \$1 AND position = \$2/,
        handler: () => [],
      },
      {
        match: /INSERT INTO results/,
        handler: () => [
          {
            id: 900,
            submission_id: 501,
            polling_station_id: STATION,
            position: 'mp',
            registered_voters: 900,
            total_votes_cast: 500,
            valid_votes: 490,
            rejected_votes: 10,
          },
        ],
      },
      {
        match: /INSERT INTO candidate_votes/,
        handler: () => [],
      },
      {
        match: /UPDATE submissions\s+SET status = 'verified'/,
        handler: () => [],
      },
    ])

    const response = await resultsPost(
      new NextRequest('http://localhost/api/results', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token(AGENT_USER)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          submission_id: 501,
          position: 'mp',
          registered_voters: 900,
          total_votes_cast: 500,
          valid_votes: 490,
          rejected_votes: 10,
          candidate_votes: [
            { candidate_name: 'A', votes: 250 },
            { candidate_name: 'B', votes: 240 },
          ],
          manually_verified: false,
        }),
      }) as any
    )

    expect(response.status).toBe(201)

    // The selected result follows the approved correction.
    const selectionUpdate = executed.find(
      (entry) => /UPDATE selected_results/.test(entry.text)
    )
    expect(selectionUpdate).toBeDefined()
    expect(selectionUpdate?.params?.[0]).toBe(501)

    // The version it replaces is marked as superseded, not deleted.
    const supersede = executed.find(
      (entry) => /UPDATE submissions/.test(entry.text) && /superseded_by_submission_id/.test(entry.text)
    )
    expect(supersede).toBeDefined()
    expect(supersede?.params?.[1]).toContain(400)

    const deletes = executed.filter((entry) => /DELETE FROM/i.test(entry.text))
    expect(deletes).toHaveLength(0)
  })

  it('leaves the existing selected result unchanged when the correction fails', async () => {
    baseHandlers([
      {
        match: /SELECT c\.position FROM candidates c WHERE c\.id = \$1/,
        handler: () => [{ position: 'mp' }],
      },
      {
        match: /SELECT \* FROM submissions WHERE id = \$1/,
        handler: () => [
          {
            id: 501,
            polling_station_id: STATION,
            user_id: AGENT_USER.id,
            candidate_id: CANDIDATE.id,
            submission_type: 'primary',
            submission_origin: 'agent',
            status: 'pending',
            supersedes_submission_id: 400,
            revision_number: 2,
          },
        ],
      },
      {
        match: /SELECT id, status, revision_number, supersedes_submission_id,\s+superseded_by_submission_id, submission_origin\s+FROM submissions\s+WHERE id = \$1/,
        handler: () => [
          {
            id: 400,
            status: 'flagged',
            revision_number: 1,
            supersedes_submission_id: null,
            superseded_by_submission_id: null,
            submission_origin: 'agent',
          },
        ],
      },
      {
        match: /FROM selected_results/,
        handler: () => [
          {
            id: 5,
            polling_station_id: STATION,
            position: 'mp',
            submission_id: 400,
            source: 'agent_primary',
            approved_by: null,
            approved_at: null,
          },
        ],
      },
      {
        match: /SELECT id FROM results WHERE submission_id = \$1 AND position = \$2/,
        handler: () => [],
      },
      {
        // The write fails, so the transaction is rolled back.
        match: /INSERT INTO results/,
        handler: () => {
          throw new Error('database is unavailable')
        },
      },
    ])

    const response = await resultsPost(
      new NextRequest('http://localhost/api/results', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token(AGENT_USER)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          submission_id: 501,
          position: 'mp',
          registered_voters: 900,
          total_votes_cast: 500,
          valid_votes: 490,
          rejected_votes: 10,
          candidate_votes: [
            { candidate_name: 'A', votes: 250 },
            { candidate_name: 'B', votes: 240 },
          ],
          manually_verified: false,
        }),
      }) as any
    )

    expect(response.status).toBe(500)

    // The selected result was not touched and the version that was
    // corrected was not marked as superseded.
    const selectionUpdates = executed.filter((entry) =>
      /UPDATE selected_results/.test(entry.text)
    )
    expect(selectionUpdates).toHaveLength(0)

    const supersede = executed.filter(
      (entry) => /UPDATE submissions/.test(entry.text) && /superseded_by_submission_id/.test(entry.text)
    )
    expect(supersede).toHaveLength(0)
  })
})

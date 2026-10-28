import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Submission evidence is private.
 *
 * The submitter, the candidate of the team and an administrator may read it.
 * Nobody else, and the public upload route never serves it.
 */

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret-not-used-anywhere-else'
})

interface QueryHandler {
  match: RegExp
  handler: (text: string, params?: any[]) => any
}

const handlers: QueryHandler[] = []

function respond(rows: any[]) {
  return { rows, rowCount: rows.length }
}

function emptyResult() {
  return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] }
}

const client = {
  query: vi.fn(async (text: string, params?: any[]) => {
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
    for (const entry of handlers) {
      if (entry.match.test(text)) {
        const result = entry.handler(text, params)
        return result && result.rows ? result : respond(result || [])
      }
    }
    return emptyResult()
  }),
  queryOne: vi.fn(async (text: string, params?: any[]) => {
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

// The evidence is served from a fake storage backend.
const storedFiles: Record<string, { data: Buffer; contentType: string }> = {}

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>()
  return {
    ...actual,
    getStorage: () => ({
      name: 'local',
      durable: false,
      put: async (key: string, data: Buffer) => ({ key, url: null }),
      get: async (key: string) => storedFiles[key] || null,
    }),
  }
})

import { generateToken } from '@/lib/auth'
import { GET as evidenceGet } from '@/app/api/submission-photos/[id]/route'
import { GET as uploadsGet } from '@/app/api/uploads/[...path]/route'

const SUBMITTER = { id: 201, role: 'agent' as const }
const CANDIDATE_OWNER = { id: 100, role: 'candidate' as const }
const SCOPE_CANDIDATE_OWNER = { id: 200, role: 'candidate' as const }
const OTHER_CANDIDATE = { id: 300, role: 'candidate' as const }
const REVIEWING_CANDIDATE = { id: 400, role: 'candidate' as const }
const ADMIN = { id: 2, role: 'admin' as const }

function token(user: { id: number; role: string }) {
  return generateToken({
    userId: user.id,
    email: `${user.role}@test.local`,
    role: user.role as any,
  })
}

function request(path: string, user?: { id: number; role: string }) {
  return new NextRequest(`http://localhost${path}`, {
    headers: user ? { authorization: `Bearer ${token(user)}` } : {},
  })
}

function baseHandlers(overrides: QueryHandler[] = []) {
  handlers.length = 0
  handlers.push(...overrides)
  handlers.push({
    match: /FROM submission_photos sp/,
    handler: () => [
      {
        id: 30,
        file_path: '/submission-125/photo.png',
        submission_id: 125,
        submitted_by: SUBMITTER.id,
        candidate_id: 10,
        candidate_user_id: CANDIDATE_OWNER.id,
        scope_candidate_id: null,
        scope_candidate_user_id: null,
      },
    ],
  })
}

describe('the submission evidence route', () => {
  beforeEach(() => {
    baseHandlers()
    storedFiles['submission-125/photo.png'] = {
      data: Buffer.from('evidence'),
      contentType: 'image/png',
    }
  })

  it('serves the evidence to the submitter', async () => {
    const response = await evidenceGet(
      request('/api/submission-photos/30', SUBMITTER) as any,
      { params: { id: '30' } }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
  })

  it('serves the evidence to the candidate of the team', async () => {
    const response = await evidenceGet(
      request('/api/submission-photos/30', CANDIDATE_OWNER) as any,
      { params: { id: '30' } }
    )

    expect(response.status).toBe(200)
  })

  it('serves the evidence to an administrator', async () => {
    const response = await evidenceGet(
      request('/api/submission-photos/30', ADMIN) as any,
      { params: { id: '30' } }
    )

    expect(response.status).toBe(200)
  })

  it('serves the evidence to the candidate that owns the observer scope', async () => {
    baseHandlers([
      {
        match: /FROM submission_photos sp/,
        handler: () => [
          {
            id: 30,
            file_path: '/submission-125/photo.png',
            submission_id: 125,
            submitted_by: SUBMITTER.id,
            candidate_id: 10,
            candidate_user_id: null,
            scope_candidate_id: 11,
            scope_candidate_user_id: SCOPE_CANDIDATE_OWNER.id,
          },
        ],
      },
    ])

    const response = await evidenceGet(
      request('/api/submission-photos/30', SCOPE_CANDIDATE_OWNER) as any,
      { params: { id: '30' } }
    )

    expect(response.status).toBe(200)
  })

  it('serves the evidence to a candidate whose electoral scope covers it', async () => {
    baseHandlers([
      {
        match: /JOIN candidates c ON c\.user_id = \$1/,
        handler: () => [{ allowed: true }],
      },
    ])

    const response = await evidenceGet(
      request('/api/submission-photos/30', REVIEWING_CANDIDATE) as any,
      { params: { id: '30' } }
    )

    expect(response.status).toBe(200)
  })

  it('refuses a candidate of another team', async () => {
    const response = await evidenceGet(
      request('/api/submission-photos/30', OTHER_CANDIDATE) as any,
      { params: { id: '30' } }
    )

    expect(response.status).toBe(403)
  })

  it('refuses an anonymous request', async () => {
    const response = await evidenceGet(
      request('/api/submission-photos/30') as any,
      { params: { id: '30' } }
    )

    expect(response.status).toBe(401)
  })

  it('reports a photo that does not exist', async () => {
    baseHandlers([
      {
        match: /FROM submission_photos sp/,
        handler: () => [],
      },
    ])

    const response = await evidenceGet(
      request('/api/submission-photos/999', CANDIDATE_OWNER) as any,
      { params: { id: '999' } }
    )

    expect(response.status).toBe(404)
  })

  it('reports a file that is no longer in storage', async () => {
    // The row is in the database but the bytes are gone, for example after a
    // move from an ephemeral disk. The caller shows a placeholder.
    delete storedFiles['submission-125/photo.png']

    const response = await evidenceGet(
      request('/api/submission-photos/30', CANDIDATE_OWNER) as any,
      { params: { id: '30' } }
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toMatch(/no longer available/)
  })

  it('rejects an invalid photo id', async () => {
    const response = await evidenceGet(
      request('/api/submission-photos/abc', CANDIDATE_OWNER) as any,
      { params: { id: 'abc' } }
    )

    expect(response.status).toBe(400)
  })
})

describe('the public upload route', () => {
  beforeEach(() => {
    baseHandlers()
    storedFiles['candidate-photos/photo.png'] = {
      data: Buffer.from('photo'),
      contentType: 'image/png',
    }
  })

  it('serves a candidate photo', async () => {
    const response = await uploadsGet(
      request('/api/uploads/candidate-photos/photo.png') as any,
      { params: { path: ['candidate-photos', 'photo.png'] } }
    )

    expect(response.status).toBe(200)
  })

  it('does not serve submission evidence', async () => {
    const response = await uploadsGet(
      request('/api/uploads/submission-125/photo.png') as any,
      { params: { path: ['submission-125', 'photo.png'] } }
    )

    // The answer is a 404 so the route does not confirm which files exist.
    expect(response.status).toBe(404)
  })

  it('refuses a path traversal', async () => {
    const response = await uploadsGet(
      request('/api/uploads/..%2F..%2Fetc%2Fpasswd') as any,
      { params: { path: ['..', '..', 'etc', 'passwd'] } }
    )

    expect(response.status).toBe(400)
  })
})

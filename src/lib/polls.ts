import crypto from 'crypto'
import { queryMany, queryOne, transaction } from '@/lib/db'

/**
 * Shared helpers for opinion polls.
 *
 * Opinion polls are intentionally kept apart from the election result tables.
 * A poll is created by a candidate or an administrator, shared as a public
 * link and voted on once per browser. Nothing in this module writes to
 * `results`, `submissions` or `selected_results`.
 */

export type PollStatus = 'draft' | 'open' | 'closed' | 'archived'

export interface OpinionPoll {
  id: number
  slug: string
  title: string
  description: string | null
  created_by: number | null
  candidate_id: number | null
  status: PollStatus
  is_public: boolean
  starts_at: string
  ends_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  creator_name?: string | null
  candidate_name?: string | null
}

export interface OpinionPollOption {
  id: number
  poll_id: number
  label: string
  description: string | null
  sort_order: number
  votes: number
}

export interface OpinionPollWithOptions extends OpinionPoll {
  options: OpinionPollOption[]
  total_votes: number
}

export const MAX_POLL_OPTIONS = 12

export function isPollManager(role: string): boolean {
  return role === 'admin' || role === 'candidate'
}

/** Turn a title into a URL-safe slug. */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)

  return slug || 'opinion-poll'
}

/** Find a slug that is not taken yet. */
export async function uniquePollSlug(base: string): Promise<string> {
  const root = slugify(base)
  let candidate = root
  let suffix = 2

  // A handful of polls share a title at most; the loop is bounded so a
  // pathological database cannot hang the request.
  for (let attempt = 0; attempt < 50; attempt++) {
    const existing = await queryOne<{ id: number }>(
      'SELECT id FROM opinion_polls WHERE slug = $1',
      [candidate]
    )
    if (!existing) return candidate
    candidate = `${root}-${suffix++}`
  }

  return `${root}-${crypto.randomBytes(4).toString('hex')}`
}

export async function getPollBySlug(slug: string): Promise<OpinionPollWithOptions | null> {
  const poll = await queryOne<OpinionPoll>(
    `SELECT p.*, u.full_name AS creator_name, c.full_name AS candidate_name
       FROM opinion_polls p
       LEFT JOIN users u ON u.id = p.created_by
       LEFT JOIN candidates c ON c.id = p.candidate_id
      WHERE p.slug = $1`,
    [slug]
  )

  if (!poll) return null

  return attachOptions(poll)
}

export async function getPollById(id: number): Promise<OpinionPollWithOptions | null> {
  const poll = await queryOne<OpinionPoll>(
    `SELECT p.*, u.full_name AS creator_name, c.full_name AS candidate_name
       FROM opinion_polls p
       LEFT JOIN users u ON u.id = p.created_by
       LEFT JOIN candidates c ON c.id = p.candidate_id
      WHERE p.id = $1`,
    [id]
  )

  if (!poll) return null

  return attachOptions(poll)
}

async function attachOptions(poll: OpinionPoll): Promise<OpinionPollWithOptions> {
  const options = await queryMany<OpinionPollOption>(
    `SELECT o.id, o.poll_id, o.label, o.description, o.sort_order,
            COUNT(v.id)::int AS votes
       FROM opinion_poll_options o
       LEFT JOIN opinion_poll_votes v ON v.option_id = o.id
      WHERE o.poll_id = $1
      GROUP BY o.id
      ORDER BY o.sort_order, o.id`,
    [poll.id]
  )

  const totalVotes = options.reduce((sum, option) => sum + Number(option.votes || 0), 0)

  return { ...poll, options, total_votes: totalVotes }
}

/**
 * True when the poll is accepting votes right now. A closed or archived poll
 * never accepts a vote, and the optional ends_at date is enforced here rather
 * than trusted from the browser.
 */
export function isPollOpen(poll: Pick<OpinionPoll, 'status' | 'starts_at' | 'ends_at'>, now = new Date()): boolean {
  if (poll.status !== 'open') return false
  if (poll.starts_at && new Date(poll.starts_at).getTime() > now.getTime()) return false
  if (poll.ends_at && new Date(poll.ends_at).getTime() <= now.getTime()) return false
  return true
}

/** The candidate profile that owns a candidate account, if any. */
export async function getCandidateProfileForUser(userId: number): Promise<{
  id: number
  access_status: string
} | null> {
  return queryOne<{ id: number; access_status: string }>(
    'SELECT id, access_status FROM candidates WHERE user_id = $1',
    [userId]
  )
}

export interface CreatePollInput {
  title: string
  description?: string | null
  options: Array<{ label: string; description?: string | null }>
  createdBy: number | null
  candidateId?: number | null
  endsAt?: string | null
  isPublic?: boolean
}

export interface ParsedPollInput {
  title: string
  description: string
  options: Array<{ label: string; description: string | null }>
  endsAt: string | null
}

export type PollInputResult =
  | { ok: true; value: ParsedPollInput }
  | { ok: false; error: string }

/**
 * Validate the body of a poll-create request.
 *
 * Shared by the signed-in manager endpoint and the public, account-free
 * endpoint so both enforce exactly the same limits. Only the shape of the
 * poll is checked here; authorization stays with the caller.
 */
export function parsePollInput(body: any): PollInputResult {
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const rawOptions = Array.isArray(body?.options) ? body.options : []
  const endsAt = typeof body?.ends_at === 'string' && body.ends_at ? body.ends_at : null

  if (title.length < 3 || title.length > 200) {
    return { ok: false, error: 'Poll title must be between 3 and 200 characters' }
  }

  if (description.length > 1000) {
    return { ok: false, error: 'Poll description must be at most 1000 characters' }
  }

  if (rawOptions.length < 2) {
    return { ok: false, error: 'A poll needs at least two options' }
  }
  if (rawOptions.length > MAX_POLL_OPTIONS) {
    return { ok: false, error: `A poll can have at most ${MAX_POLL_OPTIONS} options` }
  }

  const options: Array<{ label: string; description: string | null }> = []
  const seen = new Set<string>()

  for (const raw of rawOptions) {
    const label = typeof raw === 'string' ? raw : raw?.label
    const rawDescription = typeof raw === 'object' && raw ? raw.description : null
    const trimmed = typeof label === 'string' ? label.trim() : ''

    if (!trimmed || trimmed.length > 120) {
      return { ok: false, error: 'Every option needs a label of 1 to 120 characters' }
    }

    const optionDescription = typeof rawDescription === 'string' ? rawDescription.trim() : ''
    if (optionDescription.length > 300) {
      return { ok: false, error: 'Option descriptions must be at most 300 characters' }
    }

    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      return { ok: false, error: 'Poll options must be unique' }
    }
    seen.add(key)

    options.push({ label: trimmed, description: optionDescription || null })
  }

  if (endsAt) {
    const parsed = new Date(endsAt)
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: 'Invalid poll end date' }
    }
    if (parsed.getTime() <= Date.now()) {
      return { ok: false, error: 'The poll end date must be in the future' }
    }
  }

  return { ok: true, value: { title, description, options, endsAt } }
}

export async function createOpinionPoll(input: CreatePollInput): Promise<OpinionPollWithOptions> {
  const slug = await uniquePollSlug(input.title)

  const poll = await transaction(async (client) => {
    const inserted = await client.query<OpinionPoll>(
      `INSERT INTO opinion_polls
         (slug, title, description, created_by, candidate_id, status, is_public, ends_at)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7)
       RETURNING *`,
      [
        slug,
        input.title.trim(),
        input.description?.trim() || null,
        input.createdBy,
        input.candidateId ?? null,
        input.isPublic !== false,
        input.endsAt || null,
      ]
    )

    const record = inserted.rows[0]

    for (const [index, option] of input.options.entries()) {
      await client.query(
        `INSERT INTO opinion_poll_options (poll_id, label, description, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [record.id, option.label.trim(), option.description?.trim() || null, index]
      )
    }

    return record
  })

  return (await getPollById(poll.id))!
}

/**
 * Fingerprint used to prevent one browser from voting repeatedly without
 * storing a raw IP address. The secret is the deployment's JWT secret when
 * available so the same visitor produces the same hash on every instance.
 */
export function voterFingerprint(pollSlug: string, ip: string, userAgent: string): string {
  const secret = process.env.JWT_SECRET || 'ukwelitally-opinion-poll'
  return crypto
    .createHmac('sha256', secret)
    .update(`${pollSlug}:${ip}:${userAgent}`)
    .digest('hex')
}

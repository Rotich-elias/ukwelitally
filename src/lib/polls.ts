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
  created_by: number
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
       JOIN users u ON u.id = p.created_by
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
       JOIN users u ON u.id = p.created_by
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
  createdBy: number
  candidateId?: number | null
  endsAt?: string | null
  isPublic?: boolean
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

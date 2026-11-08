import { queryMany, queryOne, transaction, type PoolClient } from '@/lib/db'

/**
 * Archive-and-reset helpers.
 *
 * A reset exists for test data and dry runs. It never deletes users,
 * candidates, agents, observers or polling stations: only the result chain and
 * opinion poll rows are removed. Before anything is removed, the exact rows are
 * written to `data_archives` as JSON, together with the actor and counts, so the
 * record of the cleared data survives the reset.
 */

export type ResetKind = 'election' | 'opinion_polls'

export interface ResetPreview {
  kind: ResetKind
  label: string
  counts: Record<string, number>
}

const ELECTION_TABLES: Array<{ key: string; table: string }> = [
  { key: 'selected_results', table: 'selected_results' },
  { key: 'candidate_votes', table: 'candidate_votes' },
  { key: 'results', table: 'results' },
  { key: 'submission_reviews', table: 'submission_reviews' },
  { key: 'submission_photos', table: 'submission_photos' },
  { key: 'discrepancies', table: 'discrepancies' },
  { key: 'submissions', table: 'submissions' },
]

const POLL_TABLES: Array<{ key: string; table: string }> = [
  { key: 'opinion_poll_votes', table: 'opinion_poll_votes' },
  { key: 'opinion_poll_options', table: 'opinion_poll_options' },
  { key: 'opinion_polls', table: 'opinion_polls' },
]

async function countTable(client: PoolClient, table: string): Promise<number> {
  const result = await client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${table}`)
  return Number(result.rows[0]?.count || 0)
}

async function snapshotTable(client: PoolClient, table: string): Promise<any[]> {
  const result = await client.query<{ data: any[] }>(
    `SELECT COALESCE(json_agg(to_jsonb(t)), '[]'::json) AS data FROM ${table} t`
  )
  return result.rows[0]?.data || []
}

export async function getResetPreview(kind: ResetKind): Promise<ResetPreview> {
  const tables = kind === 'election' ? ELECTION_TABLES : POLL_TABLES
  const counts: Record<string, number> = {}

  for (const entry of tables) {
    const row = await queryOne<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${entry.table}`)
    counts[entry.key] = Number(row?.count || 0)
  }

  return {
    kind,
    label:
      kind === 'election'
        ? 'Election results, submissions and evidence'
        : 'Opinion polls, options and votes',
    counts,
  }
}

async function reset(
  kind: ResetKind,
  actorId: number | null,
  label: string | null,
  notes: string | null
): Promise<{ archiveId: number; counts: Record<string, number> }> {
  const tables = kind === 'election' ? ELECTION_TABLES : POLL_TABLES

  return transaction(async (client) => {
    // Serialise concurrent resets so two administrators cannot archive the
    // same rows and then both attempt to delete them.
    await client.query('SELECT pg_advisory_xact_lock($1)', [kind === 'election' ? 4711 : 4712])

    const payload: Record<string, any[]> = {}
    const counts: Record<string, number> = {}

    for (const entry of tables) {
      payload[entry.key] = await snapshotTable(client, entry.table)
      counts[entry.key] = payload[entry.key].length
    }

    const archive = await client.query<{ id: number }>(
      `INSERT INTO data_archives (kind, label, notes, archived_by, record_counts, payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [kind, label, notes, actorId, JSON.stringify(counts), JSON.stringify(payload)]
    )

    // Remove the child rows before the parents. The order is explicit rather
    // than relying on cascade rules so a schema change cannot silently leave
    // orphaned vote rows behind.
    for (const entry of tables) {
      await client.query(`DELETE FROM ${entry.table}`)
    }

    return { archiveId: archive.rows[0].id, counts }
  })
}

export function resetElectionData(params: {
  actorId: number | null
  label?: string | null
  notes?: string | null
}) {
  return reset('election', params.actorId, params.label ?? null, params.notes ?? null)
}

export function resetOpinionPollData(params: {
  actorId: number | null
  label?: string | null
  notes?: string | null
}) {
  return reset('opinion_polls', params.actorId, params.label ?? null, params.notes ?? null)
}

export async function listArchives(limit = 10): Promise<
  Array<{
    id: number
    kind: ResetKind
    label: string | null
    notes: string | null
    archived_by: number | null
    archived_by_name: string | null
    record_counts: Record<string, number>
    created_at: string
  }>
> {
  return queryMany(
    `SELECT a.id, a.kind, a.label, a.notes, a.archived_by, u.full_name AS archived_by_name,
            a.record_counts, a.created_at
       FROM data_archives a
       LEFT JOIN users u ON u.id = a.archived_by
      ORDER BY a.created_at DESC
      LIMIT $1`,
    [limit]
  )
}

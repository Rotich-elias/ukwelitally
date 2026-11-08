'use client'

import { useCallback, useEffect, useState } from 'react'

interface ResetPreview {
  kind: 'election' | 'opinion_polls'
  label: string
  counts: Record<string, number>
}

interface Archive {
  id: number
  kind: 'election' | 'opinion_polls'
  label: string | null
  notes: string | null
  archived_by_name: string | null
  record_counts: Record<string, number>
  created_at: string
}

const COUNT_LABELS: Record<string, string> = {
  selected_results: 'Selected station results',
  candidate_votes: 'Candidate vote rows',
  results: 'Result sheets',
  submission_reviews: 'Review decisions',
  submission_photos: 'Evidence photos',
  discrepancies: 'Discrepancies',
  submissions: 'Submissions',
  opinion_poll_votes: 'Poll votes',
  opinion_poll_options: 'Poll options',
  opinion_polls: 'Opinion polls',
}

const CONFIRMATIONS: Record<string, string> = {
  election: 'RESET ELECTION DATA',
  opinion_polls: 'RESET OPINION POLLS',
}

export default function ResetManager() {
  const [previews, setPreviews] = useState<ResetPreview[]>([])
  const [archives, setArchives] = useState<Archive[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmation, setConfirmation] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busyKind, setBusyKind] = useState<string | null>(null)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcResult, setRecalcResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    setLoading(true)
    try {
      const response = await fetch('/api/admin/reset', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load reset preview')
      setPreviews(data.previews || [])
      setArchives(data.archives || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load reset preview')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const performReset = async (kind: 'election' | 'opinion_polls') => {
    setError('')
    setSuccess('')
    setBusyKind(kind)
    try {
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Please sign in again')
      const response = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kind,
          confirmation: confirmation[kind] || '',
          notes: notes[kind] || '',
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to reset data')

      const countSummary = Object.entries(data.counts || {})
        .filter(([, value]) => Number(value) > 0)
        .map(([key, value]) => `${value} ${COUNT_LABELS[key]?.toLowerCase() || key}`)
        .join(', ')

      setSuccess(
        `${kind === 'election' ? 'Election' : 'Opinion poll'} data archived as #${data.archive_id}${
          countSummary ? ` (${countSummary})` : ''
        }.`
      )
      setConfirmation((current) => ({ ...current, [kind]: '' }))
      setNotes((current) => ({ ...current, [kind]: '' }))
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to reset data')
    } finally {
      setBusyKind(null)
    }
  }

  const recalculateConfidence = async () => {
    setError('')
    setSuccess('')
    setRecalcResult(null)
    setRecalculating(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Please sign in again')
      const response = await fetch('/api/admin/confidence/recalculate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to recalculate confidence')
      setRecalcResult(
        `Recalculated ${data.updated} submission${data.updated === 1 ? '' : 's'}${
          data.failed ? `, ${data.failed} could not be scored` : ''
        }.`
      )
    } catch (err: any) {
      setError(err.message || 'Failed to recalculate confidence')
    } finally {
      setRecalculating(false)
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-4">
        <p className="text-sm font-semibold text-amber-200">This is a destructive maintenance action</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
          Resets remove test and dry-run data from the live tables, but the rows are first archived in the database.
          Users, ballot candidates, agents, observers and polling stations are never deleted. Results disappear from
          the public tally immediately after a reset.
        </p>
      </div>

      {loading ? (
        <div className="glass-effect rounded-2xl p-8 text-center text-sm text-dark-400">Loading reset preview…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {previews.map((preview) => (
            <div key={preview.kind} className="glass-effect flex flex-col rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">{preview.label}</h3>
                  <p className="mt-1 text-xs text-dark-500">
                    {preview.kind === 'election'
                      ? 'Submissions, results, candidate votes and evidence metadata.'
                      : 'Opinion polls, their options and every recorded vote.'}
                  </p>
                </div>
                <span className="rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">
                  {preview.kind === 'election' ? 'Election' : 'Polls'}
                </span>
              </div>

              <dl className="mt-4 space-y-1.5">
                {Object.entries(preview.counts).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <dt className="text-dark-400">{COUNT_LABELS[key] || key}</dt>
                    <dd className={value > 0 ? 'font-semibold text-white' : 'text-dark-500'}>{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                <label className="text-xs font-medium text-dark-300">
                  Type <span className="font-mono text-amber-300">{CONFIRMATIONS[preview.kind]}</span> to confirm
                </label>
                <input
                  value={confirmation[preview.kind] || ''}
                  onChange={(event) =>
                    setConfirmation((current) => ({ ...current, [preview.kind]: event.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm"
                  placeholder={CONFIRMATIONS[preview.kind]}
                />
                <input
                  value={notes[preview.kind] || ''}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [preview.kind]: event.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm"
                  placeholder="Reason (optional), e.g. clearing dry-run data"
                />
                <button
                  onClick={() => performReset(preview.kind)}
                  disabled={
                    busyKind === preview.kind ||
                    (confirmation[preview.kind] || '').trim().toUpperCase() !== CONFIRMATIONS[preview.kind]
                  }
                  className="w-full rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyKind === preview.kind
                    ? 'Archiving and resetting…'
                    : preview.kind === 'election'
                      ? 'Archive & reset election data'
                      : 'Archive & reset opinion polls'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="glass-effect rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Recalculate confidence scores</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-dark-400">
              Re-scores existing submissions from persisted evidence: GPS distance, photo types, OCR result, arithmetic
              validation, timeliness and anomaly flags. Run this once after deploying the confidence update.
            </p>
          </div>
          <button
            onClick={recalculateConfidence}
            disabled={recalculating}
            className="btn-secondary px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {recalculating ? 'Recalculating…' : 'Recalculate all'}
          </button>
        </div>
        {recalcResult && <p className="mt-3 text-sm text-emerald-300">{recalcResult}</p>}
      </div>

      <div className="glass-effect rounded-2xl p-5">
        <h3 className="text-base font-semibold text-white">Archive history</h3>
        {archives.length === 0 ? (
          <p className="mt-3 text-sm text-dark-500">No resets have been archived yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-white/[0.06]">
            {archives.map((archive) => (
              <div key={archive.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm text-dark-200">
                    <span className="font-semibold text-white">#{archive.id}</span>{' '}
                    {archive.label || (archive.kind === 'election' ? 'Election reset' : 'Opinion poll reset')}
                  </p>
                  <p className="mt-0.5 text-xs text-dark-500">
                    {archive.archived_by_name ? `by ${archive.archived_by_name} · ` : ''}
                    {new Date(archive.created_at).toLocaleString()}
                    {archive.notes ? ` · ${archive.notes}` : ''}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dark-400">
                  {archive.kind === 'election' ? 'Election' : 'Polls'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

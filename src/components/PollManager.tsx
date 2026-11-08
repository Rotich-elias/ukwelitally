'use client'

import { useCallback, useEffect, useState } from 'react'

interface PollOption {
  id: number
  label: string
  description: string | null
  votes: number
}

interface Poll {
  id: number
  slug: string
  title: string
  description: string | null
  status: 'draft' | 'open' | 'closed' | 'archived'
  total_votes: number
  option_count?: number
  ends_at: string | null
  created_at: string
  share_path: string
  candidate_name?: string | null
  options?: PollOption[]
}

const statusStyles: Record<string, string> = {
  open: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
  closed: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
  archived: 'border-white/10 bg-white/[0.04] text-dark-400',
  draft: 'border-white/10 bg-white/[0.04] text-dark-400',
}

export default function PollManager() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    ends_at: '',
    options: ['', ''],
  })

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  const fetchPolls = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const response = await fetch('/api/polls', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load polls')
      setPolls(data.polls || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load polls')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchPolls()
  }, [fetchPolls])

  const updateOption = (index: number, value: string) => {
    setForm((current) => {
      const options = [...current.options]
      options[index] = value
      return { ...current, options }
    })
  }

  const addOption = () => {
    setForm((current) =>
      current.options.length >= 12
        ? current
        : { ...current, options: [...current.options, ''] }
    )
  }

  const removeOption = (index: number) => {
    setForm((current) =>
      current.options.length <= 2
        ? current
        : { ...current, options: current.options.filter((_, i) => i !== index) }
    )
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setCreating(true)
    try {
      if (!token) throw new Error('Please sign in again')
      const response = await fetch('/api/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          ends_at: form.ends_at || null,
          options: form.options.map((label) => label.trim()).filter(Boolean),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create poll')

      setSuccess(`Poll created. Share link: ${window.location.origin}${data.share_path}`)
      setForm({ title: '', description: '', ends_at: '', options: ['', ''] })
      setShowForm(false)
      await fetchPolls()
    } catch (err: any) {
      setError(err.message || 'Failed to create poll')
    } finally {
      setCreating(false)
    }
  }

  const changeStatus = async (poll: Poll, status: 'open' | 'closed') => {
    setError('')
    setSuccess('')
    setBusyId(poll.id)
    try {
      if (!token) throw new Error('Please sign in again')
      const response = await fetch(`/api/polls/${poll.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to update poll')
      setSuccess(status === 'closed' ? 'Poll closed' : 'Poll reopened')
      await fetchPolls()
    } catch (err: any) {
      setError(err.message || 'Failed to update poll')
    } finally {
      setBusyId(null)
    }
  }

  const archivePoll = async (poll: Poll) => {
    if (!window.confirm(`Archive "${poll.title}"? Its votes stay in the database.`)) return
    setError('')
    setSuccess('')
    setBusyId(poll.id)
    try {
      if (!token) throw new Error('Please sign in again')
      const response = await fetch(`/api/polls/${poll.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to archive poll')
      setSuccess('Poll archived')
      await fetchPolls()
    } catch (err: any) {
      setError(err.message || 'Failed to archive poll')
    } finally {
      setBusyId(null)
    }
  }

  const copyShareLink = async (poll: Poll) => {
    const url = `${window.location.origin}/polls/${poll.slug}`
    try {
      await navigator.clipboard.writeText(url)
      setSuccess('Share link copied to the clipboard')
    } catch {
      setSuccess(`Share link: ${url}`)
    }
  }

  const toggleResults = async (poll: Poll) => {
    if (expandedId === poll.id) {
      setExpandedId(null)
      return
    }
    try {
      if (!token) return
      const response = await fetch(`/api/polls/${poll.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (response.ok && data.poll) {
        setPolls((current) =>
          current.map((entry) =>
            entry.id === poll.id ? { ...entry, ...data.poll } : entry
          )
        )
      }
    } catch {
      // The list already has the vote count; opening the detail is best effort.
    }
    setExpandedId(poll.id)
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Your opinion polls</h2>
          <p className="mt-1 text-sm text-dark-400">
            Ask a question, add options and share the public link. Polls are not part of the election tally.
          </p>
        </div>
        <button onClick={() => setShowForm((value) => !value)} className="btn-primary px-4 py-2.5">
          {showForm ? 'Cancel' : '+ Create poll'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="glass-effect space-y-4 rounded-2xl p-5">
          <div>
            <label className="field-label">Question</label>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
              minLength={3}
              maxLength={200}
              className="w-full px-4 py-3 text-sm"
              placeholder="Who do you think will win the presidential race?"
            />
          </div>
          <div>
            <label className="field-label">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={2}
              className="w-full px-4 py-3 text-sm"
              placeholder="Add context for the people you share the poll with"
            />
          </div>
          <div>
            <label className="field-label">Options</label>
            <div className="space-y-2">
              {form.options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                    required={index < 2}
                    maxLength={120}
                    className="w-full px-4 py-2.5 text-sm"
                    placeholder={`Option ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    disabled={form.options.length <= 2}
                    className="rounded-lg border border-white/10 px-3 py-2.5 text-sm text-dark-300 transition-colors hover:text-white disabled:opacity-30"
                    aria-label={`Remove option ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOption}
              disabled={form.options.length >= 12}
              className="mt-2 text-sm font-medium text-brand-300 transition-colors hover:text-brand-200 disabled:opacity-40"
            >
              + Add option
            </button>
          </div>
          <div>
            <label className="field-label">Closes (optional)</label>
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(event) => setForm({ ...form, ends_at: event.target.value })}
              className="w-full px-4 py-3 text-sm sm:max-w-xs"
            />
          </div>
          <button type="submit" disabled={creating} className="btn-primary px-5 py-2.5">
            {creating ? 'Creating…' : 'Create and get link'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="glass-effect rounded-2xl p-8 text-center text-sm text-dark-400">Loading polls…</div>
      ) : polls.length === 0 ? (
        <div className="glass-effect rounded-2xl p-8 text-center">
          <p className="text-sm text-dark-300">You have not created an opinion poll yet.</p>
          <p className="mt-1 text-xs text-dark-500">Create one and share it on WhatsApp, X or any other channel.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {polls.map((poll) => (
            <div key={poll.id} className="glass-effect rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-white">{poll.title}</h3>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusStyles[poll.status] || statusStyles.draft}`}>
                      {poll.status}
                    </span>
                  </div>
                  {poll.description && <p className="mt-1 text-sm text-dark-400">{poll.description}</p>}
                  <p className="mt-2 text-xs text-dark-500">
                    {poll.total_votes} vote{poll.total_votes === 1 ? '' : 's'} · {poll.option_count || poll.options?.length || 0} options
                    {poll.ends_at ? ` · closes ${new Date(poll.ends_at).toLocaleString()}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => copyShareLink(poll)} className="btn-secondary px-3 py-2 text-xs">
                    Copy link
                  </button>
                  <a
                    href={`/polls/${poll.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary px-3 py-2 text-xs"
                  >
                    Open
                  </a>
                  <button
                    onClick={() => toggleResults(poll)}
                    className="btn-secondary px-3 py-2 text-xs"
                  >
                    {expandedId === poll.id ? 'Hide results' : 'Results'}
                  </button>
                  {poll.status === 'open' ? (
                    <button
                      onClick={() => changeStatus(poll, 'closed')}
                      disabled={busyId === poll.id}
                      className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/15 disabled:opacity-50"
                    >
                      Close
                    </button>
                  ) : poll.status === 'closed' ? (
                    <button
                      onClick={() => changeStatus(poll, 'open')}
                      disabled={busyId === poll.id}
                      className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
                    >
                      Reopen
                    </button>
                  ) : null}
                  <button
                    onClick={() => archivePoll(poll)}
                    disabled={busyId === poll.id}
                    className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>
              </div>

              {expandedId === poll.id && poll.options && (
                <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                  {poll.options.map((option) => {
                    const percentage = poll.total_votes > 0 ? (option.votes / poll.total_votes) * 100 : 0
                    return (
                      <div key={option.id}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-dark-200">{option.label}</span>
                          <span className="font-semibold text-white">
                            {option.votes} ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

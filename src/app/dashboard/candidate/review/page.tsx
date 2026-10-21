'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import DashboardNav from '@/components/DashboardNav'
import SafeImage from '@/components/SafeImage'

/**
 * The observer review queue.
 *
 * Observer submissions are alternative results. They never replace an agent
 * result on their own: the candidate reviews them and may approve one as
 * the fallback for a polling station that has no agent result.
 */

interface ObserverSubmission {
  id: number
  polling_station_id: number
  polling_station_name: string
  polling_station_code: string
  ward_name: string
  constituency_name: string
  county_name: string
  observer_name: string
  observer_email: string
  observer_phone: string
  submitted_at: string
  review_status: string
  review_reason: string | null
  status: string
  confidence_score: number
  registered_voters: number
  total_votes_cast: number
  valid_votes: number
  rejected_votes: number
  photo_count: number | string
  has_agent_submission: boolean
  agent_submission_id: number | null
  agent_name: string | null
  agent_submission_status: string | null
  approvable: boolean
  not_approvable_reason: string | null
  submitted_votes: Array<{
    candidate_name: string
    party_name: string | null
    votes: number
  }>
  photos?: Array<{ id: number; photo_type: string; file_path: string }>
}

interface Conflict {
  id: number
  polling_station_name: string
  position: string
  agent_name: string | null
  observer_name: string | null
  status: string
  selected_source: string | null
  created_at: string
}

const FILTERS = [
  { value: 'pending_review', label: 'Awaiting review' },
  { value: 'approved_fallback', label: 'Approved fallbacks' },
  { value: 'rejected_fallback', label: 'Rejected fallbacks' },
  { value: 'all', label: 'All observer submissions' },
]

export default function ObserverReviewPage() {
  const [submissions, setSubmissions] = useState<ObserverSubmission[]>([])
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [filter, setFilter] = useState('pending_review')
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const [queueResponse, conflictResponse] = await Promise.all([
        fetch(`/api/candidates/observer-submissions?status=${filter}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/candidates/submission-conflicts?status=open', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (queueResponse.ok) {
        const body = await queueResponse.json()
        setSubmissions(body.submissions || [])
      } else {
        const body = await queueResponse.json().catch(() => ({}))
        setError(body.error || 'Could not load the review queue')
      }

      if (conflictResponse.ok) {
        const body = await conflictResponse.json()
        setConflicts(body.conflicts || [])
      }
    } catch (err) {
      console.error('Failed to load the review queue:', err)
      setError('Could not load the review queue')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  const decide = async (submission: ObserverSubmission, action: 'approve' | 'reject') => {
    const reason = (reasons[submission.id] || '').trim()

    if (action === 'reject' && !reason) {
      setError('A reason is required when rejecting an observer submission.')
      return
    }

    const warning =
      action === 'approve'
        ? `Approve this observer result as the fallback for ${submission.polling_station_name}?\n\nIt becomes the selected result for this polling station. The original submission is kept.`
        : `Reject this observer result for ${submission.polling_station_name}?\n\nThe submission is kept for the record.`

    if (!window.confirm(warning)) return

    setWorkingId(submission.id)
    setError(null)
    setNotice(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(
        `/api/candidates/observer-submissions/${submission.id}/fallback`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action, reason: reason || null }),
        }
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error || 'The decision could not be recorded')
        return
      }
      setNotice(body.message)
      await load()
    } catch (err) {
      console.error('Failed to record the fallback decision:', err)
      setError('The decision could not be recorded')
    } finally {
      setWorkingId(null)
    }
  }

  const resolveConflict = async (conflict: Conflict, action: 'accept_agent' | 'keep_fallback') => {
    const warning =
      action === 'accept_agent'
        ? `Use the agent result as the result for ${conflict.polling_station_name}?\n\nThe approved observer fallback is kept in the record but is no longer the selected result.`
        : `Keep the approved observer fallback as the result for ${conflict.polling_station_name}?`

    if (!window.confirm(warning)) return

    setWorkingId(conflict.id)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(
        `/api/candidates/submission-conflicts/${conflict.id}/resolve`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action }),
        }
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error || 'The conflict could not be resolved')
        return
      }
      setNotice(body.message)
      await load()
    } catch (err) {
      console.error('Failed to resolve the conflict:', err)
      setError('The conflict could not be resolved')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Observer Review Queue</h1>
            <p className="text-dark-300">
              Alternative results submitted by your observers. A fallback can only be approved when
              no agent result exists for that polling station.
            </p>
          </div>
          <Link href="/dashboard/candidate" className="btn-secondary text-sm py-2 text-center">
            Back to dashboard
          </Link>
        </div>

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/40 rounded-lg px-4 py-3">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
        {notice && (
          <div className="mb-4 bg-emerald-500/10 border border-emerald-500/40 rounded-lg px-4 py-3">
            <p className="text-emerald-300 text-sm">{notice}</p>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="glass-effect rounded-xl p-6 mb-8 border border-orange-500/30">
            <h2 className="text-lg font-bold text-white mb-1">Conflicts to resolve</h2>
            <p className="text-sm text-dark-300 mb-4">
              An agent result arrived for a station where you already approved an observer
              fallback. The approved fallback was not replaced. Choose which result stands.
            </p>
            <div className="space-y-3">
              {conflicts.map((conflict) => (
                <div
                  key={conflict.id}
                  className="bg-dark-800/50 border border-orange-500/30 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-white font-medium">{conflict.polling_station_name}</p>
                    <p className="text-xs text-dark-400">
                      {conflict.position.toUpperCase()} · agent: {conflict.agent_name || 'unknown'} ·
                      observer: {conflict.observer_name || 'unknown'} · selected:{' '}
                      {conflict.selected_source === 'observer_fallback'
                        ? 'approved observer fallback'
                        : 'agent result'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveConflict(conflict, 'accept_agent')}
                      disabled={workingId === conflict.id}
                      className="btn-primary text-xs py-2 disabled:opacity-50"
                    >
                      Use agent result
                    </button>
                    <button
                      onClick={() => resolveConflict(conflict, 'keep_fallback')}
                      disabled={workingId === conflict.id}
                      className="btn-secondary text-xs py-2 disabled:opacity-50"
                    >
                      Keep fallback
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="glass-effect rounded-xl p-6">
          <div className="flex flex-wrap gap-2 mb-5">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  filter === option.value
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                    : 'border-dark-700 text-dark-300 hover:border-blue-500/40 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-10 text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <p className="text-dark-400 text-sm mt-2">Loading submissions...</p>
            </div>
          ) : submissions.length === 0 ? (
            <p className="text-dark-400 text-sm py-6 text-center">
              There are no observer submissions in this view.
            </p>
          ) : (
            <div className="space-y-4">
              {submissions.map((submission) => (
                <div
                  key={submission.id}
                  className="bg-dark-800/50 border border-dark-700 rounded-lg p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <p className="text-white font-semibold">
                        {submission.polling_station_name}
                      </p>
                      <p className="text-xs text-dark-400">
                        {submission.polling_station_code} · {submission.ward_name} ·{' '}
                        {submission.constituency_name} · {submission.county_name}
                      </p>
                      <p className="text-xs text-dark-400 mt-1">
                        Observer: {submission.observer_name} ({submission.observer_email}) · submitted{' '}
                        {new Date(submission.submitted_at).toLocaleString('en-KE')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block px-3 py-1 rounded-lg text-xs font-semibold border ${
                          submission.review_status === 'approved_fallback'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                            : submission.review_status === 'rejected_fallback'
                              ? 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                              : 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                        }`}
                      >
                        {submission.review_status === 'approved_fallback'
                          ? 'Approved fallback'
                          : submission.review_status === 'rejected_fallback'
                            ? 'Rejected'
                            : 'Awaiting review'}
                      </span>
                      <p className="text-xs text-dark-400 mt-2">
                        {submission.photo_count} photo(s) · confidence {submission.confidence_score}%
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-4 gap-3 mb-4 text-sm">
                    <div>
                      <p className="text-xs text-dark-400">Registered voters</p>
                      <p className="text-white font-medium">
                        {Number(submission.registered_voters).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-400">Votes cast</p>
                      <p className="text-white font-medium">
                        {Number(submission.total_votes_cast).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-400">Valid votes</p>
                      <p className="text-white font-medium">
                        {Number(submission.valid_votes).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-400">Rejected votes</p>
                      <p className="text-white font-medium">
                        {Number(submission.rejected_votes).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {submission.submitted_votes.length > 0 && (
                    <div className="bg-dark-900/40 border border-dark-700 rounded-lg p-3 mb-4">
                      <p className="text-xs text-dark-400 uppercase tracking-wide mb-2">
                        Submitted figures
                      </p>
                      <div className="space-y-1">
                        {submission.submitted_votes.map((vote) => (
                          <div key={vote.candidate_name} className="flex justify-between text-sm">
                            <span className="text-dark-200">
                              {vote.candidate_name}
                              {vote.party_name ? ` (${vote.party_name})` : ''}
                            </span>
                            <span className="text-white font-medium">
                              {Number(vote.votes).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {submission.photos && submission.photos.length > 0 && (
                    <div className="bg-dark-900/40 border border-dark-700 rounded-lg p-3 mb-4">
                      <p className="text-xs text-dark-400 uppercase tracking-wide mb-2">
                        Supporting evidence
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {submission.photos.map((photo: any) => (
                          <a
                            key={photo.id}
                            href={photo.file_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <SafeImage
                              src={photo.file_path}
                              alt={String(photo.photo_type || 'evidence').replace(/_/g, ' ')}
                              className="w-full h-20 object-cover rounded border border-dark-700"
                              fallback={
                                <div className="w-full h-20 rounded bg-dark-800 border border-dark-700 flex items-center justify-center text-[10px] text-dark-500">
                                  Unavailable
                                </div>
                              }
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {submission.has_agent_submission && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mb-4">
                      <p className="text-xs text-orange-300">
                        An agent result already exists for this station (
                        {submission.agent_name}, {submission.agent_submission_status}). A fallback
                        cannot be used while the agent result is present.
                      </p>
                    </div>
                  )}

                  {submission.review_status === 'pending_review' && (
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-dark-400 mb-1">
                          Reason (required to reject)
                        </label>
                        <input
                          type="text"
                          value={reasons[submission.id] || ''}
                          onChange={(e) =>
                            setReasons({ ...reasons, [submission.id]: e.target.value })
                          }
                          placeholder="e.g. Agent did not report for this station"
                          className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => decide(submission, 'approve')}
                          disabled={workingId === submission.id || !submission.approvable}
                          title={
                            submission.approvable
                              ? undefined
                              : submission.not_approvable_reason || undefined
                          }
                          className="btn-primary text-sm py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Approve fallback
                        </button>
                        <button
                          onClick={() => decide(submission, 'reject')}
                          disabled={workingId === submission.id}
                          className="btn-secondary text-sm py-2 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {!submission.approvable && submission.review_status === 'pending_review' && (
                    <p className="mt-3 text-xs text-orange-300">
                      {submission.not_approvable_reason}
                    </p>
                  )}

                  {submission.review_reason && (
                    <p className="mt-3 text-xs text-dark-400">
                      Reviewer note: {submission.review_reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

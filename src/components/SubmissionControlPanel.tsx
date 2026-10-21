'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * The candidate controlled reporting window.
 *
 * Shows the current state of the window, the buttons to open, close or
 * schedule it, and the submission counters for the candidate's team. Every
 * action is confirmed before it is sent, because opening or closing the
 * window changes what every agent and observer in the team can do.
 */

interface WindowState {
  id: number | null
  status: 'closed' | 'open' | 'scheduled' | 'expired'
  can_submit: boolean
  message: string
  opens_at: string | null
  closes_at: string | null
  opens_at_display: string
  closes_at_display: string
}

interface Summary {
  agent_primary: number
  observer_alternative: number
  awaiting_review: number
  approved_fallback: number
  rejected_fallback: number
  stations_without_agent: number
  stations_with_conflicts: number
  total_stations: number
  agents_affected: number
  observers_affected: number
}

interface WindowResponse {
  window: WindowState
  access_status: 'active' | 'suspended' | 'revoked'
  summary: Summary
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  closed: { label: 'Closed', className: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  expired: { label: 'Expired', className: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
}

export default function SubmissionControlPanel() {
  const [data, setData] = useState<WindowResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [schedule, setSchedule] = useState({ opens_at: '', closes_at: '' })

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/candidates/submission-window', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        setData(await response.json())
      } else {
        const body = await response.json().catch(() => ({}))
        setError(body.error || 'Could not load the reporting window')
      }
    } catch (err) {
      console.error('Failed to load the reporting window:', err)
      setError('Could not load the reporting window')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const send = async (action: string, extra: Record<string, unknown> = {}) => {
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/candidates/submission-window', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...extra }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error || 'The reporting window could not be updated')
        return
      }
      setNotice(body.message)
      setShowSchedule(false)
      setSchedule({ opens_at: '', closes_at: '' })
      await load()
    } catch (err) {
      console.error('Failed to update the reporting window:', err)
      setError('The reporting window could not be updated')
    } finally {
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <div className="glass-effect rounded-xl p-6 mb-8">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        <p className="text-dark-400 text-sm mt-2">Loading the reporting window...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="glass-effect rounded-xl p-6 mb-8 border border-red-500/30">
        <p className="text-red-400 text-sm">{error || 'The reporting window is unavailable.'}</p>
      </div>
    )
  }

  const { window: reportingWindow, summary, access_status } = data
  const status = STATUS_STYLES[reportingWindow.status] || STATUS_STYLES.closed
  const suspended = access_status !== 'active'

  const counters = [
    { label: 'Agent results', value: summary.agent_primary, tone: 'text-emerald-400' },
    { label: 'Observer results', value: summary.observer_alternative, tone: 'text-blue-400' },
    { label: 'Awaiting review', value: summary.awaiting_review, tone: 'text-orange-400' },
    { label: 'Approved fallbacks', value: summary.approved_fallback, tone: 'text-purple-400' },
    { label: 'Rejected fallbacks', value: summary.rejected_fallback, tone: 'text-slate-400' },
    { label: 'Stations missing an agent', value: summary.stations_without_agent, tone: 'text-orange-400' },
    { label: 'Stations in conflict', value: summary.stations_with_conflicts, tone: 'text-red-400' },
  ]

  return (
    <div className="glass-effect rounded-xl p-6 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Result Submission</h2>
            <p className="text-sm text-dark-300">
              Control when your agents and observers can submit results
            </p>
          </div>
        </div>
        <span
          className={`px-4 py-2 rounded-lg border text-sm font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      {suspended && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 rounded-lg p-4">
          <p className="text-red-300 text-sm">
            Your subscription is {access_status}. An administrator has to restore your access
            before you can open result submission.
          </p>
        </div>
      )}

      <div className="bg-dark-800/50 border border-dark-700 rounded-lg p-4 mb-5">
        <p className="text-sm text-dark-200">{reportingWindow.message}</p>
        <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-dark-400">Opens: </span>
            <span className="text-white font-medium">{reportingWindow.opens_at_display}</span>
          </div>
          <div>
            <span className="text-dark-400">Closes: </span>
            <span className="text-white font-medium">{reportingWindow.closes_at_display}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-dark-400">
          {summary.agents_affected} agent{summary.agents_affected === 1 ? '' : 's'} and{' '}
          {summary.observers_affected} observer{summary.observers_affected === 1 ? '' : 's'} are
          affected by this window.
        </p>
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

      <div className="flex flex-wrap gap-3">
        {reportingWindow.status === 'open' ? (
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Close result submission?\n\nYour agents and observers will not be able to submit results until you open the window again.'
                )
              ) {
                send('close')
              }
            }}
            disabled={working || suspended}
            className="btn-secondary text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Close Result Submission
          </button>
        ) : (
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Open result submission?\n\nYour agents and observers will be able to submit results immediately.'
                )
              ) {
                send('open')
              }
            }}
            disabled={working || suspended}
            className="btn-primary text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Open Result Submission
          </button>
        )}

        <button
          onClick={() => setShowSchedule((value) => !value)}
          disabled={working || suspended}
          className="w-full sm:w-auto btn-secondary text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {showSchedule ? 'Cancel' : 'Schedule'}
        </button>

        {reportingWindow.status === 'scheduled' && (
          <button
            onClick={() => {
              if (window.confirm('Cancel the scheduled reporting window?')) {
                send('cancel_schedule')
              }
            }}
            disabled={working}
            className="w-full sm:w-auto btn-secondary text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel Schedule
          </button>
        )}

        <Link
          href="/dashboard/candidate/review"
          className="w-full sm:w-auto btn-secondary text-sm py-2 text-center"
        >
          Review Observer Submissions
        </Link>
      </div>

      {showSchedule && (
        <div className="mt-4 bg-dark-800/50 border border-dark-700 rounded-lg p-4">
          <p className="text-sm text-dark-300 mb-3">
            Times are read as East Africa Time. The window opens and closes on the server, so it
            applies even when you are not signed in.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-dark-400 mb-1">Opens at</label>
              <input
                type="datetime-local"
                value={schedule.opens_at}
                onChange={(e) => setSchedule({ ...schedule, opens_at: e.target.value })}
                className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-dark-400 mb-1">Closes at</label>
              <input
                type="datetime-local"
                value={schedule.closes_at}
                onChange={(e) => setSchedule({ ...schedule, closes_at: e.target.value })}
                className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={() => {
                if (
                  window.confirm(
                    'Schedule the reporting window?\n\nSubmission stays closed until the opening time.'
                  )
                ) {
                  send('schedule', schedule)
                }
              }}
              disabled={working || !schedule.opens_at}
              className="btn-primary text-sm py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Schedule
            </button>
          </div>
        </div>
      )}

      {/* Submission summary */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-white mb-3">Submission summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {counters.map((counter) => (
            <div key={counter.label} className="bg-dark-800/50 border border-dark-700 rounded-lg p-3">
              <p className="text-xs text-dark-400 uppercase tracking-wide">{counter.label}</p>
              <p className={`text-xl font-bold ${counter.tone}`}>{counter.value}</p>
            </div>
          ))}
          <div className="bg-dark-800/50 border border-dark-700 rounded-lg p-3">
            <p className="text-xs text-dark-400 uppercase tracking-wide">Stations in scope</p>
            <p className="text-xl font-bold text-white">{summary.total_stations}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

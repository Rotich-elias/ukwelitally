'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'

interface PollOption {
  id: number
  label: string
  description: string | null
  votes: number
}

interface Poll {
  slug: string
  title: string
  description: string | null
  status: string
  is_open: boolean
  total_votes: number
  options: PollOption[]
  creator_name?: string | null
  candidate_name?: string | null
  ends_at: string | null
}

function getVoterKey(slug: string): string {
  const storageKey = `ukwelitally_poll_voter_${slug}`
  try {
    const existing = localStorage.getItem(storageKey)
    if (existing) return existing
    const value =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(storageKey, value)
    return value
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

export default function PublicPollPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const [poll, setPoll] = useState<Poll | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [voting, setVoting] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchPoll = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const response = await fetch(`/api/polls/public/${slug}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Poll not found')
      setPoll(data.poll)
    } catch (err: any) {
      setError(err.message || 'Poll not found')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchPoll()
  }, [fetchPoll])

  useEffect(() => {
    if (!slug) return
    try {
      setHasVoted(localStorage.getItem(`ukwelitally_poll_voted_${slug}`) === '1')
    } catch {
      setHasVoted(false)
    }
  }, [slug])

  const showResults = hasVoted || (poll ? !poll.is_open : false)

  const winner = useMemo(() => {
    if (!poll || poll.options.length === 0) return null
    return poll.options.reduce((best, option) => (option.votes > best.votes ? option : best), poll.options[0])
  }, [poll])

  const vote = async () => {
    if (!slug || !selected) {
      setError('Choose an option before voting')
      return
    }
    setError('')
    setVoting(true)
    try {
      const response = await fetch(`/api/polls/public/${slug}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: selected, voter_key: getVoterKey(slug) }),
      })
      const data = await response.json()
      if (response.status === 409) {
        try {
          localStorage.setItem(`ukwelitally_poll_voted_${slug}`, '1')
        } catch {}
        setHasVoted(true)
        if (data.poll) setPoll(data.poll)
        return
      }
      if (!response.ok) throw new Error(data.error || 'Failed to record your vote')
      if (data.poll) setPoll(data.poll)
      try {
        localStorage.setItem(`ukwelitally_poll_voted_${slug}`, '1')
      } catch {}
      setHasVoted(true)
    } catch (err: any) {
      setError(err.message || 'Failed to record your vote')
    } finally {
      setVoting(false)
    }
  }

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: poll?.title || 'Opinion poll', url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PublicNav active="home" />

      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        {loading ? (
          <div className="glass-effect rounded-3xl p-10 text-center text-sm text-dark-400">Loading poll…</div>
        ) : error && !poll ? (
          <div className="glass-effect rounded-3xl p-10 text-center">
            <p className="text-lg font-semibold text-white">Poll not found</p>
            <p className="mt-2 text-sm text-dark-400">{error}</p>
            <Link href="/" className="btn-primary mt-6 inline-flex px-5 py-2.5">
              Back home
            </Link>
          </div>
        ) : poll ? (
          <div className="glass-effect rounded-3xl p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-brand">Opinion poll</span>
              {poll.candidate_name && (
                <span className="badge border-white/10 bg-white/[0.03] text-dark-300">{poll.candidate_name}</span>
              )}
              <span
                className={`badge border ${
                  poll.is_open
                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-400/25 bg-amber-500/10 text-amber-300'
                }`}
              >
                {poll.is_open ? 'Open' : 'Closed'}
              </span>
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{poll.title}</h1>
            {poll.description && <p className="mt-3 text-sm leading-relaxed text-dark-300">{poll.description}</p>}
            <p className="mt-3 text-xs text-dark-500">
              {poll.total_votes} vote{poll.total_votes === 1 ? '' : 's'}
              {poll.ends_at ? ` · closes ${new Date(poll.ends_at).toLocaleString()}` : ''}
            </p>

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {!showResults ? (
              <div className="mt-6 space-y-2.5">
                {poll.options.map((option) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                      selected === option.id
                        ? 'border-brand-400/40 bg-brand-500/10'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="poll-option"
                      value={option.id}
                      checked={selected === option.id}
                      onChange={() => setSelected(option.id)}
                      className="mt-1 h-4 w-4 accent-cyan-400"
                    />
                    <span>
                      <span className="block text-sm font-medium text-white">{option.label}</span>
                      {option.description && <span className="mt-0.5 block text-xs text-dark-400">{option.description}</span>}
                    </span>
                  </label>
                ))}

                <button
                  onClick={vote}
                  disabled={voting || !selected}
                  className="btn-primary mt-4 w-full px-5 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {voting ? 'Recording your vote…' : 'Vote'}
                </button>
                <p className="text-center text-[11px] text-dark-500">One vote per browser. No account needed.</p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {hasVoted && <p className="text-sm text-emerald-300">Thanks for voting. Here is how the poll stands.</p>}
                {poll.options.map((option) => {
                  const percentage = poll.total_votes > 0 ? (option.votes / poll.total_votes) * 100 : 0
                  return (
                    <div key={option.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className={`${winner?.id === option.id ? 'font-semibold text-white' : 'text-dark-200'}`}>
                          {option.label}
                        </span>
                        <span className="font-semibold text-white">
                          {option.votes} · {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                <p className="text-xs text-dark-500">
                  This is an opinion poll, not the official election tally.
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-2 border-t border-white/[0.06] pt-5">
              <button onClick={share} className="btn-secondary px-4 py-2.5 text-sm">
                {copied ? 'Link copied' : 'Share this poll'}
              </button>
              <Link href="/presidential-results" className="btn-secondary px-4 py-2.5 text-sm">
                Live results
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

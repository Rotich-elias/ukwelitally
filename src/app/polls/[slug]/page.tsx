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
  const [votedOptionId, setVotedOptionId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchPoll = useCallback(async (silent = false) => {
    if (!slug) return
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`/api/polls/public/${slug}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Poll not found')
      setPoll(data.poll)
      setError('')
    } catch (err: any) {
      // A background refresh must not replace a poll that is already on
      // screen with an error; the next refresh can recover.
      if (!silent) setError(err.message || 'Poll not found')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchPoll()
  }, [fetchPoll])

  useEffect(() => {
    if (!slug) return
    try {
      setHasVoted(localStorage.getItem(`ukwelitally_poll_voted_${slug}`) === '1')
      const choice = Number(localStorage.getItem(`ukwelitally_poll_choice_${slug}`))
      setVotedOptionId(Number.isInteger(choice) && choice > 0 ? choice : null)
    } catch {
      setHasVoted(false)
      setVotedOptionId(null)
    }
  }, [slug])

  const showResults = hasVoted || (poll ? !poll.is_open : false)

  // Once the results are on screen they stay current: a voter who has just
  // voted can watch the poll move, and a shared link shows the same tally to
  // everyone. Refreshing also runs when the tab becomes visible again.
  useEffect(() => {
    if (!showResults || !slug) return

    const refresh = () => {
      if (document.visibilityState === 'visible') void fetchPoll(true)
    }

    const interval = window.setInterval(refresh, 20_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [showResults, slug, fetchPoll])

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
        // Another tab may have cast the vote, so pull the current counts
        // instead of showing the numbers from before this attempt.
        void fetchPoll(true)
        return
      }
      if (!response.ok) throw new Error(data.error || 'Failed to record your vote')
      if (data.poll) setPoll(data.poll)
      try {
        localStorage.setItem(`ukwelitally_poll_voted_${slug}`, '1')
        localStorage.setItem(`ukwelitally_poll_choice_${slug}`, String(selected))
      } catch {}
      setVotedOptionId(selected)
      setHasVoted(true)
      // Re-read the poll so the results are complete even when the vote
      // response did not carry the updated counts.
      void fetchPoll(true)
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
          <>
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
                <p className="text-center text-[11px] text-dark-500">
                  One vote per browser. Results appear as soon as you vote.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="border-b border-white/[0.06] pb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-dark-300">
                    Live results
                  </h2>
                  <p className="mt-1 text-xs text-dark-500">
                    {hasVoted
                      ? 'Thanks for voting. Results update automatically.'
                      : poll.is_open
                        ? 'Results from everyone who has voted so far.'
                        : 'This poll is closed. Final results.'}
                  </p>
                </div>
                {poll.options.map((option) => {
                  const percentage = poll.total_votes > 0 ? (option.votes / poll.total_votes) * 100 : 0
                  return (
                    <div key={option.id}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className={`${winner?.id === option.id ? 'font-semibold text-white' : 'text-dark-200'}`}>
                          {option.label}
                          {votedOptionId === option.id && (
                            <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                              Your vote
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-semibold text-white">
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

            {/* App advert: poll visitors are potential agents, observers and
                candidates, so this points them at the verified tally. */}
            <aside className="glass-effect relative mt-6 overflow-hidden rounded-3xl p-6 sm:p-8">
              <div className="glow-orb -right-20 -top-24 h-56 w-56 bg-brand-500/20" />
              <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-xl">
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/icons/icon-72x72.webp"
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-xl ring-1 ring-white/10"
                    />
                    <span className="text-base font-semibold tracking-tight text-white">
                      Ukweli<span className="gradient-text">Tally</span>
                    </span>
                  </div>

                  <h2 className="mt-4 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    Beyond the poll: results you can verify
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-dark-400">
                    Every result on UkweliTally is backed by Form 34A photos, GPS
                    checks and a confidence score you can inspect. Follow the live
                    national tally, or join as an agent or observer.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-dark-400">
                    {['Evidence photos', 'GPS checks', 'Live national tally'].map((item) => (
                      <span key={item} className="inline-flex items-center gap-1.5">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        {item}
                      </span>
                    ))}
                  </div>

                  <Link
                    href="/polls/create"
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-300 transition-colors hover:text-brand-200"
                  >
                    Create your own poll — no account needed
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:w-48">
                  <Link href="/" className="btn-primary justify-center px-5 py-3 text-sm">
                    Explore UkweliTally
                  </Link>
                  <Link
                    href="/presidential-results"
                    className="btn-secondary justify-center px-5 py-3 text-sm"
                  >
                    See live results
                  </Link>
                </div>
              </div>
            </aside>
          </>
        ) : null}
      </div>

      <footer className="mt-10 border-t border-white/[0.06] bg-dark-950/50">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 text-xs text-dark-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-dark-500">
            © {new Date().getFullYear()} UkweliTally. Not affiliated with IEBC.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/" className="transition-colors hover:text-white">Home</Link>
            <Link href="/privacy" className="transition-colors hover:text-white">Privacy policy</Link>
            <Link href="/terms" className="transition-colors hover:text-white">Terms &amp; conditions</Link>
            <a href="mailto:elgeiy8@gmail.com" className="transition-colors hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import PageHeader from '@/components/PageHeader'

interface ResultsData {
  candidate_name: string
  party_name: string
  total_votes: number
  percentage: number
  polling_stations_count: number
  profile_photo?: string
  candidate_number?: string
  position?: string
  official_name?: string
  electoral_area?: string
}

interface Summary {
  total_votes_cast: number
  registered_voters: number
  rejected_votes: number
  turnout_percentage: number
  total_stations: number
  stations_reported: number
  reporting_percentage: number
}

const rankStyles = [
  {
    ring: 'ring-1 ring-amber-400/40',
    badge: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
    bar: 'from-amber-400 to-amber-500',
  },
  {
    ring: 'ring-1 ring-slate-300/30',
    badge: 'border-slate-300/30 bg-slate-300/10 text-slate-200',
    bar: 'from-slate-300 to-slate-400',
  },
  {
    ring: 'ring-1 ring-orange-400/35',
    badge: 'border-orange-400/35 bg-orange-400/10 text-orange-300',
    bar: 'from-orange-400 to-orange-500',
  },
]

const fallbackRank = {
  ring: '',
  badge: 'border-white/10 bg-white/[0.03] text-dark-300',
  bar: 'from-brand-500 to-cyan-400',
}

export default function PresidentialResultsPage() {
  const [presidentialResults, setPresidentialResults] = useState<ResultsData[]>([])
  const [resultsSummary, setResultsSummary] = useState<Summary | null>(null)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [resultsError, setResultsError] = useState('')

  // Fetch presidential results
  useEffect(() => {
    const fetchPresidentialResults = async () => {
      setResultsLoading(true)
      try {
        const response = await fetch('/api/results/aggregate?position=president')
        if (response.ok) {
          const data = await response.json()
          setPresidentialResults(data.results || [])
          setResultsSummary(data.summary || null)
        } else {
          setResultsError('Failed to load presidential results')
        }
      } catch (error) {
        console.error('Failed to fetch presidential results:', error)
        setResultsError('Failed to load presidential results')
      } finally {
        setResultsLoading(false)
      }
    }

    fetchPresidentialResults()
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PublicNav active="results" />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <PageHeader
          eyebrow="National tally"
          title="Live presidential results"
          description="Real-time presidential results aggregated from verified submissions across Kenya."
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-success">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Live updates
              </span>
              {resultsSummary && (
                <span className="badge border-white/10 bg-white/[0.03] text-dark-300">
                  {resultsSummary.stations_reported.toLocaleString()} of{' '}
                  {resultsSummary.total_stations.toLocaleString()} stations reporting
                </span>
              )}
            </div>
          }
        />

        {resultsLoading ? (
          <div className="glass-effect flex flex-col items-center gap-4 rounded-2xl py-16 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
            <p className="text-sm text-dark-400">Loading presidential results...</p>
          </div>
        ) : resultsError ? (
          <div className="mx-auto max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
            {resultsError}
          </div>
        ) : presidentialResults.length > 0 ? (
          <div>
            {/* Summary Stats */}
            {resultsSummary && (
              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-brand-400/20 bg-brand-500/[0.07] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-300">Reporting</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {resultsSummary.stations_reported.toLocaleString()}
                    <span className="text-base font-normal text-dark-400"> / {resultsSummary.total_stations.toLocaleString()}</span>
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-cyan-400"
                      style={{ width: `${Math.min(resultsSummary.reporting_percentage, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-emerald-300">{resultsSummary.reporting_percentage.toFixed(1)}% complete</p>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-300">Voter turnout</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {resultsSummary.turnout_percentage.toFixed(1)}%
                  </p>
                  <p className="mt-2 text-xs text-dark-400">
                    {resultsSummary.total_votes_cast.toLocaleString()} votes cast
                  </p>
                </div>

                <div className="rounded-2xl border border-purple-400/20 bg-purple-500/[0.07] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-purple-300">Registered voters</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {resultsSummary.registered_voters.toLocaleString()}
                  </p>
                  <p className="mt-2 text-xs text-dark-400">Nationwide roll</p>
                </div>

                <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.07] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-red-300">Rejected votes</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {resultsSummary.rejected_votes.toLocaleString()}
                  </p>
                  <p className="mt-2 text-xs text-dark-400">Excluded from valid tally</p>
                </div>
              </div>
            )}

            {/* Candidates */}
            <div className="glass-effect rounded-3xl p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Presidential candidates</h2>
                <span className="badge border-white/10 bg-white/[0.03] text-dark-300">
                  {presidentialResults.length} contesting
                </span>
              </div>

              <div className="space-y-3">
                {presidentialResults.map((result, index) => {
                  const rank = rankStyles[index] ?? fallbackRank
                  return (
                    <div
                      key={index}
                      className={`rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-all hover:bg-white/[0.045] sm:p-5 ${rank.ring}`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold ${rank.badge}`}
                          >
                            #{index + 1}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-semibold text-white">{result.candidate_name}</h3>
                            <p className="truncate text-sm text-dark-400">{result.party_name}</p>
                            {result.candidate_number && (
                              <span className="mt-1 inline-flex rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-brand-300">
                                Candidate #{result.candidate_number}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-end justify-between gap-6 sm:block sm:text-right">
                          <div>
                            <p className="text-2xl font-semibold tracking-tight text-white">
                              {result.total_votes.toLocaleString()}
                            </p>
                            <p className="text-base font-semibold text-emerald-400">
                              {result.percentage.toFixed(2)}%
                            </p>
                          </div>
                          <p className="text-xs text-dark-500 sm:mt-1">
                            {result.polling_stations_count.toLocaleString()} stations
                          </p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-dark-400">
                          <span>Vote share</span>
                          <span>{result.percentage.toFixed(2)}%</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.05]">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${rank.bar}`}
                            style={{ width: `${Math.min(result.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Total Summary */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-5">
                <div>
                  <h3 className="text-base font-semibold text-white">Total valid votes</h3>
                  <p className="mt-0.5 text-sm text-dark-400">
                    {presidentialResults.length} candidates competing
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tracking-tight text-white">
                    {presidentialResults.reduce((sum, r) => sum + r.total_votes, 0).toLocaleString()}
                  </p>
                  <p className="text-sm font-semibold text-emerald-400">100%</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-brand-600/20 via-dark-900 to-purple-700/15 px-6 py-8 text-center sm:flex-row sm:text-left">
              <div>
                <h3 className="text-lg font-semibold text-white">Need the full picture?</h3>
                <p className="mt-1 text-sm text-dark-400">
                  Sign in for station-level progress, evidence and PDF reports.
                </p>
              </div>
              <Link href="/login" className="btn-primary px-5 py-3">
                Open detailed dashboard
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        ) : (
          <div className="glass-effect flex flex-col items-center rounded-2xl py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-dark-500">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </span>
            <p className="mt-4 text-base font-medium text-white">No presidential results yet</p>
            <p className="mt-1 max-w-sm text-sm text-dark-400">
              Results will appear here as they are submitted and verified.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-16 border-t border-white/[0.06] bg-dark-950/50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              <Link href="/" className="inline-flex items-center gap-2.5">
                <img
                  src="/icons/icon-72x72.webp"
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-xl ring-1 ring-white/10"
                />
                <span className="text-base font-semibold text-white">
                  Ukweli<span className="gradient-text">Tally</span>
                </span>
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-dark-500">
                Independent election results tallying for candidates, agents and observers. Not
                affiliated with IEBC.
              </p>
              <p className="mt-4 text-xs text-dark-600">
                © {new Date().getFullYear()} UkweliTally. Built for Kenyan elections.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-12 gap-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dark-500">Platform</p>
                <div className="mt-3 space-y-2.5 text-sm">
                  <Link href="/" className="block text-dark-400 transition-colors hover:text-white">Home</Link>
                  <Link href="/volunteer-registration" className="block text-dark-400 transition-colors hover:text-white">Volunteer</Link>
                  <Link href="/login" className="block text-dark-400 transition-colors hover:text-white">Sign in</Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dark-500">Legal</p>
                <div className="mt-3 space-y-2.5 text-sm">
                  <Link href="/privacy" className="block text-dark-400 transition-colors hover:text-white">Privacy policy</Link>
                  <Link href="/terms" className="block text-dark-400 transition-colors hover:text-white">Terms &amp; conditions</Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dark-500">Get in touch</p>
                <div className="mt-3 flex items-center gap-2">
                  <a href="mailto:elgeiy8@gmail.com" title="Email" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-400 transition-colors hover:border-brand-400/30 hover:text-brand-300">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </a>
                  <a href="https://wa.me/254721237811" target="_blank" rel="noopener noreferrer" title="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-400 transition-colors hover:border-emerald-400/30 hover:text-emerald-300">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.894 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.267.655 4.395 1.906 6.215l-1.036 3.793 3.863-1.025z" /></svg>
                  </a>
                  <a href="tel:+254721237811" title="Call" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-400 transition-colors hover:border-purple-400/30 hover:text-purple-300">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

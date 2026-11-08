'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PublicNav from '@/components/PublicNav'
import InstallAppButton from '@/components/InstallAppButton'

const stats = [
  { value: '47', label: 'Counties covered' },
  { value: '290+', label: 'Constituencies' },
  { value: '46k+', label: 'Polling stations' },
  { value: '< 1 min', label: 'To submit a result' },
]

const features = [
  {
    title: 'Real-time tallying',
    description:
      'Results arrive from polling stations the moment an agent submits them. Tallies roll up from ward to constituency to county automatically.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    ),
  },
  {
    title: 'Evidence on every result',
    description:
      'Form 34A photos, GPS location and duplicate checks travel with each submission. Admins review flags before a result is trusted.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    ),
  },
  {
    title: 'Works when the network does not',
    description:
      'Install it like an app. Draft submissions are kept on the device and sync automatically once connectivity returns.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
      />
    ),
  },
  {
    title: 'Roles that match the ground',
    description:
      'Candidates, agents, observers and administrators each see exactly what their responsibility requires — nothing more.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    ),
  },
  {
    title: 'Analytics that make sense',
    description:
      'Turnout, reporting progress and vote share in one clean view. Export a PDF report for the campaign war room.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
      />
    ),
  },
  {
    title: 'OCR-ready form capture',
    description:
      'Photograph the result form and let the platform extract the numbers, with a human check before anything is finalised.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    ),
  },
  {
    title: 'Opinion polls with a share link',
    description:
      'Publish a poll in minutes — no account needed — and share one public link. One vote per browser, with results that update live beside the official tally.',
    icon: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
        />
      </>
    ),
  },
  {
    title: 'Confidence you can explain',
    description:
      'Every result carries a confidence score built from GPS distance, evidence photos, OCR, arithmetic checks, timeliness and anomalies — with the full breakdown visible to reviewers.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
      />
    ),
  },
  {
    title: 'Training for every role',
    description:
      'Candidates, agents and observers each get a role-specific guide they can download as a PDF, so the field team knows exactly what to capture and when.',
    icon: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M12 11v6m0 0l-2-2m2 2l2-2"
        />
      </>
    ),
  },
  {
    title: 'A clean slate, safely',
    description:
      'Archive an election or poll cycle in one step. Results are kept in an archive record while users, candidates, agents and polling stations stay untouched.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
      />
    ),
  },
  {
    title: 'Election stats at a glance',
    description:
      'Agents and observers see live results for the race and area they are assigned to, right beside their reporting tools, so progress is never a dashboard away.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M3 3v18h18M7 15l4-4 3 3 5-6"
      />
    ),
  },
]

const steps = [
  {
    title: 'Register your team',
    description: 'Candidates add agents and assign each one to a specific polling station.',
  },
  {
    title: 'Capture the result',
    description: 'Agents photograph Form 34A and enter the numbers, verified by GPS and photo evidence.',
  },
  {
    title: 'Aggregate instantly',
    description: 'The platform tallies from station to ward, constituency and county in real time.',
  },
  {
    title: 'Review and trust',
    description: 'Flagged results are reviewed by admins before they count towards the final tally.',
  },
]

const audiences = [
  {
    role: 'For candidates',
    description: 'See your race as it happens, station by station, with a clear view of where results are still missing.',
    points: ['Live vote share', 'Station-level progress', 'PDF report & opinion polls'],
    href: '/login',
  },
  {
    role: 'For agents',
    description: 'Submit the result from the polling station in under a minute, even when the signal is poor.',
    points: ['Guided two-step form', 'Offline-friendly', 'Photo, GPS & training guide'],
    href: '/login',
  },
  {
    role: 'For observers',
    description: 'Report an independent result where no agent is present, and help close the gaps in the tally.',
    points: ['Alternative result capture', 'Independent review', 'Training guide & live stats'],
    href: '/volunteer-registration',
  },
]

interface PresidentialResult {
  candidate_name: string
  party_name: string
  total_votes: number
  percentage: number
  polling_stations_count: number
}

interface PresidentialSummary {
  total_votes_cast: number
  registered_voters: number
  rejected_votes: number
  turnout_percentage: number
  total_stations: number
  stations_reported: number
  reporting_percentage: number
}

const candidateTones = ['from-brand-400 to-cyan-400', 'from-purple-400 to-fuchsia-400', 'from-emerald-400 to-teal-400']

export default function Home() {
  const [isContactModalOpen, setContactModalOpen] = useState(false)
  const [previewResults, setPreviewResults] = useState<PresidentialResult[]>([])
  const [previewSummary, setPreviewSummary] = useState<PresidentialSummary | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState(false)

  // The hero preview shows the same verified national tally as the public
  // presidential results page, not placeholder numbers.
  useEffect(() => {
    let cancelled = false

    const loadPreview = async () => {
      try {
        const response = await fetch('/api/results/aggregate?position=president', {
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Failed to load presidential results')

        const data = await response.json()
        if (cancelled) return

        setPreviewResults(Array.isArray(data.results) ? data.results : [])
        setPreviewSummary(data.summary ?? null)
        setPreviewError(false)
      } catch {
        if (!cancelled) setPreviewError(true)
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [])

  const previewStats = [
    {
      label: 'Stations',
      value: previewSummary ? previewSummary.stations_reported.toLocaleString() : '—',
    },
    {
      label: 'Turnout',
      value: previewSummary ? `${previewSummary.turnout_percentage.toFixed(1)}%` : '—',
    },
    {
      label: 'Reporting',
      value: previewSummary ? `${previewSummary.reporting_percentage.toFixed(1)}%` : '—',
    },
  ]

  return (
    <main className="relative overflow-hidden">
      <PublicNav onGetStarted={() => setContactModalOpen(true)} />

      {/* Hero */}
      <section className="relative">
        <div className="glow-orb left-1/2 top-[-12rem] h-[26rem] w-[42rem] -translate-x-1/2 bg-brand-600/25 animate-pulse-slow" />
        <div className="glow-orb -right-32 top-24 h-80 w-80 bg-cyan-500/10 animate-aurora" />
        <div className="glow-orb -left-40 top-[28rem] h-96 w-96 bg-purple-600/10 animate-aurora animation-delay-500" />

        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-24">
          <div className="relative z-10">
            <p className="section-label animate-fade-in-down">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Built for Kenya 2027
            </p>

            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-white animate-fade-in-up sm:text-6xl">
              Election results
              <br />
              you can <span className="gradient-text">verify</span>.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-dark-400 animate-fade-in-up animation-delay-100 sm:text-lg">
              UkweliTally gives candidates, agents and observers one independent
              source of truth — every polling station, every result, backed by
              evidence.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3 animate-fade-in-up animation-delay-200">
              <button onClick={() => setContactModalOpen(true)} className="btn-primary px-6 py-3.5 text-[15px]">
                Get started
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
              <Link href="/presidential-results" className="btn-secondary px-5 py-3.5 text-[15px]">
                View live results
              </Link>
              <InstallAppButton />
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-dark-400 animate-fade-in-up animation-delay-300">
              {['End-to-end evidence chain', 'Offline-first capture', 'Role-based access'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Product preview */}
          <div className="relative z-10 animate-fade-in-up animation-delay-200 lg:pl-6">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-brand-500/15 via-cyan-400/5 to-purple-500/15 blur-2xl" />
            <div className="glass-effect relative rounded-3xl p-5 shadow-soft sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dark-500">
                    Presidential tally
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    Live · verified results
                  </p>
                </div>
                <span className="badge-brand">
                  {previewLoading
                    ? 'Syncing'
                    : `${previewResults.length} candidate${previewResults.length === 1 ? '' : 's'}`}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                {previewStats.map((item) => (
                  <div key={item.label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3">
                    <p className="text-[10px] uppercase tracking-wide text-dark-500">{item.label}</p>
                    <p className="mt-1 text-base font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>

              {previewLoading ? (
                <div className="mt-5 space-y-4" aria-hidden="true">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="animate-pulse">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-white/[0.06]" />
                          <div className="space-y-1.5">
                            <div className="h-2.5 w-24 rounded bg-white/[0.08]" />
                            <div className="h-2 w-16 rounded bg-white/[0.05]" />
                          </div>
                        </div>
                        <div className="h-3 w-10 rounded bg-white/[0.08]" />
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06]" />
                    </div>
                  ))}
                </div>
              ) : previewResults.length > 0 ? (
                <div className="mt-5 space-y-4">
                  {previewResults.slice(0, 3).map((candidate, index) => (
                    <div key={`${candidate.candidate_name}-${index}`}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-semibold text-dark-300">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white">
                              {candidate.candidate_name}
                            </p>
                            <p className="truncate text-[10px] text-dark-500">
                              {candidate.party_name || 'Independent'}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-semibold text-white">
                            {candidate.percentage.toFixed(1)}%
                          </p>
                          <p className="text-[10px] text-dark-500">
                            {candidate.total_votes.toLocaleString()} votes
                          </p>
                        </div>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${
                            candidateTones[index] ?? candidateTones[0]
                          }`}
                          style={{ width: `${Math.min(Math.max(candidate.percentage, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-6 text-center">
                  <p className="text-sm font-medium text-white">
                    {previewError ? 'Live tally unavailable' : 'Awaiting verified results'}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-dark-500">
                    {previewError
                      ? 'Open the live results page to try again.'
                      : 'The national tally will appear here as polling stations report and results are verified.'}
                  </p>
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
                <div className="flex min-w-0 items-center gap-2 text-[11px] text-dark-400">
                  <svg className="h-4 w-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="truncate">
                    {previewSummary
                      ? `${previewSummary.total_votes_cast.toLocaleString()} votes counted`
                      : 'Verified submissions'}
                  </span>
                </div>
                <span className="shrink-0 text-[10px] text-dark-500">
                  {previewError ? 'Not refreshed' : 'Updated just now'}
                </span>
              </div>
            </div>

            <div className="absolute -left-3 bottom-8 hidden rounded-2xl border border-white/10 bg-dark-900/90 px-4 py-3 shadow-soft backdrop-blur-xl sm:flex sm:items-center sm:gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              <div>
                <p className="text-xs font-semibold text-white">GPS verified</p>
                <p className="text-[10px] text-dark-500">Station coordinates match</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats band */}
        <div className="relative border-y border-white/[0.06] bg-white/[0.02]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/[0.06] px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            {stats.map((stat) => (
              <div key={stat.label} className="px-4 py-7 text-center first:pl-0 last:pr-0 sm:px-8">
                <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-dark-500 sm:text-xs">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-label">Why UkweliTally</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Built for the reality of election day
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-dark-400 sm:text-base">
              Slow networks, missing agents, contested numbers — and public opinion.
              Every part of the platform is designed around the conditions on the ground.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className={`glass-effect card-hover group relative overflow-hidden rounded-3xl p-6 ${
                  index === 0 ? 'sm:col-span-2 lg:col-span-2' : ''
                }`}
              >
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-500/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:opacity-0" />
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-brand-500/20 to-cyan-500/10 text-brand-300">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {feature.icon}
                    </svg>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-dark-400">{feature.description}</p>

                  {index === 0 && (
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      {[
                        { label: 'Ward', value: '91%' },
                        { label: 'Constituency', value: '87%' },
                        { label: 'County', value: '82%' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                          <div className="flex items-center justify-between text-[11px] text-dark-400">
                            <span>{item.label}</span>
                            <span className="font-semibold text-white">{item.value}</span>
                          </div>
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-cyan-400"
                              style={{ width: item.value }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <p className="section-label">How it works</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                From the polling station to the tally in minutes
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-dark-400 sm:text-base">
                A short, guided flow keeps the field simple and the data clean.
                Every step leaves an audit trail behind it.
              </p>
              <Link href="/login" className="btn-secondary mt-6 px-5 py-3">
                Sign in to your dashboard
              </Link>
            </div>

            <div className="relative">
              <div className="absolute left-5 top-2 bottom-2 w-px bg-gradient-to-b from-brand-500/50 via-white/10 to-transparent sm:left-6" />
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={step.title} className="relative flex gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-colors hover:border-white/[0.12] hover:bg-white/[0.035] sm:gap-5 sm:p-6">
                    <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-400/30 bg-dark-900 text-sm font-semibold text-brand-200 shadow-glow sm:h-12 sm:w-12">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div className="pt-1">
                      <h3 className="text-base font-semibold text-white sm:text-lg">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-dark-400">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="relative py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-label">Made for your role</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                One platform. Three points of view.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-dark-400">
              The same verified data, presented for the decision each person has to make.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {audiences.map((audience) => (
              <div key={audience.role} className="glass-effect card-hover flex flex-col rounded-3xl p-6">
                <h3 className="text-lg font-semibold text-white">{audience.role}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-dark-400">{audience.description}</p>
                <ul className="mt-5 space-y-2.5">
                  {audience.points.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-sm text-dark-300">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
                        <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  href={audience.href}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-300 transition-colors hover:text-brand-200"
                >
                  {audience.role === 'For observers' ? 'Become a volunteer' : 'Open dashboard'}
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 sm:pb-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-brand-600/25 via-dark-900 to-purple-700/20 px-6 py-14 text-center shadow-soft sm:px-12 sm:py-20">
            <div className="glow-orb left-1/2 top-0 h-64 w-[34rem] -translate-x-1/2 bg-brand-500/25" />
            <div className="relative mx-auto max-w-2xl">
              <p className="section-label">Take control of the count</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Ready to secure your election results?
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-dark-300 sm:text-base">
                Set up your team, assign agents to stations, and watch the tally
                build itself with evidence behind every number.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button onClick={() => setContactModalOpen(true)} className="btn-primary px-6 py-3.5">
                  Create your account
                </button>
                <Link href="/polls/create" className="btn-secondary px-5 py-3.5">
                  Create a poll
                </Link>
                <Link href="/presidential-results" className="btn-secondary px-5 py-3.5">
                  Explore live results
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-dark-950/50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              <Link href="/" className="flex items-center gap-2.5">
                <img
                  src="/icons/icon-192x192.png"
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
                Independent election results tallying for candidates, agents and
                observers. Not affiliated with IEBC.
              </p>
              <p className="mt-4 text-xs text-dark-600">
                © {new Date().getFullYear()} UkweliTally. Built for Kenyan elections.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dark-500">Platform</p>
                <div className="mt-3 space-y-2.5 text-sm">
                  <Link href="/presidential-results" className="block text-dark-400 transition-colors hover:text-white">Live results</Link>
                  <Link href="/polls/create" className="block text-dark-400 transition-colors hover:text-white">Create a poll</Link>
                  <Link href="/volunteer-registration" className="block text-dark-400 transition-colors hover:text-white">Volunteer</Link>
                  <Link href="/login" className="block text-dark-400 transition-colors hover:text-white">Sign in</Link>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dark-500">Company</p>
                <div className="mt-3 space-y-2.5 text-sm">
                  <Link href="/#how-it-works" className="block text-dark-400 transition-colors hover:text-white">How it works</Link>
                  <Link href="/#features" className="block text-dark-400 transition-colors hover:text-white">Features</Link>
                  <a href="mailto:elgeiy8@gmail.com" className="block text-dark-400 transition-colors hover:text-white">Contact</a>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dark-500">Reach us</p>
                <div className="mt-3 flex items-center gap-2">
                  <a href="mailto:elgeiy8@gmail.com" title="Email" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-400 transition-colors hover:border-brand-400/30 hover:text-brand-300">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </a>
                  <a href="https://wa.me/254721237811" target="_blank" rel="noopener noreferrer" title="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-400 transition-colors hover:border-emerald-400/30 hover:text-emerald-300">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.894 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.267.655 4.395 1.906 6.215l-1.036 3.793 3.863-1.025z" /></svg>
                  </a>
                  <a href="tel:+254721237811" title="Call" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-dark-400 transition-colors hover:border-purple-400/30 hover:text-purple-300">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Contact Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-950/80 p-4 backdrop-blur-md animate-fade-in">
          <div className="glass-effect relative w-full max-w-md rounded-3xl p-7 shadow-soft animate-slide-in-up sm:p-8">
            <button
              onClick={() => setContactModalOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-dark-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="mb-6">
              <p className="section-label mb-3">Get started</p>
              <h3 className="text-2xl font-semibold tracking-tight text-white">Talk to the team</h3>
              <p className="mt-2 text-sm leading-relaxed text-dark-400">
                Accounts are set up with an administrator. Reach out and we will get
                your campaign onto the platform.
              </p>
            </div>

            <div className="space-y-2.5">
              <a href="mailto:elgeiy8@gmail.com" className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 transition-colors hover:border-brand-400/30 hover:bg-white/[0.045]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Email</p>
                  <p className="truncate text-sm text-dark-400">elgeiy8@gmail.com</p>
                </div>
              </a>

              <a href="https://wa.me/254721237811" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 transition-colors hover:border-emerald-400/30 hover:bg-white/[0.045]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.894 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.267.655 4.395 1.906 6.215l-1.036 3.793 3.863-1.025z" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">WhatsApp</p>
                  <p className="text-sm text-dark-400">0721 237811</p>
                </div>
              </a>

              <a href="tel:+254721237811" className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 transition-colors hover:border-purple-400/30 hover:bg-white/[0.045]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-300">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Call</p>
                  <p className="text-sm text-dark-400">0721 237811</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

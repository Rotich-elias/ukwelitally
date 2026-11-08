'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface StatsCandidate {
  candidate_name: string
  party_name?: string | null
  total_votes: number
  percentage: number
}

interface StatsSummary {
  total_votes_cast: number
  registered_voters: number
  rejected_votes: number
  turnout_percentage: number
  total_stations: number
  stations_reported: number
  reporting_percentage: number
}

interface ElectionStatsCardProps {
  position?: string
  title?: string
  subtitle?: string
}

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString('en-KE')
}

/**
 * A compact live results window for field users.
 *
 * Agents and observers use it to see the national picture for the race they are
 * reporting without leaving their dashboard. The data comes from the same
 * public aggregate endpoint as the results page, so the snippet cannot drift
 * from the published tally.
 */
export default function ElectionStatsCard({
  position = 'president',
  title = 'Live election statistics',
  subtitle = 'From verified, selected results only',
}: ElectionStatsCardProps) {
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [leaders, setLeaders] = useState<StatsCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const response = await fetch(`/api/results/aggregate?position=${position}`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not load statistics')
        if (cancelled) return

        const results: StatsCandidate[] = Array.isArray(data.results) ? data.results : []
        setSummary(data.summary || null)
        setLeaders(
          [...results]
            .sort((a, b) => Number(b.total_votes) - Number(a.total_votes))
            .slice(0, 3)
        )
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load statistics')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [position])

  if (loading) {
    return (
      <div className="glass-effect rounded-2xl p-5 text-sm text-dark-400">
        Loading live statistics…
      </div>
    )
  }

  if (error || !summary) {
    // A statistics snippet must never block the field workflow.
    return null
  }

  const maxVotes = leaders[0]?.total_votes || 0

  return (
    <div className="glass-effect overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-dark-500">{subtitle}</p>
        </div>
        <Link href="/results" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
          Full results →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/[0.06] sm:grid-cols-4">
        {[
          { label: 'Votes cast', value: formatNumber(summary.total_votes_cast) },
          { label: 'Turnout', value: `${Number(summary.turnout_percentage || 0).toFixed(1)}%` },
          {
            label: 'Stations reported',
            value: `${formatNumber(summary.stations_reported)} / ${formatNumber(summary.total_stations)}`,
          },
          {
            label: 'Reporting',
            value: `${Number(summary.reporting_percentage || 0).toFixed(1)}%`,
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-dark-950/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-dark-500">{stat.label}</p>
            <p className="mt-1 text-sm font-semibold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {leaders.length > 0 && (
        <div className="space-y-2.5 px-5 py-4">
          {leaders.map((candidate, index) => {
            const share = maxVotes > 0 ? (Number(candidate.total_votes) / maxVotes) * 100 : 0
            return (
              <div key={`${candidate.candidate_name}-${index}`}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium text-dark-200">
                    {candidate.candidate_name}
                    {candidate.party_name && (
                      <span className="ml-1.5 text-dark-500">({candidate.party_name})</span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold text-white">
                    {Number(candidate.percentage || 0).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400"
                    style={{ width: `${Math.max(2, share)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

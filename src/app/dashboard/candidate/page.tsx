'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'

interface CandidateProfile {
  full_name: string
  party_name: string
  position: string
  electoral_area: string
  county_id?: number
  constituency_id?: number
  ward_id?: number
}

interface CandidateResult {
  candidate_name: string
  party_name: string
  total_votes: number
  percentage: number
}

interface ResultsSummary {
  total_votes_cast: number
  registered_voters: number
  rejected_votes: number
  turnout_percentage: number
  total_stations: number
  stations_reported: number
  reporting_percentage: number
}

export default function CandidateDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<CandidateProfile | null>(null)
  const [results, setResults] = useState<CandidateResult[]>([])
  const [summary, setSummary] = useState<ResultsSummary | null>(null)

  // Fetch profile data
  const fetchProfile = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/candidates/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setProfile(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    }
  }, [])

  // Fetch results data
  const fetchResults = useCallback(async () => {
    if (!profile) return // Don't fetch until profile is loaded

    try {
      const token = localStorage.getItem('token')
      // The API will automatically restrict based on candidate's electoral area
      const response = await fetch(`/api/results/aggregate?position=${profile.position}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setResults(data.results || [])
        setSummary(data.summary)
      }
    } catch (error) {
      console.error('Failed to fetch results:', error)
    } finally {
      setLoading(false)
    }
  }, [profile])

  // Initial load - fetch profile
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchProfile()
  }, [router, fetchProfile])

  // Fetch results when profile is loaded
  useEffect(() => {
    if (profile) {
      fetchResults()
    }
  }, [profile, fetchResults])

  const getProgressPercentage = () => {
    if (!summary || summary.total_stations === 0) return 0
    return Math.round(summary.reporting_percentage)
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header with Electoral Area */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Candidate Dashboard</h1>
          <p className="text-dark-300">Real-time election results tracking</p>
          {profile && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div>
                <p className="text-xs text-blue-300">Electoral Area</p>
                <p className="text-sm font-semibold text-white">{profile.electoral_area}</p>
              </div>
              <div className="ml-4 pl-4 border-l border-blue-500/30">
                <p className="text-xs text-blue-300">Position</p>
                <p className="text-sm font-semibold text-white">{profile.position.toUpperCase()}</p>
              </div>
              <div className="ml-4 pl-4 border-l border-blue-500/30">
                <p className="text-xs text-blue-300">Party</p>
                <p className="text-sm font-semibold text-white">{profile.party_name}</p>
              </div>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {/* Total Stations */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-dark-400 text-sm">Total Stations</p>
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{summary?.total_stations || 0}</p>
          </div>

          {/* Submitted */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-dark-400 text-sm">Reporting</p>
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{summary?.stations_reported || 0}</p>
            <p className="text-xs text-emerald-400 mt-1">{getProgressPercentage()}% complete</p>
          </div>

          {/* Turnout */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-dark-400 text-sm">Turnout</p>
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{summary?.turnout_percentage.toFixed(1) || 0}%</p>
            <p className="text-xs text-dark-400 mt-1">{summary?.total_votes_cast.toLocaleString() || 0} votes cast</p>
          </div>

          {/* Registered Voters */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-dark-400 text-sm">Registered Voters</p>
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{summary?.registered_voters.toLocaleString() || 0}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="glass-effect rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Reporting Progress</h3>
            <span className="text-sm text-dark-300">{getProgressPercentage()}%</span>
          </div>
          <div className="w-full bg-dark-800 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${getProgressPercentage()}%` }}
            ></div>
          </div>
          <div className="flex justify-between mt-2 text-sm text-dark-400">
            <span>{summary?.stations_reported || 0} stations reporting</span>
            <span>{summary?.total_stations || 0} total stations</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Results Table */}
          <div className="lg:col-span-2">
            <div className="glass-effect rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">
                  Election Results - {profile?.electoral_area}
                </h2>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <p className="text-dark-400 mt-4">Loading results...</p>
                </div>
              ) : results.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-dark-700">
                        <th className="text-left py-3 px-4 text-sm font-medium text-dark-300">Candidate</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-dark-300">Party</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-dark-300">Votes</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-dark-300">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result, index) => (
                        <tr key={index} className="border-b border-dark-800 hover:bg-dark-800/30 transition-colors">
                          <td className="py-3 px-4 text-white font-medium">{result.candidate_name}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                              {result.party_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-white font-semibold">
                            {result.total_votes.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-dark-800 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-blue-500 to-emerald-500 h-2 rounded-full"
                                  style={{ width: `${result.percentage}%` }}
                                ></div>
                              </div>
                              <span className="text-white font-medium w-12 text-right">
                                {result.percentage.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-dark-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-dark-400">No results available yet</p>
                  <p className="text-dark-500 text-sm mt-1">Results will appear as agents submit them</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => router.push('/dashboard/candidate/manage-agents')}
                  className="w-full btn-primary text-sm py-2"
                >
                  Manage Agents
                </button>
                <button className="w-full btn-secondary text-sm py-2">
                  Download Report
                </button>
                <button className="w-full btn-secondary text-sm py-2">
                  View Results Map
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm text-white">New submission</p>
                    <p className="text-xs text-dark-400">Station A123 - 5m ago</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm text-white">Agent assigned</p>
                    <p className="text-xs text-dark-400">John Doe - 15m ago</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm text-white">Results aggregated</p>
                    <p className="text-xs text-dark-400">Ward 12 - 1h ago</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Support */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Need Help?</h3>
              <p className="text-sm text-dark-300 mb-4">
                Contact support if you notice any discrepancies or issues.
              </p>
              <button className="w-full btn-secondary text-sm py-2">
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

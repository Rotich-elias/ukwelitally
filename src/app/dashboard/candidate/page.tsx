'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'

interface Result {
  id: string
  level: string
  location_name: string
  total_votes: number
  updated_at: string
}

interface Stats {
  totalStations: number
  submittedStations: number
  pendingStations: number
  totalVotes: number
}

export default function CandidateDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<Result[]>([])
  const [stats, setStats] = useState<Stats>({
    totalStations: 0,
    submittedStations: 0,
    pendingStations: 0,
    totalVotes: 0,
  })
  const [selectedLevel, setSelectedLevel] = useState('all')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchResults()
  }, [router])

  const fetchResults = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/results', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setResults(data.results || [])
        // Calculate stats from results
        const totalVotes = data.results?.reduce((sum: number, r: Result) => sum + r.total_votes, 0) || 0
        setStats({
          totalStations: 150,
          submittedStations: data.results?.length || 0,
          pendingStations: 150 - (data.results?.length || 0),
          totalVotes,
        })
      }
    } catch (error) {
      console.error('Failed to fetch results:', error)
    } finally {
      setLoading(false)
    }
  }

  const getProgressPercentage = () => {
    if (stats.totalStations === 0) return 0
    return Math.round((stats.submittedStations / stats.totalStations) * 100)
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Candidate Dashboard</h1>
          <p className="text-dark-300">Real-time election results tracking</p>
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
            <p className="text-3xl font-bold text-white">{stats.totalStations}</p>
          </div>

          {/* Submitted */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-dark-400 text-sm">Submitted</p>
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stats.submittedStations}</p>
            <p className="text-xs text-emerald-400 mt-1">{getProgressPercentage()}% complete</p>
          </div>

          {/* Pending */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-dark-400 text-sm">Pending</p>
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stats.pendingStations}</p>
          </div>

          {/* Total Votes */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-dark-400 text-sm">Total Votes</p>
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stats.totalVotes.toLocaleString()}</p>
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
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Results Table */}
          <div className="lg:col-span-2">
            <div className="glass-effect rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Results by Location</h2>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="px-4 py-2 bg-dark-900/50 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Levels</option>
                  <option value="station">Polling Stations</option>
                  <option value="ward">Wards</option>
                  <option value="constituency">Constituencies</option>
                  <option value="county">Counties</option>
                </select>
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
                        <th className="text-left py-3 px-4 text-sm font-medium text-dark-300">Location</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-dark-300">Level</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-dark-300">Votes</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-dark-300">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result) => (
                        <tr key={result.id} className="border-b border-dark-800 hover:bg-dark-800/30 transition-colors">
                          <td className="py-3 px-4 text-white">{result.location_name}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                              {result.level}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-white font-semibold">
                            {result.total_votes.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right text-dark-400 text-sm">
                            {new Date(result.updated_at).toLocaleDateString()}
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
                <button className="w-full btn-primary text-sm py-2">
                  Download Report
                </button>
                <button className="w-full btn-secondary text-sm py-2">
                  Compare with IEBC
                </button>
                <button className="w-full btn-secondary text-sm py-2">
                  View Agents
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

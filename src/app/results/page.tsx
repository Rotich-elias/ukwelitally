'use client'

import { useState, useEffect } from 'react'
import DashboardNav from '@/components/DashboardNav'
import LocationSelector from '@/components/LocationSelector'

interface ResultsData {
  candidate_name: string
  party_name: string
  total_votes: number
  percentage: number
  polling_stations_count: number
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

export default function ResultsPage() {
  const [results, setResults] = useState<ResultsData[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)

  // Use individual state variables to avoid object reference issues
  const [countyId, setCountyId] = useState<number | undefined>()
  const [constituencyId, setConstituencyId] = useState<number | undefined>()
  const [wardId, setWardId] = useState<number | undefined>()
  const [pollingStationId, setPollingStationId] = useState<number | undefined>()

  const fetchResults = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (countyId) params.append('county_id', countyId.toString())
      if (constituencyId) params.append('constituency_id', constituencyId.toString())
      if (wardId) params.append('ward_id', wardId.toString())
      if (pollingStationId) params.append('polling_station_id', pollingStationId.toString())

      const response = await fetch(`/api/results/aggregate?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setResults(data.results || [])
        setSummary(data.summary || null)
      }
    } catch (error) {
      console.error('Failed to fetch results:', error)
    } finally {
      setLoading(false)
    }
  }

  // Only re-fetch when location filters actually change
  useEffect(() => {
    fetchResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countyId, constituencyId, wardId, pollingStationId])

  const handleLocationChange = (location: any) => {
    setCountyId(location.countyId)
    setConstituencyId(location.constituencyId)
    setWardId(location.wardId)
    setPollingStationId(location.pollingStationId)
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Election Results</h1>
          <p className="text-dark-300">Real-time results aggregation by location</p>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <div className="glass-effect rounded-xl p-6 sticky top-4">
              <h2 className="text-xl font-semibold text-white mb-4">Filter by Location</h2>
              <LocationSelector
                onLocationChange={handleLocationChange}
                showPollingStations={false}
              />

              {/* Summary Stats */}
              {summary && (
                <div className="mt-6 pt-6 border-t border-dark-700">
                  <h3 className="text-sm font-semibold text-white mb-3">Summary</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-dark-400">Reporting</p>
                      <p className="text-lg text-white font-bold">
                        {summary.stations_reported} / {summary.total_stations}
                      </p>
                      <p className="text-xs text-emerald-400">
                        {summary.reporting_percentage.toFixed(1)}% Complete
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-400">Voter Turnout</p>
                      <p className="text-lg text-white font-bold">
                        {summary.turnout_percentage.toFixed(1)}%
                      </p>
                      <p className="text-xs text-dark-400">
                        {summary.total_votes_cast.toLocaleString()} / {summary.registered_voters.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-400">Rejected Votes</p>
                      <p className="text-lg text-white font-bold">
                        {summary.rejected_votes.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Results Table */}
          <div className="lg:col-span-3">
            <div className="glass-effect rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6">Results by Candidate</h2>

              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <p className="mt-4 text-dark-300">Loading results...</p>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-4">
                  {results.map((result, index) => (
                    <div
                      key={index}
                      className="bg-dark-900/50 rounded-lg p-4 border border-dark-700 hover:border-blue-500 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            {result.candidate_name}
                          </h3>
                          <p className="text-sm text-dark-300">{result.party_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-white">
                            {result.total_votes.toLocaleString()}
                          </p>
                          <p className="text-sm text-emerald-400">{result.percentage.toFixed(2)}%</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3">
                        <div className="w-full bg-dark-800 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-emerald-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${result.percentage}%` }}
                          ></div>
                        </div>
                      </div>

                      <p className="text-xs text-dark-400 mt-2">
                        From {result.polling_stations_count} polling station{result.polling_stations_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg
                    className="w-16 h-16 mx-auto text-dark-600 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-dark-300">No results available for this location</p>
                  <p className="text-sm text-dark-400 mt-2">
                    Try selecting a different area or wait for results to be submitted
                  </p>
                </div>
              )}
            </div>

            {/* Top Performing Locations */}
            {results.length > 0 && (
              <div className="glass-effect rounded-xl p-6 mt-6">
                <h2 className="text-xl font-semibold text-white mb-4">Analysis</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-dark-900/50 rounded-lg p-4 border border-dark-700">
                    <p className="text-sm text-dark-400 mb-2">Leading Candidate</p>
                    <p className="text-xl font-bold text-white">{results[0]?.candidate_name}</p>
                    <p className="text-sm text-emerald-400">
                      {results[0]?.total_votes.toLocaleString()} votes ({results[0]?.percentage.toFixed(2)}%)
                    </p>
                  </div>
                  <div className="bg-dark-900/50 rounded-lg p-4 border border-dark-700">
                    <p className="text-sm text-dark-400 mb-2">Total Candidates</p>
                    <p className="text-xl font-bold text-white">{results.length}</p>
                    <p className="text-sm text-dark-300">Competing in this race</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

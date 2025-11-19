'use client'

import { useState, useEffect } from 'react'

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
    <div className="min-h-screen bg-dark-950">
      {/* Public Navigation Header */}
      <nav className="glass-effect border-b border-dark-700/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <a href="/" className="cursor-pointer">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              UkweliTally
            </h1>
          </a>
          <div className="space-x-4">
            <a href="/" className="text-dark-300 hover:text-blue-400 transition-colors">
              Home
            </a>
            <a 
              href="/volunteer-registration" 
              className="text-dark-300 hover:text-blue-400 transition-colors"
            >
              Volunteer
            </a>
            <a 
              href="/login" 
              className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-2 rounded-lg hover:from-blue-500 hover:to-blue-400 transition-all hover:shadow-glow"
            >
              Login
            </a>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            Live Presidential Election Results
          </h1>
          <p className="text-xl text-dark-300 max-w-2xl mx-auto">
            Real-time presidential results aggregated from verified submissions across Kenya
          </p>
        </div>

        {resultsLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="mt-4 text-dark-300">Loading presidential results...</p>
          </div>
        ) : resultsError ? (
          <div className="text-center py-12">
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg max-w-md mx-auto">
              {resultsError}
            </div>
          </div>
        ) : presidentialResults.length > 0 ? (
          <div className="max-w-6xl mx-auto">
            {/* Summary Stats */}
            {resultsSummary && (
              <div className="glass-effect rounded-xl p-6 mb-8">
                <h2 className="text-2xl font-semibold text-white mb-6">Election Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
                    <p className="text-xs text-blue-300 mb-1">Reporting</p>
                    <p className="text-2xl font-bold text-white">
                      {resultsSummary.stations_reported} / {resultsSummary.total_stations}
                    </p>
                    <p className="text-xs text-emerald-400">
                      {resultsSummary.reporting_percentage.toFixed(1)}% Complete
                    </p>
                  </div>
                  <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                    <p className="text-xs text-green-300 mb-1">Voter Turnout</p>
                    <p className="text-2xl font-bold text-white">
                      {resultsSummary.turnout_percentage.toFixed(1)}%
                    </p>
                    <p className="text-xs text-dark-400">
                      {resultsSummary.total_votes_cast.toLocaleString()} votes
                    </p>
                  </div>
                  <div className="text-center p-4 bg-purple-500/10 rounded-lg border border-purple-500/30">
                    <p className="text-xs text-purple-300 mb-1">Registered Voters</p>
                    <p className="text-2xl font-bold text-white">
                      {resultsSummary.registered_voters.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                    <p className="text-xs text-red-300 mb-1">Rejected Votes</p>
                    <p className="text-2xl font-bold text-white">
                      {resultsSummary.rejected_votes.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Top Candidates */}
            <div className="glass-effect rounded-xl p-6">
              <h2 className="text-2xl font-semibold text-white mb-6">Presidential Candidates</h2>
              <div className="space-y-6">
                {presidentialResults.map((result, index) => (
                  <div
                    key={index}
                    className={`bg-dark-900/50 rounded-xl p-6 border-2 transition-all ${
                      index === 0 ? 'border-yellow-400/50 bg-yellow-400/5' :
                      index === 1 ? 'border-gray-400/50 bg-gray-400/5' :
                      index === 2 ? 'border-orange-400/50 bg-orange-400/5' :
                      'border-dark-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                          index === 0 ? 'bg-yellow-400/20 border-2 border-yellow-400' :
                          index === 1 ? 'bg-gray-400/20 border-2 border-gray-400' :
                          index === 2 ? 'bg-orange-400/20 border-2 border-orange-400' :
                          'bg-dark-800 border-2 border-dark-600'
                        }`}>
                          <span className={`text-2xl font-bold ${
                            index === 0 ? 'text-yellow-400' :
                            index === 1 ? 'text-gray-300' :
                            index === 2 ? 'text-orange-400' :
                            'text-dark-400'
                          }`}>
                            #{index + 1}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white">{result.candidate_name}</h3>
                          <p className="text-lg text-dark-400">{result.party_name}</p>
                          {result.candidate_number && (
                            <p className="text-sm text-blue-400 mt-1">Candidate #{result.candidate_number}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-white">{result.total_votes.toLocaleString()}</p>
                        <p className="text-xl text-emerald-400">{result.percentage.toFixed(2)}%</p>
                        <p className="text-sm text-dark-400 mt-1">
                          {result.polling_stations_count} stations
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="mt-4">
                      <div className="flex justify-between text-sm text-dark-400 mb-2">
                        <span>Vote Share</span>
                        <span>{result.percentage.toFixed(2)}%</span>
                      </div>
                      <div className="bg-dark-800 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            index === 0 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                            index === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                            index === 2 ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                            'bg-gradient-to-r from-blue-500 to-emerald-500'
                          }`}
                          style={{ width: `${result.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Summary */}
              <div className="mt-8 pt-6 border-t border-dark-700">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-lg font-semibold text-white">Total Valid Votes</h4>
                    <p className="text-dark-300">{presidentialResults.length} candidates competing</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-white">
                      {presidentialResults.reduce((sum, r) => sum + r.total_votes, 0).toLocaleString()}
                    </p>
                    <p className="text-lg text-emerald-400">100%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* View More Button */}
            <div className="text-center mt-8">
              <a
                href="/login"
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-blue-500 hover:to-purple-500 transition-all hover:shadow-glow-lg inline-block"
              >
                Login for Detailed Results Dashboard
              </a>
            </div>
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
            <p className="text-dark-300">No presidential results available yet</p>
            <p className="text-sm text-dark-400 mt-2">
              Results will appear here as they are submitted and verified
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="glass-effect border-t border-dark-700/50 py-12 mt-20">
        <div className="container mx-auto px-4 text-center">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="text-center md:text-left">
              <h4 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                UkweliTally
              </h4>
              <p className="text-dark-200">&copy; 2025 UkweliTally. Built for Kenyan Elections.</p>
              <p className="text-sm mt-1 text-dark-400">
                Independent platform - Not affiliated with IEBC
              </p>
            </div>
            <div className="text-center md:text-right">
              <h4 className="text-lg font-semibold text-white mb-4">Get in Touch</h4>
              <div className="flex justify-center md:justify-end items-center gap-6">
                <a href="mailto:elgeiy8@gmail.com" title="Email" className="text-dark-300 hover:text-blue-400 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                </a>
                <a href="https://wa.me/254721237811" target="_blank" rel="noopener noreferrer" title="WhatsApp" className="text-dark-300 hover:text-green-400 transition-colors">
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.894 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.267.655 4.395 1.906 6.215l-1.036 3.793 3.863-1.025z"></path></svg>
                </a>
                <a href="tel:+254721237811" title="Call" className="text-dark-300 hover:text-purple-400 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
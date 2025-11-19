'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import LocationSelector from '@/components/LocationSelector'

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

interface CandidateProfile {
  position: string
  county_id?: number
  constituency_id?: number
  ward_id?: number
  electoral_area: string
}

interface PollingStation {
  id: number
  code: string
  name: string
  registered_voters: number
  ward_name: string
  constituency_name: string
  county_name: string
  submission_count: number
  has_verified: number
  has_pending: number
  has_flagged: number
  has_rejected: number
  last_submitted_at: string | null
  verified_count: number
}

interface StationsSummary {
  total_stations: number
  submitted_stations: number
  verified_stations: number
  pending_stations: number
  flagged_stations: number
  not_submitted_stations: number
  reporting_percentage: number
}

export default function ResultsPage() {
  const router = useRouter()
  const [results, setResults] = useState<ResultsData[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  // View toggle state
  const [viewMode, setViewMode] = useState<'aggregate' | 'stations'>('aggregate')

  // Polling stations state
  const [pollingStations, setPollingStations] = useState<PollingStation[]>([])
  const [stationsSummary, setStationsSummary] = useState<StationsSummary | null>(null)
  const [stationsLoading, setStationsLoading] = useState(false)
  const [stationStatusFilter, setStationStatusFilter] = useState<'all' | 'submitted' | 'not_submitted'>('all')
  const [selectedStation, setSelectedStation] = useState<any>(null)
  const [stationDetailsLoading, setStationDetailsLoading] = useState(false)

  // Use individual state variables to avoid object reference issues
  const [countyId, setCountyId] = useState<number | undefined>()
  const [constituencyId, setConstituencyId] = useState<number | undefined>()
  const [wardId, setWardId] = useState<number | undefined>()
  const [pollingStationId, setPollingStationId] = useState<number | undefined>()
  const [selectedPosition, setSelectedPosition] = useState<string>('president')

  // Check authorization - block agents from viewing results, restrict volunteers to president
  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }

    const user = JSON.parse(userStr)
    setUserRole(user.role)

    if (user.role === 'agent') {
      router.push('/dashboard/agent')
      return
    }

    // Force volunteers to only view presidential results
    if (user.role === 'observer') {
      setSelectedPosition('president')
    }
  }, [router])

  const fetchResults = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('position', selectedPosition)
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

  const fetchPollingStations = async () => {
    setStationsLoading(true)
    try {
      const params = new URLSearchParams()
      if (countyId) params.append('county_id', countyId.toString())
      if (constituencyId) params.append('constituency_id', constituencyId.toString())
      if (wardId) params.append('ward_id', wardId.toString())
      if (stationStatusFilter !== 'all') params.append('status', stationStatusFilter)

      const token = localStorage.getItem('token')
      const response = await fetch(`/api/polling-stations/reporting-status?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setPollingStations(data.stations || [])
        setStationsSummary(data.summary || null)
      }
    } catch (error) {
      console.error('Failed to fetch polling stations:', error)
    } finally {
      setStationsLoading(false)
    }
  }

  const fetchStationDetails = async (stationId: number) => {
    setStationDetailsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/polling-stations/${stationId}/detailed-results`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Station details received:', data)
        setSelectedStation(data)
      } else {
        const errorData = await response.json()
        console.error('API error response:', errorData)
        alert(`Error: ${errorData.error || 'Failed to fetch station details'}`)
      }
    } catch (error) {
      console.error('Failed to fetch station details:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Network error'}`)
    } finally {
      setStationDetailsLoading(false)
    }
  }

  // Fetch candidate profile on load if logged in
  useEffect(() => {
    const fetchCandidateProfile = async () => {
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const response = await fetch('/api/candidates/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          const profile = data.data as CandidateProfile
          setCandidateProfile(profile)

          // Auto-set position to match candidate's position
          setSelectedPosition(profile.position)

          // Auto-set location filters based on candidate position
          if (profile.position === 'mca' && profile.ward_id) {
            // MCA: Lock to their ward
            setWardId(profile.ward_id)
            setConstituencyId(profile.constituency_id)
            setCountyId(profile.county_id)
          } else if (profile.position === 'mp' && profile.constituency_id) {
            // MP: Lock to their constituency, allow ward selection
            setConstituencyId(profile.constituency_id)
            setCountyId(profile.county_id)
          } else if (
            (profile.position === 'governor' ||
             profile.position === 'senator' ||
             profile.position === 'women_rep') &&
            profile.county_id
          ) {
            // County-level: Lock to their county, allow constituency/ward selection
            setCountyId(profile.county_id)
          }
          // President: No restrictions, show all selectors
        }
      } catch (error) {
        console.error('Failed to fetch candidate profile:', error)
      }
    }

    fetchCandidateProfile()
  }, [])

  // Only re-fetch when location filters actually change
  useEffect(() => {
    if (viewMode === 'aggregate') {
      fetchResults()
    } else {
      fetchPollingStations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countyId, constituencyId, wardId, pollingStationId, viewMode, stationStatusFilter, selectedPosition])

  const handleLocationChange = useCallback((location: any) => {
    // Only update filters that are not locked by candidate position
    if (!candidateProfile) {
      // Not a candidate, allow all changes
      setCountyId(location.countyId)
      setConstituencyId(location.constituencyId)
      setWardId(location.wardId)
      setPollingStationId(location.pollingStationId)
    } else {
      // Candidate: Respect their position restrictions
      if (candidateProfile.position === 'mca') {
        // MCA: Cannot change any location (locked to ward)
        // Keep existing values
      } else if (candidateProfile.position === 'mp') {
        // MP: Can only change ward within their constituency
        setWardId(location.wardId)
      } else if (
        candidateProfile.position === 'governor' ||
        candidateProfile.position === 'senator' ||
        candidateProfile.position === 'women_rep'
      ) {
        // County-level: Can change constituency and ward within their county
        setConstituencyId(location.constituencyId)
        setWardId(location.wardId)
      } else {
        // President: No restrictions
        setCountyId(location.countyId)
        setConstituencyId(location.constituencyId)
        setWardId(location.wardId)
        setPollingStationId(location.pollingStationId)
      }
    }
  }, [candidateProfile])

  // Determine which selectors to show based on candidate position
  const locationSelectorProps = useMemo(() => {
    if (!candidateProfile) {
      // Not a candidate, show all selectors
      return {
        showCounty: true,
        showConstituency: true,
        showWard: true,
      }
    }

    if (candidateProfile.position === 'mca') {
      // MCA: No selectors (locked to their ward)
      return {
        showCounty: false,
        showConstituency: false,
        showWard: false,
      }
    } else if (candidateProfile.position === 'mp') {
      // MP: Only ward selector
      return {
        showCounty: false,
        showConstituency: false,
        showWard: true,
      }
    } else if (
      candidateProfile.position === 'governor' ||
      candidateProfile.position === 'senator' ||
      candidateProfile.position === 'women_rep'
    ) {
      // County-level: Show constituency and ward
      return {
        showCounty: false,
        showConstituency: true,
        showWard: true,
      }
    } else {
      // President: Show all
      return {
        showCounty: true,
        showConstituency: true,
        showWard: true,
      }
    }
  }, [candidateProfile])

  // Memoize initial values to prevent recreation on every render
  const locationInitialValues = useMemo(() => ({
    countyId,
    constituencyId,
    wardId,
    pollingStationId,
  }), [countyId, constituencyId, wardId, pollingStationId])

  // Helper function to get status badge color and text
  const getStatusBadge = (station: PollingStation) => {
    if (station.has_verified === 1) {
      return { text: 'Verified', color: 'bg-green-500/20 text-green-400 border-green-500/50' }
    } else if (station.has_flagged === 1) {
      return { text: 'Flagged', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' }
    } else if (station.has_pending === 1) {
      return { text: 'Pending', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' }
    } else if (station.submission_count === 0) {
      return { text: 'Not Submitted', color: 'bg-red-500/20 text-red-400 border-red-500/50' }
    } else {
      return { text: 'Submitted', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50' }
    }
  }

  // Helper function to get status icon
  const getStatusIcon = (station: PollingStation) => {
    if (station.has_verified === 1) {
      return '✓'
    } else if (station.has_flagged === 1) {
      return '⚠'
    } else if (station.has_pending === 1) {
      return '⏳'
    } else if (station.submission_count === 0) {
      return '✗'
    } else {
      return '•'
    }
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Election Results</h1>
            <p className="text-dark-300">Real-time results aggregation by location</p>
          </div>

          {/* Review Submissions Button - Only for Admin and Candidates */}
          {(userRole === 'admin' || userRole === 'candidate') && (
            <button
              onClick={() => router.push('/dashboard/admin/review-submissions')}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Review Submissions
            </button>
          )}
        </div>

        {/* View Toggle Tabs */}
        <div className="mb-6 flex gap-4 flex-wrap items-center">
          <div className="glass-effect rounded-xl p-2 inline-flex gap-2">
            <button
              onClick={() => setViewMode('aggregate')}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                viewMode === 'aggregate'
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'text-dark-300 hover:text-white hover:bg-dark-800'
              }`}
            >
              Aggregated Results
            </button>
            <button
              onClick={() => setViewMode('stations')}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                viewMode === 'stations'
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'text-dark-300 hover:text-white hover:bg-dark-800'
              }`}
            >
              Polling Stations
            </button>
          </div>

          {/* Position Selector - Only for Aggregate View */}
          {viewMode === 'aggregate' && (
            <div className="glass-effect rounded-xl p-2 inline-flex items-center gap-2">
              <span className="text-sm text-dark-400 px-2">Position:</span>
              <select
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
                disabled={!!candidateProfile || userRole === 'observer'}
                className={`px-4 py-2 bg-dark-800 text-white rounded-lg border border-dark-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-medium uppercase text-sm ${
                  candidateProfile || userRole === 'observer' ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                <option value="president">President</option>
                <option value="governor">Governor</option>
                <option value="senator">Senator</option>
                <option value="women_rep">Women Representative</option>
                <option value="mp">Member of Parliament</option>
                <option value="mca">Member of County Assembly</option>
              </select>
              {candidateProfile && (
                <span className="text-xs text-blue-400 px-2">Locked to your position</span>
              )}
              {userRole === 'observer' && (
                <span className="text-xs text-blue-400 px-2">Volunteers can only view presidential results</span>
              )}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <div className="glass-effect rounded-xl p-6 sticky top-4">
              <h2 className="text-xl font-semibold text-white mb-4">Filter by Location</h2>

              {/* Show candidate's electoral area if logged in as candidate */}
              {candidateProfile && (
                <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-xs text-blue-300 mb-1">Your Electoral Area</p>
                  <p className="text-sm font-semibold text-white">{candidateProfile.electoral_area}</p>
                  <p className="text-xs text-blue-400 mt-1">
                    {candidateProfile.position === 'mca' && 'Results locked to your ward'}
                    {candidateProfile.position === 'mp' && 'Select wards within your constituency'}
                    {(candidateProfile.position === 'governor' ||
                      candidateProfile.position === 'senator' ||
                      candidateProfile.position === 'women_rep') && 'Select areas within your county'}
                    {candidateProfile.position === 'president' && 'View results nationwide'}
                  </p>
                </div>
              )}

              <LocationSelector
                key={candidateProfile ? `candidate-${candidateProfile.constituency_id || candidateProfile.county_id || candidateProfile.position}` : 'public'}
                onLocationChange={handleLocationChange}
                showPollingStations={false}
                {...locationSelectorProps}
                initialValues={locationInitialValues}
              />

              {/* Status Filter - Only for Polling Stations View */}
              {viewMode === 'stations' && (
                <div className="mt-6 pt-6 border-t border-dark-700">
                  <h3 className="text-sm font-semibold text-white mb-3">Status Filter</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setStationStatusFilter('all')}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        stationStatusFilter === 'all'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                          : 'text-dark-300 hover:bg-dark-800'
                      }`}
                    >
                      All Stations
                    </button>
                    <button
                      onClick={() => setStationStatusFilter('submitted')}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        stationStatusFilter === 'submitted'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                          : 'text-dark-300 hover:bg-dark-800'
                      }`}
                    >
                      Submitted
                    </button>
                    <button
                      onClick={() => setStationStatusFilter('not_submitted')}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        stationStatusFilter === 'not_submitted'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                          : 'text-dark-300 hover:bg-dark-800'
                      }`}
                    >
                      Not Submitted
                    </button>
                  </div>
                </div>
              )}

              {/* Summary Stats - Aggregate View */}
              {viewMode === 'aggregate' && summary && (
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

              {/* Summary Stats - Stations View */}
              {viewMode === 'stations' && stationsSummary && (
                <div className="mt-6 pt-6 border-t border-dark-700">
                  <h3 className="text-sm font-semibold text-white mb-3">Summary</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-dark-400">Total Stations</p>
                      <p className="text-lg text-white font-bold">
                        {stationsSummary.total_stations}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-400">Reporting</p>
                      <p className="text-lg text-white font-bold">
                        {stationsSummary.submitted_stations} / {stationsSummary.total_stations}
                      </p>
                      <p className="text-xs text-emerald-400">
                        {stationsSummary.reporting_percentage.toFixed(1)}% Complete
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-green-400">Verified</p>
                        <p className="text-sm text-white font-bold">
                          {stationsSummary.verified_stations}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-blue-400">Pending</p>
                        <p className="text-sm text-white font-bold">
                          {stationsSummary.pending_stations}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-yellow-400">Flagged</p>
                        <p className="text-sm text-white font-bold">
                          {stationsSummary.flagged_stations}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-red-400">Not Submitted</p>
                        <p className="text-sm text-white font-bold">
                          {stationsSummary.not_submitted_stations}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {/* Aggregated Results View */}
            {viewMode === 'aggregate' && (
              <>
                <div className="glass-effect rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-white">Aggregate Results - Votes Per Candidate</h2>
                    {results.length > 0 && (
                      <span className="text-sm text-dark-400">{results.length} candidate{results.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>

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
                      className={`glass-effect rounded-xl p-6 border-2 transition-all hover:border-blue-500/50 ${
                        index === 0 ? 'border-yellow-400/50 bg-yellow-400/5' :
                        index === 1 ? 'border-gray-400/50 bg-gray-400/5' :
                        index === 2 ? 'border-orange-400/50 bg-orange-400/5' :
                        'border-dark-700'
                      }`}
                    >
                      <div className="flex gap-6">
                        {/* Rank Badge */}
                        <div className="flex-shrink-0">
                          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                            index === 0 ? 'bg-yellow-400/20 border-2 border-yellow-400' :
                            index === 1 ? 'bg-gray-400/20 border-2 border-gray-400' :
                            index === 2 ? 'bg-orange-400/20 border-2 border-orange-400' :
                            'bg-dark-800 border-2 border-dark-600'
                          }`}>
                            <div className="text-center">
                              <div className={`text-3xl font-bold ${
                                index === 0 ? 'text-yellow-400' :
                                index === 1 ? 'text-gray-300' :
                                index === 2 ? 'text-orange-400' :
                                'text-dark-400'
                              }`}>
                                #{index + 1}
                              </div>
                              {index === 0 && (
                                <svg className="w-5 h-5 text-yellow-400 mx-auto mt-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Photo */}
                        <div className="flex-shrink-0">
                          {result.profile_photo ? (
                            <img
                              src={result.profile_photo}
                              alt={result.candidate_name}
                              className="w-24 h-24 rounded-lg object-cover border-2 border-dark-700"
                            />
                          ) : (
                            <div className="w-24 h-24 rounded-lg bg-dark-800 border-2 border-dark-700 flex items-center justify-center">
                              <svg className="w-12 h-12 text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Candidate Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-2xl font-bold text-white">{result.candidate_name}</h3>
                                {result.candidate_number && (
                                  <span className="px-2 py-1 rounded text-xs font-mono bg-dark-800 text-blue-400 border border-dark-700">
                                    {result.candidate_number}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-2 mb-2">
                                <span className="inline-flex px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium border border-blue-500/30">
                                  {result.party_name}
                                </span>
                                {result.position && (
                                  <span className="inline-flex px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium border border-purple-500/30 uppercase">
                                    {result.position.replace('_', ' ')}
                                  </span>
                                )}
                                {result.electoral_area && (
                                  <span className="inline-flex px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium border border-emerald-500/30">
                                    {result.electoral_area}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Vote Stats */}
                            <div className="text-right ml-4">
                              <div className="text-4xl font-bold text-white mb-1">
                                {result.total_votes.toLocaleString()}
                              </div>
                              <div className="text-2xl font-bold text-emerald-400 mb-1">
                                {result.percentage.toFixed(2)}%
                              </div>
                              <div className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/10 rounded-lg border border-purple-500/30">
                                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <span className="text-xs font-medium text-purple-300">
                                  {result.polling_stations_count} stations
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Vote Share Progress Bar */}
                          <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-dark-400 uppercase font-semibold">Vote Share</span>
                              <span className="text-xs text-dark-400">{result.percentage.toFixed(2)}%</span>
                            </div>
                            <div className="bg-dark-800 rounded-full h-4 overflow-hidden border border-dark-700">
                              <div
                                className={`h-4 rounded-full transition-all duration-700 ${
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
                      </div>
                    </div>
                  ))}

                  {/* Total Summary */}
                  <div className="glass-effect rounded-xl p-6 border-2 border-emerald-500/50 bg-emerald-500/5 mt-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-1">Total Valid Votes</h3>
                        <p className="text-sm text-dark-300">{results.length} candidates competing</p>
                      </div>
                      <div className="text-right">
                        <div className="text-4xl font-bold text-white">
                          {results.reduce((sum, r) => sum + r.total_votes, 0).toLocaleString()}
                        </div>
                        <div className="text-lg font-bold text-emerald-400">100%</div>
                      </div>
                    </div>
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
              </>
            )}

            {/* Polling Stations View */}
            {viewMode === 'stations' && (
              <>
                <div className="glass-effect rounded-xl p-6">
                  <h2 className="text-xl font-semibold text-white mb-6">Polling Stations Reporting Status</h2>

                  {stationsLoading ? (
                    <div className="text-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <p className="mt-4 text-dark-300">Loading polling stations...</p>
                    </div>
                  ) : pollingStations.length > 0 ? (
                    <div className="space-y-3">
                      {pollingStations.map((station) => {
                        const statusBadge = getStatusBadge(station)
                        const statusIcon = getStatusIcon(station)
                        const hasSubmissions = station.submission_count > 0

                        const handleStationClick = () => {
                          console.log('Station clicked:', station.id, 'submission_count:', station.submission_count)
                          if (hasSubmissions) {
                            console.log('Fetching station details for:', station.id)
                            fetchStationDetails(station.id)
                          } else {
                            console.log('No submissions for this station')
                          }
                        }

                        return (
                          <div
                            key={station.id}
                            onClick={handleStationClick}
                            className={`bg-dark-900/50 rounded-lg p-4 border border-dark-700 transition-all ${
                              hasSubmissions
                                ? 'hover:border-blue-500 cursor-pointer hover:shadow-lg'
                                : 'opacity-75'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-2xl">{statusIcon}</span>
                                  <div>
                                    <h3 className="text-lg font-semibold text-white">
                                      {station.name}
                                    </h3>
                                    <p className="text-sm text-dark-300">Code: {station.code}</p>
                                  </div>
                                </div>
                                <p className="text-xs text-dark-400 mt-2">
                                  {station.ward_name} • {station.constituency_name} • {station.county_name}
                                </p>
                                <p className="text-xs text-dark-400 mt-1">
                                  Registered Voters: {station.registered_voters.toLocaleString()}
                                </p>
                                {station.last_submitted_at && (
                                  <p className="text-xs text-dark-500 mt-1">
                                    Last submitted: {new Date(station.last_submitted_at).toLocaleString()}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusBadge.color}`}>
                                  {statusBadge.text}
                                </span>
                                {hasSubmissions && (
                                  <span className="text-xs text-dark-400">
                                    {station.submission_count} submission{station.submission_count !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {hasSubmissions && (
                                  <span className="text-xs text-blue-400 hover:text-blue-300">
                                    Click to view details →
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
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
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                      <p className="text-dark-300">No polling stations found</p>
                      <p className="text-sm text-dark-400 mt-2">
                        Try selecting a different area
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Station Details Modal */}
        {selectedStation && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedStation(null)}
          >
            <div
              className="glass-effect rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {stationDetailsLoading ? (
                <div className="p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <p className="mt-4 text-dark-300">Loading station details...</p>
                </div>
              ) : (
                <div className="p-6">
                  {/* Modal Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-2">
                        {selectedStation.polling_station?.name}
                      </h2>
                      <p className="text-dark-300">
                        Code: {selectedStation.polling_station?.code}
                      </p>
                      <p className="text-sm text-dark-400 mt-1">
                        {selectedStation.polling_station?.ward_name} • {selectedStation.polling_station?.constituency_name} • {selectedStation.polling_station?.county_name}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedStation(null)}
                      className="text-dark-300 hover:text-white transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Summary Card */}
                  <div className="mb-6 grid md:grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
                      <p className="text-xs text-blue-300 mb-1">Registered Voters</p>
                      <p className="text-2xl font-bold text-white">{selectedStation.polling_station?.registered_voters.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                      <p className="text-xs text-green-300 mb-1">Total Submissions</p>
                      <p className="text-2xl font-bold text-white">{selectedStation.submission_count}</p>
                      <p className="text-xs text-green-400 mt-1">{selectedStation.verified_count} verified</p>
                    </div>
                    {selectedStation.aggregate_results && (
                      <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                        <p className="text-xs text-emerald-300 mb-1">Total Votes Cast</p>
                        <p className="text-2xl font-bold text-white">{selectedStation.aggregate_results.total_votes_cast.toLocaleString()}</p>
                        <p className="text-xs text-emerald-400 mt-1">{selectedStation.aggregate_results.rejected_votes.toLocaleString()} rejected</p>
                      </div>
                    )}
                  </div>

                  {/* Aggregate Results */}
                  {selectedStation.aggregate_results && selectedStation.aggregate_results.candidates.length > 0 && (
                    <div className="mb-6 p-6 bg-gradient-to-br from-blue-500/10 to-emerald-500/10 rounded-xl border border-blue-500/30">
                      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Votes Per Candidate (Verified Submissions)
                      </h3>
                      <div className="space-y-4">
                        {selectedStation.aggregate_results.candidates.map((candidate: any, idx: number) => (
                          <div key={idx} className="bg-dark-900/50 rounded-lg p-4 border border-dark-700">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-2xl font-bold text-emerald-400">#{idx + 1}</span>
                                  <div>
                                    <p className="text-lg font-semibold text-white">{candidate.candidate_name}</p>
                                    <p className="text-sm text-dark-400">{candidate.party_name}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-3xl font-bold text-white">{candidate.total_votes.toLocaleString()}</p>
                                <p className="text-sm text-emerald-400">{candidate.percentage.toFixed(2)}% of votes</p>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="w-full bg-dark-800 rounded-full h-3">
                              <div
                                className="bg-gradient-to-r from-blue-500 to-emerald-500 h-3 rounded-full transition-all"
                                style={{ width: `${candidate.percentage}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 pt-4 border-t border-dark-700 grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <p className="text-sm text-dark-400">Total Votes Cast</p>
                          <p className="text-xl font-bold text-white">{selectedStation.aggregate_results.total_votes_cast.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-dark-400">Rejected Votes</p>
                          <p className="text-xl font-bold text-red-400">{selectedStation.aggregate_results.rejected_votes.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Individual Submissions */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Individual Submissions ({selectedStation.submission_count})
                    </h3>
                    <div className="space-y-4">
                      {selectedStation.submissions?.map((submission: any) => (
                        <div key={submission.id} className="p-4 bg-dark-900/30 rounded-lg border border-dark-700">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-white font-medium">{submission.candidate_name}</p>
                              <p className="text-sm text-dark-400">{submission.candidate_party}</p>
                              <p className="text-xs text-dark-500 mt-1">
                                Submitted by: {submission.submitter_name} ({submission.submitter_phone})
                              </p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                              submission.status === 'verified'
                                ? 'bg-green-500/20 text-green-400 border-green-500/50'
                                : submission.status === 'pending'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                                : submission.status === 'flagged'
                                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                                : 'bg-red-500/20 text-red-400 border-red-500/50'
                            }`}>
                              {submission.status}
                            </span>
                          </div>

                          {/* Vote Details Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 p-3 bg-dark-800/50 rounded-lg">
                            <div className="text-center">
                              <p className="text-xs text-dark-400 mb-1">Votes for Candidate</p>
                              <p className="text-xl text-emerald-400 font-bold">{submission.votes_received?.toLocaleString() || '0'}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-dark-400 mb-1">Total Votes Cast</p>
                              <p className="text-xl text-white font-bold">{submission.total_votes_cast?.toLocaleString() || 'N/A'}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-dark-400 mb-1">Valid Votes</p>
                              <p className="text-xl text-blue-400 font-bold">{submission.valid_votes?.toLocaleString() || 'N/A'}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-dark-400 mb-1">Rejected Votes</p>
                              <p className="text-xl text-red-400 font-bold">{submission.rejected_votes?.toLocaleString() || 'N/A'}</p>
                            </div>
                          </div>

                          {/* Registered Voters */}
                          {submission.registered_voters && (
                            <div className="mb-3 p-2 bg-blue-500/10 rounded border border-blue-500/30">
                              <p className="text-xs text-blue-300">
                                Registered Voters: <span className="font-bold">{submission.registered_voters.toLocaleString()}</span>
                                {submission.total_votes_cast && (
                                  <span className="ml-2">
                                    • Turnout: <span className="font-bold">{((submission.total_votes_cast / submission.registered_voters) * 100).toFixed(2)}%</span>
                                  </span>
                                )}
                              </p>
                            </div>
                          )}

                          {/* Validation Errors */}
                          {submission.validation_errors && (
                            <div className="mb-3 p-2 bg-yellow-500/10 rounded border border-yellow-500/30">
                              <p className="text-xs text-yellow-300">
                                ⚠ Validation Issues: {submission.validation_errors}
                              </p>
                            </div>
                          )}

                          {submission.photos && Array.isArray(submission.photos) && submission.photos.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs text-dark-400 mb-2">Photos:</p>
                              <div className="flex gap-2 flex-wrap">
                                {submission.photos.map((photo: any) => (
                                  <a
                                    key={photo.id}
                                    href={photo.file_path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 bg-blue-500/10 rounded border border-blue-500/30"
                                  >
                                    {photo.photo_type}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {submission.reviews && Array.isArray(submission.reviews) && submission.reviews.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-dark-700">
                              <p className="text-xs text-dark-400 mb-2">Review History:</p>
                              {submission.reviews.map((review: any, idx: number) => (
                                <div key={idx} className="text-xs text-dark-300 mb-1">
                                  <span className="font-medium">{review.action}</span> by {review.reviewer_name}
                                  {review.review_notes && `: ${review.review_notes}`}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

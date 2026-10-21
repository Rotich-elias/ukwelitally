'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'

interface ObserverInfo {
  assignment_id: number
  user_id: number
  polling_station_id: number
  assignment_type: string
  assignment_status: string
  full_name: string
  email: string
  phone: string
  id_number: string
  station_name: string
  station_code: string
  registered_voters: number
  latitude: number
  longitude: number
  ward_name: string
  constituency_name: string
  county_name: string
  volunteer_registration_id: number
  available_positions?: Array<{ position: string; candidate_ids: number[] }>
}

interface SubmissionWindowState {
  status: 'closed' | 'open' | 'scheduled' | 'expired'
  can_submit: boolean
  message: string
  opens_at_display: string
  closes_at_display: string
}

interface ObserverSubmission {
  id: number
  status: string
  review_status: string | null
  submission_type: string
  submitted_at: string
  polling_station_name: string
}

interface Candidate {
  id: number
  candidate_name: string
  party_name: string
  party_abbreviation: string
  position: string
  is_system_user: boolean
}

export default function ObserverDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [observerInfo, setObserverInfo] = useState<ObserverInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [step, setStep] = useState<'form' | 'results'>('form')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    registered_voters: '',
    total_votes_cast: '',
    rejected_votes: '',
    photos: [] as File[],
  })

  const [candidateVotes, setCandidateVotes] = useState<Record<number, string>>({})
  const [position, setPosition] = useState('president')
  const [submissionWindow, setSubmissionWindow] = useState<SubmissionWindowState | null>(null)
  const [accountActive, setAccountActive] = useState(true)
  const [mySubmissions, setMySubmissions] = useState<ObserverSubmission[]>([])
  const [availablePositions, setAvailablePositions] = useState<
    Array<{ position: string; candidate_ids: number[] }>
  >([])

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      router.push('/login')
      return
    }

    const parsedUser = JSON.parse(userData)
    setUser(parsedUser)

    // Verify the user has observer role
    if (parsedUser.role !== 'observer') {
      router.push('/login')
      return
    }

    // Fetch observer info and polling station assignment
    const fetchObserverInfo = async () => {
      try {
        const response = await fetch('/api/observers/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          setObserverInfo(data.data)

          // The observer picks the race they are reporting. Every race that
          // has a candidate in their area can be reported.
          const positions = data.data.available_positions || []
          setAvailablePositions(positions)
          if (positions.length > 0) {
            const preferred = positions.find((p: any) => p.position === 'president')
            setPosition((preferred || positions[0]).position)
          }

        } else {
          setError('Failed to load observer information')
        }
      } catch (err) {
        console.error('Failed to fetch observer info:', err)
        setError('Failed to load observer information')
      } finally {
        setLoadingInfo(false)
        setLoading(false)
      }
    }

    fetchObserverInfo()
  }, [router])

  // The candidates of the race the observer reports.
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    setLoadingCandidates(true)
    fetch(`/api/candidates?position=${position}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json()
          setCandidates(data.candidates || [])
        }
      })
      .catch((err) => console.error('Failed to fetch candidates:', err))
      .finally(() => setLoadingCandidates(false))
  }, [position])

  // The reporting window and the observer's own submissions follow the
  // position the observer reports.
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    const fetchWindow = async () => {
      try {
        const response = await fetch(`/api/submissions/window?position=${position}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.ok) {
          const data = await response.json()
          setSubmissionWindow(data.window)
          setAccountActive(data.account_active !== false)
        }
      } catch (err) {
        console.error('Failed to fetch the reporting window:', err)
      }
    }

    const fetchMySubmissions = async () => {
      try {
        const response = await fetch('/api/submissions', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.ok) {
          const data = await response.json()
          setMySubmissions(data.submissions || [])
        }
      } catch (err) {
        console.error('Failed to fetch your submissions:', err)
      }
    }

    fetchWindow()
    fetchMySubmissions()
  }, [position])

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFormData({ ...formData, photos: Array.from(e.target.files) })
    }
  }

  const handleSubmitPresidentialResults = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      if (!observerInfo) {
        throw new Error('Observer info not loaded')
      }

      const token = localStorage.getItem('token')

      // Create submission first
      const submitData = new FormData()
      submitData.append('polling_station_id', observerInfo.polling_station_id.toString())
      submitData.append('submission_type', 'backup') // Observer submissions are backup type
      submitData.append('position', position)

      // Add photos
      formData.photos.forEach((photo, index) => {
        submitData.append(`full_form_${index}`, photo)
      })

      const submissionResponse = await fetch('/api/submissions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: submitData,
      })

      const submissionData = await submissionResponse.json()

      if (!submissionResponse.ok) {
        throw new Error(submissionData.error || 'Submission failed')
      }

      // Prepare candidate votes
      const candidateVotesArray = candidates.map((candidate) => ({
        candidate_name: candidate.candidate_name,
        party_name: candidate.party_name,
        votes: parseInt(candidateVotes[candidate.id] || '0'),
      }))

      const validVotes = candidateVotesArray.reduce((sum, cv) => sum + cv.votes, 0)

      // Submit results
      const resultsResponse = await fetch('/api/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          submission_id: submissionData.submission.id,
          position,
          registered_voters: parseInt(formData.registered_voters),
          total_votes_cast: parseInt(formData.total_votes_cast),
          valid_votes: validVotes,
          rejected_votes: parseInt(formData.rejected_votes),
          candidate_votes: candidateVotesArray,
          manually_verified: false,
        }),
      })

      const resultsData = await resultsResponse.json()

      if (!resultsResponse.ok) {
        throw new Error(resultsData.error || 'Failed to submit results')
      }

      setSuccess('Alternative result submitted. It is waiting for the candidate to review it.')
      
      // Reset form
      setFormData({
        registered_voters: '',
        total_votes_cast: '',
        rejected_votes: '',
        photos: [],
      })
      setCandidateVotes({})
      setStep('form')
    } catch (err: any) {
      setError(err.message || 'Failed to submit the alternative result')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Election Observer</h1>
          <p className="text-dark-300">
            Welcome, {user?.full_name}. Submit alternative results for your assigned polling
            station.
          </p>
        </div>

        {/* Reporting window status */}
        {submissionWindow && (
          <div
            className={`mb-6 rounded-xl p-5 border ${
              submissionWindow.can_submit
                ? 'bg-emerald-500/10 border-emerald-500/40'
                : 'bg-orange-500/10 border-orange-500/40'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-white font-semibold">
                  Result submission is {submissionWindow.status}
                </h3>
                <p className="text-sm text-dark-200 mt-1">{submissionWindow.message}</p>
                {!accountActive && (
                  <p className="text-sm text-red-300 mt-1">
                    Your account is not active. Contact an administrator to restore it.
                  </p>
                )}
              </div>
              <div className="text-xs text-dark-300 text-right">
                <p>
                  Opens: <span className="text-white font-medium">{submissionWindow.opens_at_display}</span>
                </p>
                <p>
                  Closes: <span className="text-white font-medium">{submissionWindow.closes_at_display}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Observer notice */}
        <div className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-1">How observer results are used</h3>
          <p className="text-sm text-dark-200">
            Your result is an alternative result. It is stored separately from the agent result
            and it never replaces it. The candidate reviews your submission and may approve it as
            the fallback for a polling station where no agent reported.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg text-sm mb-6">
            {success}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <div className="glass-effect rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6">Submit Alternative Result</h2>

              {/* Race selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-200 mb-2">
                  Election race you are reporting
                </label>
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  disabled={availablePositions.length === 0}
                  className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm disabled:opacity-50"
                >
                  {availablePositions.map((entry) => (
                    <option key={entry.position} value={entry.position}>
                      {entry.position.replace(/_/g, ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-400 mt-2">
                  {availablePositions.length > 0
                    ? 'Only the races that have a candidate reporting at your polling station can be reported.'
                    : 'No candidate is reporting at your polling station yet, so there is no race to report. The candidate has to assign a team to this station first.'}
                </p>
              </div>

              <form onSubmit={handleSubmitPresidentialResults} className="space-y-6">
                {/* Photo Upload */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Form 34A Photos
                  </label>
                  <div className="border-2 border-dashed border-dark-700 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      id="photo-upload"
                      multiple
                      required
                    />
                    <label htmlFor="photo-upload" className="cursor-pointer">
                      {formData.photos.length > 0 ? (
                        <div className="text-emerald-400">
                          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <p>{formData.photos.length} photo(s) selected</p>
                        </div>
                      ) : (
                        <div className="text-dark-400">
                          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p>Click to upload Form 34A photos</p>
                          <p className="text-xs mt-1">PNG, JPG - Multiple files allowed</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {/* Overall Statistics */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-400 mb-3">Station Statistics</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Registered Voters</label>
                      <input
                        type="number"
                        value={formData.registered_voters}
                        onChange={(e) => setFormData({ ...formData, registered_voters: e.target.value })}
                        className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                        placeholder="0"
                        required
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Total Votes Cast</label>
                      <input
                        type="number"
                        value={formData.total_votes_cast}
                        onChange={(e) => setFormData({ ...formData, total_votes_cast: e.target.value })}
                        className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                        placeholder="0"
                        required
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Rejected Votes</label>
                      <input
                        type="number"
                        value={formData.rejected_votes}
                        onChange={(e) => setFormData({ ...formData, rejected_votes: e.target.value })}
                        className="w-full px-3 py-2 bg-dark-900/50 border border-dark-700 rounded text-white text-sm"
                        placeholder="0"
                        required
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                {/* Presidential Candidate Votes */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">
                    {position.replace(/_/g, ' ').toUpperCase()} Candidate Votes
                  </h3>
                  {loadingCandidates ? (
                    <div className="text-center py-8 text-dark-400">Loading candidates...</div>
                  ) : candidates.length > 0 ? (
                    <div className="space-y-3">
                      {candidates.map((candidate) => (
                        <div key={candidate.id} className="bg-dark-900/50 border border-dark-700 rounded-lg p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-white font-medium">{candidate.candidate_name}</h4>
                                {candidate.is_system_user && (
                                  <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">
                                    System User
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-dark-400">
                                {candidate.party_name} {candidate.party_abbreviation && `(${candidate.party_abbreviation})`}
                              </p>
                            </div>
                            <div className="w-32">
                              <input
                                type="number"
                                value={candidateVotes[candidate.id] || ''}
                                onChange={(e) => setCandidateVotes({ ...candidateVotes, [candidate.id]: e.target.value })}
                                className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-white text-right"
                                placeholder="0"
                                required
                                min="0"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-yellow-400">
                      No candidates found for this race. Please contact admin.
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    candidates.length === 0 ||
                    availablePositions.length === 0 ||
                    submissionWindow?.can_submit === false
                  }
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? 'Submitting...'
                    : submissionWindow?.can_submit === false
                      ? 'Result submission is closed'
                      : 'Submit Alternative Result'}
                </button>
                {submissionWindow?.can_submit === false && (
                  <p className="text-xs text-orange-300 text-center">{submissionWindow.message}</p>
                )}
              </form>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* My submissions */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">My Submissions</h3>
              {mySubmissions.length === 0 ? (
                <p className="text-sm text-dark-400">
                  You have not submitted any result yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {mySubmissions.slice(0, 5).map((submission) => (
                    <div
                      key={submission.id}
                      className="bg-dark-900/50 border border-dark-700 rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm text-white font-medium truncate">
                          {submission.polling_station_name || 'Polling station'}
                        </p>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                            submission.review_status === 'approved_fallback'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : submission.review_status === 'rejected_fallback'
                                ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                                : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                          }`}
                        >
                          {submission.review_status === 'approved_fallback'
                            ? 'Approved fallback'
                            : submission.review_status === 'rejected_fallback'
                              ? 'Rejected'
                              : 'Awaiting review'}
                        </span>
                      </div>
                      <p className="text-xs text-dark-400">
                        {new Date(submission.submitted_at).toLocaleString('en-KE')} ·{' '}
                        {submission.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Polling Station Info */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Your Assigned Polling Station</h3>
              {loadingInfo ? (
                <p className="text-sm text-dark-400">Loading...</p>
              ) : observerInfo ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-dark-400">Station Name</p>
                    <p className="text-sm text-white font-medium">{observerInfo.station_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dark-400">Station Code</p>
                    <p className="text-sm text-white font-medium">{observerInfo.station_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dark-400">Registered Voters</p>
                    <p className="text-sm text-white font-medium">{observerInfo.registered_voters?.toLocaleString() || 'N/A'}</p>
                  </div>
                  <div className="pt-2 border-t border-dark-700">
                    <p className="text-xs text-dark-400">Location</p>
                    <p className="text-sm text-white">{observerInfo.ward_name}</p>
                    <p className="text-xs text-dark-400">{observerInfo.constituency_name}, {observerInfo.county_name}</p>
                  </div>
                  <div className="pt-2 border-t border-dark-700">
                    <p className="text-xs text-dark-400">Assignment Type</p>
                    <p className="text-sm text-white font-medium capitalize">{observerInfo.assignment_type}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-yellow-400">No polling station assigned</p>
              )}
            </div>

            {/* Instructions */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Observer Instructions</h3>
              <ul className="space-y-2 text-sm text-dark-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">1.</span>
                  <span>Take clear photos of Form 34A (Presidential)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">2.</span>
                  <span>Fill in all presidential candidate vote counts accurately</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">3.</span>
                  <span>Verify all numbers before submitting</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">4.</span>
                  <span>Submit as soon as counting is complete</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">5.</span>
                  <span>Focus only on presidential results</span>
                </li>
              </ul>
            </div>

            {/* Quick Actions */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => router.push('/results')}
                  className="w-full flex items-center justify-between p-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors text-sm"
                >
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="text-white">View Live Results</span>
                  </div>
                  <svg className="w-3 h-3 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <button
                  onClick={() => router.push('/offline')}
                  className="w-full flex items-center justify-between p-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg transition-colors text-sm"
                >
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-purple-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                    <span className="text-white">Offline Mode</span>
                  </div>
                  <svg className="w-3 h-3 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
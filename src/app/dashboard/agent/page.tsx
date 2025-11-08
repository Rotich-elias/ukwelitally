'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'

interface AgentInfo {
  agent_id: number
  candidate_id: number
  full_name: string
  candidate_name: string
  candidate_position: string
  station_name: string
  station_code: string
  registered_voters: number
  ward_name: string
  constituency_name: string
  county_name: string
  polling_station_id: number
}

interface Candidate {
  id: number
  candidate_name: string
  party_name: string
  party_abbreviation: string
  position: string
  is_system_user: boolean
}

interface FlaggedSubmission {
  id: number
  status: string
  flagged_reason: string | null
  has_discrepancy: boolean
  confidence_score: number
  review_notes: string | null
}

export default function AgentDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [submissionId, setSubmissionId] = useState<number | null>(null)
  const [step, setStep] = useState<'upload' | 'results'>('upload')
  const [flaggedSubmission, setFlaggedSubmission] = useState<FlaggedSubmission | null>(null)
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)

  const [formData, setFormData] = useState({
    registered_voters: '',
    total_votes_cast: '',
    rejected_votes: '',
    photos: [] as File[],
  })

  const [candidateVotes, setCandidateVotes] = useState<Record<number, string>>({})

  // Fetch recent submissions helper
  const fetchRecentSubmissions = async (authToken: string) => {
    setLoadingSubmissions(true)
    try {
      const response = await fetch('/api/submissions', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setRecentSubmissions(data.submissions || [])
      }
    } catch (err) {
      console.error('Failed to fetch recent submissions:', err)
    } finally {
      setLoadingSubmissions(false)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    // Fetch agent info
    const fetchAgentInfo = async () => {
      try {
        const response = await fetch('/api/agents/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          const info = data.data
          setAgentInfo(info)

          // Fetch candidates for this position
          if (info.candidate_position) {
            fetchCandidates(info.candidate_position)
          }

          // Check for flagged submissions
          checkFlaggedSubmissions(token)

          // Fetch recent submissions
          fetchRecentSubmissions(token)
        }
      } catch (err) {
        console.error('Failed to fetch agent info:', err)
      } finally {
        setLoadingInfo(false)
      }
    }

    const checkFlaggedSubmissions = async (authToken: string) => {
      try {
        const response = await fetch('/api/submissions?status=flagged', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          if (data.submissions && data.submissions.length > 0) {
            const flagged = data.submissions[0]

            // Fetch review notes if available
            const reviewResponse = await fetch(`/api/submissions/${flagged.id}/reviews`, {
              headers: {
                'Authorization': `Bearer ${authToken}`,
              },
            }).catch(() => null)

            let reviewNotes = null
            if (reviewResponse && reviewResponse.ok) {
              const reviewData = await reviewResponse.json()
              if (reviewData.reviews && reviewData.reviews.length > 0) {
                reviewNotes = reviewData.reviews[0].review_notes
              }
            }

            setFlaggedSubmission({
              ...flagged,
              review_notes: reviewNotes,
            })
          }
        }
      } catch (err) {
        console.error('Failed to check flagged submissions:', err)
      }
    }

    const fetchCandidates = async (position: string) => {
      setLoadingCandidates(true)
      try {
        const response = await fetch(`/api/candidates?position=${position}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          setCandidates(data.candidates || [])
        }
      } catch (err) {
        console.error('Failed to fetch candidates:', err)
      } finally {
        setLoadingCandidates(false)
      }
    }

    fetchAgentInfo()
  }, [router])

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFormData({ ...formData, photos: Array.from(e.target.files) })
    }
  }

  // Step 1: Upload photos and create submission
  const handleUploadSubmission = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (!agentInfo) {
        throw new Error('Agent info not loaded')
      }

      const token = localStorage.getItem('token')
      const submitData = new FormData()
      submitData.append('polling_station_id', agentInfo.polling_station_id.toString())
      submitData.append('candidate_id', agentInfo.candidate_id.toString()) // Use agent's candidate
      submitData.append('submission_type', 'primary')

      // Add photos
      formData.photos.forEach((photo, index) => {
        submitData.append(`full_form_${index}`, photo)
      })

      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: submitData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setSubmissionId(data.submission.id)
      setStep('results')
      setSuccess('Photos uploaded! Now enter results for each candidate.')
    } catch (err: any) {
      setError(err.message || 'Failed to upload submission')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Submit results with all candidate votes
  const handleSubmitResults = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (!submissionId || !agentInfo) {
        throw new Error('Missing submission or agent info')
      }

      const token = localStorage.getItem('token')

      // Prepare candidate votes
      const candidateVotesArray = candidates.map((candidate) => ({
        candidate_name: candidate.candidate_name,
        party_name: candidate.party_name,
        votes: parseInt(candidateVotes[candidate.id] || '0'),
      }))

      const validVotes = candidateVotesArray.reduce((sum, cv) => sum + cv.votes, 0)

      const response = await fetch('/api/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          submission_id: submissionId,
          position: agentInfo.candidate_position,
          registered_voters: parseInt(formData.registered_voters),
          total_votes_cast: parseInt(formData.total_votes_cast),
          valid_votes: validVotes,
          rejected_votes: parseInt(formData.rejected_votes),
          candidate_votes: candidateVotesArray,
          manually_verified: false,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit results')
      }

      setSuccess('Results submitted successfully!')

      // Refresh submissions list
      if (token) {
        fetchRecentSubmissions(token)
      }

      // Reset form
      setFormData({
        registered_voters: '',
        total_votes_cast: '',
        rejected_votes: '',
        photos: [],
      })
      setCandidateVotes({})
      setSubmissionId(null)
      setStep('upload')
    } catch (err: any) {
      setError(err.message || 'Failed to submit results')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Agent Dashboard</h1>
          <p className="text-dark-300">Submit polling station results</p>
        </div>

        {/* Revision Required Notification */}
        {flaggedSubmission && (
          <div className="mb-6 bg-yellow-500/10 border-2 border-yellow-500/50 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-yellow-400 mb-2">
                  ⚠️ Revision Required
                </h3>
                <p className="text-white mb-3">
                  Your submission has been reviewed by an admin and requires revision. Please review the feedback below and resubmit with corrections.
                </p>

                {flaggedSubmission.flagged_reason && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3">
                    <p className="text-sm font-medium text-red-400 mb-1">Issues Detected:</p>
                    <p className="text-red-300 text-sm">{flaggedSubmission.flagged_reason}</p>
                  </div>
                )}

                {flaggedSubmission.review_notes && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
                    <p className="text-sm font-medium text-blue-400 mb-1">Admin Feedback:</p>
                    <p className="text-blue-300 text-sm">{flaggedSubmission.review_notes}</p>
                  </div>
                )}

                <div className="flex items-center gap-4 mt-4">
                  <div className="text-sm text-dark-300">
                    <span className="font-medium text-white">Confidence Score:</span>{' '}
                    <span className={`font-bold ${
                      flaggedSubmission.confidence_score >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {flaggedSubmission.confidence_score}%
                    </span>
                  </div>
                  <div className="text-sm text-dark-300">
                    <span className="font-medium text-white">Status:</span>{' '}
                    <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">
                      {flaggedSubmission.status}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-yellow-500/30">
                  <p className="text-sm text-yellow-200">
                    <strong>Next Step:</strong> Upload new photos and results below. The old submission will be replaced automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <div className="glass-effect rounded-xl p-6">
              {/* Progress Indicator */}
              <div className="mb-6">
                <div className="flex items-center justify-center gap-4">
                  <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-blue-400' : 'text-emerald-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'upload' ? 'bg-blue-500' : 'bg-emerald-500'}`}>
                      {step === 'results' ? '✓' : '1'}
                    </div>
                    <span className="text-sm font-medium">Upload Photos</span>
                  </div>
                  <div className="h-0.5 w-16 bg-dark-700"></div>
                  <div className={`flex items-center gap-2 ${step === 'results' ? 'text-blue-400' : 'text-dark-500'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'results' ? 'bg-blue-500' : 'bg-dark-700'}`}>
                      2
                    </div>
                    <span className="text-sm font-medium">Enter Results</span>
                  </div>
                </div>
              </div>

              <h2 className="text-xl font-semibold text-white mb-6">
                {step === 'upload' ? 'Step 1: Upload Form 34A' : 'Step 2: Enter Results'}
              </h2>

              {step === 'upload' ? (
                <form onSubmit={handleUploadSubmission} className="space-y-6">
                  {/* Success Message */}
                  {success && (
                    <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg text-sm">
                      {success}
                    </div>
                  )}

                  {/* Error Message */}
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

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

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Uploading...' : 'Upload & Continue'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmitResults} className="space-y-6">
                  {/* Success Message */}
                  {success && (
                    <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg text-sm">
                      {success}
                    </div>
                  )}

                  {/* Error Message */}
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

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

                  {/* Candidate Votes */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Votes per Candidate</h3>
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
                        No candidates found for this position. Please contact admin.
                      </div>
                    )}
                  </div>

                  {/* Submit Buttons */}
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setStep('upload')}
                      className="px-6 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading || candidates.length === 0}
                      className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Submitting...' : 'Submit Results'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Sidebar - Quick Stats */}
          <div className="space-y-6">
            {/* Station Info */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Polling Station</h3>
              {loadingInfo ? (
                <p className="text-sm text-dark-400">Loading...</p>
              ) : agentInfo ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-dark-400">Station Name</p>
                    <p className="text-sm text-white font-medium">{agentInfo.station_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dark-400">Station Code</p>
                    <p className="text-sm text-white font-medium">{agentInfo.station_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dark-400">Registered Voters</p>
                    <p className="text-sm text-white font-medium">{agentInfo.registered_voters?.toLocaleString() || 'N/A'}</p>
                  </div>
                  <div className="pt-2 border-t border-dark-700">
                    <p className="text-xs text-dark-400">Location</p>
                    <p className="text-sm text-white">{agentInfo.ward_name}</p>
                    <p className="text-xs text-dark-400">{agentInfo.constituency_name}, {agentInfo.county_name}</p>
                  </div>
                  <div className="pt-2 border-t border-dark-700">
                    <p className="text-xs text-dark-400">Representing</p>
                    <p className="text-sm text-white font-medium">{agentInfo.candidate_name}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-yellow-400">No polling station assigned</p>
              )}
            </div>

            {/* Instructions */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Instructions</h3>
              <ul className="space-y-2 text-sm text-dark-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">1.</span>
                  <span>Take a clear photo of Form 34A</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">2.</span>
                  <span>Fill in all vote counts accurately</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">3.</span>
                  <span>Verify all numbers before submitting</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">4.</span>
                  <span>Submit as soon as counting is complete</span>
                </li>
              </ul>
            </div>

            {/* Recent Submissions */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Submissions</h3>

              {loadingSubmissions ? (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                  <p className="mt-2 text-xs text-dark-400">Loading...</p>
                </div>
              ) : recentSubmissions.length > 0 ? (
                <div className="space-y-3">
                  {recentSubmissions.slice(0, 5).map((submission) => (
                    <div
                      key={submission.id}
                      className="bg-dark-900/50 border border-dark-700 rounded-lg p-3 hover:border-blue-500 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">
                            {submission.polling_station_name}
                          </p>
                          <p className="text-xs text-dark-400">
                            {new Date(submission.submitted_at).toLocaleDateString('en-KE', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                          submission.status === 'verified'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : submission.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                            : submission.status === 'flagged'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {submission.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="text-dark-400">Confidence:</span>
                          <span className={`font-bold ${
                            submission.confidence_score >= 80 ? 'text-emerald-400' :
                            submission.confidence_score >= 60 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {submission.confidence_score}%
                          </span>
                        </div>
                        {submission.location_verified && (
                          <div className="flex items-center gap-1 text-emerald-400">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            <span>Verified</span>
                          </div>
                        )}
                      </div>

                      {submission.has_discrepancy && (
                        <div className="mt-2 pt-2 border-t border-dark-700">
                          <p className="text-xs text-red-400">⚠ Has discrepancy</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {recentSubmissions.length > 5 && (
                    <p className="text-xs text-center text-dark-400 pt-2">
                      Showing 5 of {recentSubmissions.length} submissions
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <svg className="w-12 h-12 mx-auto text-dark-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm text-dark-400">No submissions yet</p>
                  <p className="text-xs text-dark-500 mt-1">Upload your first Form 34A above</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

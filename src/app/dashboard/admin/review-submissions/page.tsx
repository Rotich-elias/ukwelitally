'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'

interface ReviewSubmission {
  id: number
  status: string
  submission_type: string
  confidence_score: number
  location_verified: boolean
  has_discrepancy: boolean
  flagged_reason: string | null
  submitted_at: string
  submitter_name: string
  submitter_email: string
  submitter_phone: string
  polling_station_name: string
  polling_station_code: string
  ward_name: string
  constituency_name: string
  county_name: string
  candidate_name: string
  candidate_party: string
  photo_count: number
  registered_voters: number | null
  total_votes_cast: number | null
  valid_votes: number | null
  rejected_votes: number | null
  validation_errors: any
  photos: Array<{
    id: number
    photo_type: string
    file_path: string
  }>
}

export default function ReviewSubmissionsPage() {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<ReviewSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'flagged' | 'anomalies'>('all')
  const [selectedSubmission, setSelectedSubmission] = useState<ReviewSubmission | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')

  // Check authorization - Allow admins and candidates
  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }

    const user = JSON.parse(userStr)
    if (user.role !== 'admin' && user.role !== 'candidate') {
      router.push('/dashboard')
      return
    }
  }, [router])

  const fetchSubmissions = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/submissions/review-queue?filter=${filter}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setSubmissions(data.submissions || [])
      }
    } catch (error) {
      console.error('Failed to fetch submissions:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSubmissions()
  }, [filter])

  const handleReviewAction = async (submissionId: number, action: 'approve' | 'reject' | 'request_revision') => {
    setActionLoading(true)
    try {
      const token = localStorage.getItem('token')
      console.log('[Frontend] Submitting review:', { submissionId, action, hasNotes: !!reviewNotes })

      const response = await fetch(`/api/submissions/${submissionId}/review`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          review_notes: reviewNotes,
        }),
      })

      console.log('[Frontend] Response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('[Frontend] Review successful:', data)
        // Refresh list
        await fetchSubmissions()
        setShowDetailModal(false)
        setSelectedSubmission(null)
        setReviewNotes('')
        alert(`Submission ${action}d successfully!`)
      } else {
        const error = await response.json()
        console.error('[Frontend] Review error:', error)
        alert(`Error: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('[Frontend] Failed to review submission:', error)
      alert(`Failed to submit review: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setActionLoading(false)
    }
  }

  const openDetailModal = (submission: ReviewSubmission) => {
    setSelectedSubmission(submission)
    setShowDetailModal(true)
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      verified: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      flagged: 'bg-red-500/20 text-red-400 border-red-500/30',
      rejected: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    }
    return colors[status as keyof typeof colors] || colors.pending
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400'
    if (score >= 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Review Submissions</h1>
          <p className="text-dark-300">Review and approve pending submissions</p>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex gap-2">
          {[
            { key: 'all', label: 'All', badge: submissions.length },
            { key: 'anomalies', label: 'Anomalies', badge: submissions.filter(s => s.has_discrepancy).length },
            { key: 'flagged', label: 'Flagged', badge: submissions.filter(s => s.status === 'flagged').length },
            { key: 'pending', label: 'Pending', badge: submissions.filter(s => s.status === 'pending').length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-blue-500 text-white'
                  : 'glass-effect text-dark-300 hover:text-white'
              }`}
            >
              {tab.label}
              {!loading && <span className="ml-2 text-xs opacity-75">({tab.badge})</span>}
            </button>
          ))}
        </div>

        {/* Submissions List */}
        <div className="glass-effect rounded-xl p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-dark-300">Loading submissions...</p>
            </div>
          ) : submissions.length > 0 ? (
            <div className="space-y-4">
              {submissions.map((submission) => (
                <div
                  key={submission.id}
                  className="bg-dark-900/50 rounded-lg p-4 border border-dark-700 hover:border-blue-500 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    {/* Left: Submission Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">
                          {submission.polling_station_name}
                        </h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusBadge(submission.status)}`}>
                          {submission.status}
                        </span>
                        {submission.has_discrepancy && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                            Anomaly Detected
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                        <div>
                          <p className="text-dark-400">Location</p>
                          <p className="text-white font-medium">
                            {submission.ward_name}, {submission.constituency_name}
                          </p>
                        </div>
                        <div>
                          <p className="text-dark-400">Candidate</p>
                          <p className="text-white font-medium">{submission.candidate_name}</p>
                          <p className="text-dark-300 text-xs">{submission.candidate_party}</p>
                        </div>
                        <div>
                          <p className="text-dark-400">Submitted By</p>
                          <p className="text-white font-medium">{submission.submitter_name}</p>
                          <p className="text-dark-300 text-xs">{submission.submitter_phone}</p>
                        </div>
                        <div>
                          <p className="text-dark-400">Confidence Score</p>
                          <p className={`font-bold text-lg ${getConfidenceColor(submission.confidence_score)}`}>
                            {submission.confidence_score}%
                          </p>
                        </div>
                      </div>

                      {submission.has_discrepancy && submission.flagged_reason && (
                        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                          <p className="text-red-400 text-sm font-medium">Anomalies Detected:</p>
                          <p className="text-red-300 text-sm mt-1">{submission.flagged_reason}</p>
                        </div>
                      )}

                      {submission.validation_errors && (
                        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                          <p className="text-yellow-400 text-sm font-medium">Validation Errors</p>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-col gap-2 ml-4">
                      <button
                        onClick={() => openDetailModal(submission)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium whitespace-nowrap"
                      >
                        Review Details
                      </button>
                      <div className="text-xs text-dark-400 text-right">
                        {submission.photo_count} photo(s)
                      </div>
                      <div className="text-xs text-dark-400 text-right">
                        {new Date(submission.submitted_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-emerald-400 text-5xl mb-4">✓</div>
              <p className="text-dark-300">No submissions pending review</p>
              <p className="text-sm text-dark-400 mt-2">All caught up!</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedSubmission && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="glass-effect rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-dark-900 border-b border-dark-700 p-6 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">
                  {selectedSubmission.polling_station_name}
                </h2>
                <p className="text-dark-300">
                  {selectedSubmission.ward_name}, {selectedSubmission.constituency_name}, {selectedSubmission.county_name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false)
                  setReviewNotes('')
                }}
                className="text-dark-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Submission Details */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-3">Submission Info</h3>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-dark-400">Status:</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusBadge(selectedSubmission.status)}`}>
                        {selectedSubmission.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">Type:</span>
                      <span className="text-white font-medium capitalize">{selectedSubmission.submission_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">Confidence Score:</span>
                      <span className={`font-bold ${getConfidenceColor(selectedSubmission.confidence_score)}`}>
                        {selectedSubmission.confidence_score}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">Location Verified:</span>
                      <span className={selectedSubmission.location_verified ? 'text-emerald-400' : 'text-red-400'}>
                        {selectedSubmission.location_verified ? '✓ Yes' : '✗ No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-400">Photos:</span>
                      <span className="text-white font-medium">{selectedSubmission.photo_count}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-3">Submitted By</h3>

                  <div className="space-y-2">
                    <div>
                      <p className="text-dark-400 text-sm">Name</p>
                      <p className="text-white font-medium">{selectedSubmission.submitter_name}</p>
                    </div>
                    <div>
                      <p className="text-dark-400 text-sm">Phone Number</p>
                      <p className="text-white font-medium">
                        <a
                          href={`tel:${selectedSubmission.submitter_phone}`}
                          className="hover:text-blue-400 transition-colors"
                        >
                          {selectedSubmission.submitter_phone}
                        </a>
                      </p>
                    </div>
                    <div>
                      <p className="text-dark-400 text-sm">Email</p>
                      <p className="text-white font-medium">
                        <a
                          href={`mailto:${selectedSubmission.submitter_email}`}
                          className="hover:text-blue-400 transition-colors"
                        >
                          {selectedSubmission.submitter_email}
                        </a>
                      </p>
                    </div>
                    <div>
                      <p className="text-dark-400 text-sm">Submitted At</p>
                      <p className="text-white font-medium">
                        {new Date(selectedSubmission.submitted_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Results Data */}
              {selectedSubmission.total_votes_cast !== null && (
                <div className="bg-dark-900/50 rounded-lg p-4 border border-dark-700">
                  <h3 className="text-lg font-semibold text-white mb-3">Vote Counts</h3>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-dark-400 text-sm">Registered Voters</p>
                      <p className="text-white font-bold text-xl">{selectedSubmission.registered_voters?.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-dark-400 text-sm">Total Cast</p>
                      <p className="text-white font-bold text-xl">{selectedSubmission.total_votes_cast?.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-dark-400 text-sm">Valid Votes</p>
                      <p className="text-emerald-400 font-bold text-xl">{selectedSubmission.valid_votes?.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-dark-400 text-sm">Rejected</p>
                      <p className="text-red-400 font-bold text-xl">{selectedSubmission.rejected_votes?.toLocaleString()}</p>
                    </div>
                  </div>

                  {selectedSubmission.registered_voters && selectedSubmission.total_votes_cast && (
                    <div className="mt-3">
                      <p className="text-dark-400 text-sm">Turnout</p>
                      <p className="text-white font-bold">
                        {((selectedSubmission.total_votes_cast / selectedSubmission.registered_voters) * 100).toFixed(2)}%
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Anomalies/Issues */}
              {selectedSubmission.has_discrepancy && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <h3 className="text-red-400 font-semibold mb-2">⚠ Anomalies Detected</h3>
                  <p className="text-red-300">{selectedSubmission.flagged_reason}</p>
                </div>
              )}

              {/* Photos */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Submitted Photos</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {selectedSubmission.photos.map((photo) => (
                    <div key={photo.id} className="bg-dark-900/50 rounded-lg p-3 border border-dark-700">
                      <p className="text-dark-400 text-xs mb-2 capitalize">
                        {photo.photo_type.replace('_', ' ')}
                      </p>
                      <img
                        src={photo.file_path}
                        alt={photo.photo_type}
                        className="w-full h-40 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => window.open(photo.file_path, '_blank')}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Notes */}
              <div>
                <label className="block text-white font-medium mb-2">Review Notes</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-700 rounded-lg px-4 py-3 text-white placeholder-dark-400 focus:outline-none focus:border-blue-500"
                  rows={4}
                  placeholder="Add notes about your review decision..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-dark-700">
                <button
                  onClick={() => handleReviewAction(selectedSubmission.id, 'approve')}
                  disabled={actionLoading}
                  className="flex-1 px-6 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : '✓ Approve & Verify'}
                </button>
                <button
                  onClick={() => handleReviewAction(selectedSubmission.id, 'request_revision')}
                  disabled={actionLoading}
                  className="flex-1 px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : '↻ Request Revision'}
                </button>
                <button
                  onClick={() => handleReviewAction(selectedSubmission.id, 'reject')}
                  disabled={actionLoading}
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : '✗ Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'
import PageHeader from '@/components/PageHeader'
import SafeImage from '@/components/SafeImage'

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

  const fetchSubmissions = useCallback(async () => {
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
  }, [filter])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

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

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <PageHeader
          eyebrow="Quality control"
          title="Review Submissions"
          description="Review and approve pending submissions, with anomalies and flagged results surfaced first."
        />

        {/* Filter Tabs */}
        <div className="mb-6 inline-flex flex-wrap gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-1.5">
          {[
            { key: 'all', label: 'All', badge: submissions.length },
            { key: 'anomalies', label: 'Anomalies', badge: submissions.filter(s => s.has_discrepancy).length },
            { key: 'flagged', label: 'Flagged', badge: submissions.filter(s => s.status === 'flagged').length },
            { key: 'pending', label: 'Pending', badge: submissions.filter(s => s.status === 'pending').length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                filter === tab.key
                  ? 'bg-brand-500 text-white shadow-glow'
                  : 'text-dark-400 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              {tab.label}
              {!loading && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  filter === tab.key ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-dark-400'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Submissions List */}
        <div className="glass-effect rounded-2xl p-5 sm:p-6">
          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-brand-400"></div>
              <p className="mt-4 text-sm text-dark-400">Loading submissions...</p>
            </div>
          ) : submissions.length > 0 ? (
            <div className="space-y-3">
              {submissions.map((submission) => (
                <div
                  key={submission.id}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-brand-400/30 hover:bg-white/[0.045]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-dark-950/80 p-4 backdrop-blur-md">
          <div className="glass-effect max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl shadow-soft animate-slide-in-up">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/[0.07] bg-dark-900/95 p-5 backdrop-blur-xl sm:p-6">
              <div>
                <h2 className="mb-1 text-xl font-semibold text-white">
                  {selectedSubmission.polling_station_name}
                </h2>
                <p className="text-sm text-dark-400">
                  {selectedSubmission.ward_name}, {selectedSubmission.constituency_name}, {selectedSubmission.county_name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false)
                  setReviewNotes('')
                }}
                className="rounded-lg p-1.5 text-dark-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className="bg-white/[0.025] rounded-lg p-4 border border-white/[0.07]">
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
                    <div key={photo.id} className="bg-white/[0.025] rounded-lg p-3 border border-white/[0.07]">
                      <p className="text-dark-400 text-xs mb-2 capitalize">
                        {photo.photo_type.replace('_', ' ')}
                      </p>
                      <SafeImage
                        src={photo.file_path}
                        alt={photo.photo_type}
                        className="w-full h-40 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                        fallback={
                          <div className="w-full h-40 rounded bg-white/[0.04] flex items-center justify-center text-xs text-dark-500">
                            Image unavailable
                          </div>
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Notes */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-dark-300">Review notes</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full px-4 py-3 text-sm"
                  rows={4}
                  placeholder="Add notes about your review decision..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5 border-t border-white/[0.07] pt-4 sm:flex-row">
                <button
                  onClick={() => handleReviewAction(selectedSubmission.id, 'approve')}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl bg-emerald-500 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : '✓ Approve & Verify'}
                </button>
                <button
                  onClick={() => handleReviewAction(selectedSubmission.id, 'request_revision')}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl border border-amber-400/30 bg-amber-500/15 px-6 py-3 font-medium text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : '↻ Request Revision'}
                </button>
                <button
                  onClick={() => handleReviewAction(selectedSubmission.id, 'reject')}
                  disabled={actionLoading}
                  className="btn-danger flex-1 px-6 py-3"
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

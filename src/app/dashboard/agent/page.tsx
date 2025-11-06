'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'

interface PollingStation {
  id: string
  name: string
  code: string
}

export default function AgentDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pollingStation, setPollingStation] = useState<PollingStation | null>(null)
  const [formData, setFormData] = useState({
    candidate_id: '',
    votes: '',
    registered_voters: '',
    total_votes_cast: '',
    rejected_votes: '',
    photo: null as File | null,
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
    }
  }, [router])

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, photo: e.target.files[0] })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const token = localStorage.getItem('token')

      const submitData = new FormData()
      submitData.append('candidate_id', formData.candidate_id)
      submitData.append('votes', formData.votes)
      submitData.append('registered_voters', formData.registered_voters)
      submitData.append('total_votes_cast', formData.total_votes_cast)
      submitData.append('rejected_votes', formData.rejected_votes)
      if (formData.photo) {
        submitData.append('photo', formData.photo)
      }

      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: submitData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Submission failed')
      }

      setSuccess('Results submitted successfully!')
      // Reset form
      setFormData({
        candidate_id: '',
        votes: '',
        registered_voters: '',
        total_votes_cast: '',
        rejected_votes: '',
        photo: null,
      })
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

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <div className="glass-effect rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6">Submit Results</h2>

              <form onSubmit={handleSubmit} className="space-y-6">
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

                {/* Candidate ID */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Candidate ID
                  </label>
                  <input
                    type="text"
                    value={formData.candidate_id}
                    onChange={(e) => setFormData({ ...formData, candidate_id: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter candidate ID"
                    required
                  />
                </div>

                {/* Votes */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Votes Received
                  </label>
                  <input
                    type="number"
                    value={formData.votes}
                    onChange={(e) => setFormData({ ...formData, votes: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                    required
                    min="0"
                  />
                </div>

                {/* Registered Voters */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Registered Voters
                  </label>
                  <input
                    type="number"
                    value={formData.registered_voters}
                    onChange={(e) => setFormData({ ...formData, registered_voters: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                    required
                    min="0"
                  />
                </div>

                {/* Total Votes Cast */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Total Votes Cast
                  </label>
                  <input
                    type="number"
                    value={formData.total_votes_cast}
                    onChange={(e) => setFormData({ ...formData, total_votes_cast: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                    required
                    min="0"
                  />
                </div>

                {/* Rejected Votes */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Rejected Votes
                  </label>
                  <input
                    type="number"
                    value={formData.rejected_votes}
                    onChange={(e) => setFormData({ ...formData, rejected_votes: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                    required
                    min="0"
                  />
                </div>

                {/* Photo Upload */}
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-2">
                    Form 34A Photo
                  </label>
                  <div className="border-2 border-dashed border-dark-700 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      id="photo-upload"
                      required
                    />
                    <label htmlFor="photo-upload" className="cursor-pointer">
                      {formData.photo ? (
                        <div className="text-emerald-400">
                          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <p>{formData.photo.name}</p>
                        </div>
                      ) : (
                        <div className="text-dark-400">
                          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p>Click to upload Form 34A photo</p>
                          <p className="text-xs mt-1">PNG, JPG up to 10MB</p>
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
                  {loading ? 'Submitting...' : 'Submit Results'}
                </button>
              </form>
            </div>
          </div>

          {/* Sidebar - Quick Stats */}
          <div className="space-y-6">
            {/* Station Info */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Polling Station</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-dark-400">Station Name</p>
                  <p className="text-sm text-white font-medium">Loading...</p>
                </div>
                <div>
                  <p className="text-xs text-dark-400">Station Code</p>
                  <p className="text-sm text-white font-medium">Loading...</p>
                </div>
              </div>
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
              <p className="text-sm text-dark-400">No submissions yet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { Submission } from '@/types/database'

interface SubmissionCardProps {
  submission: Submission & {
    submitter_name?: string
    polling_station_name?: string
    polling_station_code?: string
  }
}

export default function SubmissionCard({ submission }: SubmissionCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'flagged':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'rejected':
        return 'bg-gray-100 text-gray-800 border-gray-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="font-semibold text-gray-900">
            {submission.polling_station_name}
          </h4>
          <p className="text-xs text-gray-500">{submission.polling_station_code}</p>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(
            submission.status
          )}`}
        >
          {submission.status}
        </span>
      </div>

      {/* Submission Info */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Submitted by:</span>
          <span className="font-medium text-gray-900">
            {submission.submitter_name || 'Unknown'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Type:</span>
          <span className="font-medium text-gray-900 capitalize">
            {submission.submission_type}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Confidence:</span>
          <span
            className={`font-bold ${getConfidenceColor(submission.confidence_score)}`}
          >
            {submission.confidence_score}%
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Location Verified:</span>
          <span className="font-medium">
            {submission.location_verified ? (
              <span className="text-green-600">✓ Yes</span>
            ) : (
              <span className="text-red-600">✗ No</span>
            )}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Submitted:</span>
          <span className="font-medium text-gray-900">
            {new Date(submission.submitted_at).toLocaleString('en-KE', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </div>

        {submission.has_discrepancy && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
            <p className="text-xs text-red-800 font-medium">⚠ Discrepancy Flagged</p>
            {submission.flagged_reason && (
              <p className="text-xs text-red-700 mt-1">{submission.flagged_reason}</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 pt-3 border-t flex gap-2">
        <button className="flex-1 text-sm px-3 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors">
          View Details
        </button>
        {submission.status === 'pending' && (
          <button className="flex-1 text-sm px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors">
            Verify
          </button>
        )}
      </div>
    </div>
  )
}

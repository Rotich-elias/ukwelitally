'use client'

import { AggregatedResult } from '@/types/database'

interface ResultsCardProps {
  result: AggregatedResult
}

export default function ResultsCard({ result }: ResultsCardProps) {
  const reportingPercentage =
    result.total_stations > 0
      ? (result.stations_reporting / result.total_stations) * 100
      : 0

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* Header */}
      <div className="mb-4 pb-4 border-b">
        <h3 className="text-xl font-bold text-gray-900">{result.location_name}</h3>
        <div className="flex gap-4 mt-2 text-sm text-gray-600">
          <span className="capitalize">{result.level}</span>
          <span>•</span>
          <span className="capitalize">{result.position}</span>
        </div>
      </div>

      {/* Reporting Status */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">Polling Stations Reporting</span>
          <span className="font-semibold text-gray-900">
            {result.stations_reporting} / {result.total_stations} (
            {reportingPercentage.toFixed(1)}%)
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-600 h-2 rounded-full transition-all"
            style={{ width: `${reportingPercentage}%` }}
          />
        </div>
      </div>

      {/* Turnout */}
      <div className="mb-4 p-3 bg-gray-50 rounded">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Voter Turnout</span>
          <span className="text-lg font-bold text-green-600">
            {result.turnout_percentage.toFixed(1)}%
          </span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {result.total_votes_cast.toLocaleString()} / {result.total_registered_voters.toLocaleString()} voters
        </div>
      </div>

      {/* Candidate Results */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-700 text-sm">Candidate Results</h4>
        {result.candidate_votes.length > 0 ? (
          result.candidate_votes.map((cv, index) => (
            <div key={index} className="border-l-4 border-green-500 pl-3">
              <div className="flex justify-between items-start mb-1">
                <div>
                  <p className="font-semibold text-gray-900">{cv.candidate_name}</p>
                  {cv.party_name && (
                    <p className="text-xs text-gray-500">{cv.party_name}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-gray-900">
                    {cv.total_votes.toLocaleString()}
                  </p>
                  <p className="text-sm text-green-600">{cv.percentage.toFixed(2)}%</p>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{ width: `${cv.percentage}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500 text-sm text-center py-4">
            No results available yet
          </p>
        )}
      </div>

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-gray-500">Valid Votes</p>
          <p className="font-semibold text-gray-900">
            {result.total_valid_votes.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Rejected</p>
          <p className="font-semibold text-gray-900">
            {result.total_rejected_votes.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total Cast</p>
          <p className="font-semibold text-gray-900">
            {result.total_votes_cast.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

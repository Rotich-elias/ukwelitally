'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardNav from '@/components/DashboardNav'

interface CandidateProfile {
  full_name: string
  party_name: string
  position: string
  electoral_area: string
  county_id?: number
  constituency_id?: number
  ward_id?: number
}

interface CandidateResult {
  candidate_name: string
  party_name: string
  total_votes: number
  percentage: number
  polling_stations_count?: number
  profile_photo?: string
  candidate_number?: string
  position?: string
  official_name?: string
  electoral_area?: string
}

interface ResultsSummary {
  total_votes_cast: number
  registered_voters: number
  rejected_votes: number
  turnout_percentage: number
  total_stations: number
  stations_reported: number
  reporting_percentage: number
}

interface Activity {
  id: string
  type: 'submission' | 'agent_assigned' | 'result_verified' | 'discrepancy'
  description: string
  details: string
  timestamp: string
  icon_color: 'emerald' | 'blue' | 'purple' | 'orange' | 'red'
}

export default function CandidateDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<CandidateProfile | null>(null)
  const [results, setResults] = useState<CandidateResult[]>([])
  const [summary, setSummary] = useState<ResultsSummary | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)

  // Fetch profile data
  const fetchProfile = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/candidates/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setProfile(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    }
  }, [])

  // Fetch results data
  const fetchResults = useCallback(async () => {
    if (!profile) return // Don't fetch until profile is loaded

    try {
      const token = localStorage.getItem('token')
      // The API will automatically restrict based on candidate's electoral area
      const response = await fetch(`/api/results/aggregate?position=${profile.position}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setResults(data.results || [])
        setSummary(data.summary)
      }
    } catch (error) {
      console.error('Failed to fetch results:', error)
    } finally {
      setLoading(false)
    }
  }, [profile])

  // Fetch recent activity
  const fetchActivity = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/candidates/activity', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setActivities(data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch activity:', error)
    } finally {
      setActivitiesLoading(false)
    }
  }, [])

  // Initial load - fetch profile
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchProfile()
  }, [router, fetchProfile])

  // Fetch results when profile is loaded
  useEffect(() => {
    if (profile) {
      fetchResults()
      fetchActivity()
    }
  }, [profile, fetchResults, fetchActivity])

  const getProgressPercentage = () => {
    if (!summary || summary.total_stations === 0) return 0
    return Math.round(summary.reporting_percentage)
  }

  const downloadReport = () => {
    if (!profile || !summary) {
      alert('No data available to download')
      return
    }

    // Generate report content
    const reportDate = new Date().toLocaleString('en-KE', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: 'Africa/Nairobi'
    })

    const totalValidVotes = results.reduce((sum, r) => sum + r.total_votes, 0)

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Election Results Report - ${profile.position.toUpperCase()}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #f9fafb;
      padding: 40px 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      border-radius: 12px;
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 10px;
    }

    .header .subtitle {
      font-size: 18px;
      opacity: 0.95;
    }

    .meta-info {
      background: #f3f4f6;
      padding: 20px 40px;
      border-bottom: 2px solid #e5e7eb;
    }

    .meta-info .date {
      font-size: 14px;
      color: #6b7280;
    }

    .content {
      padding: 40px;
    }

    .section {
      margin-bottom: 40px;
    }

    .section-title {
      font-size: 24px;
      font-weight: bold;
      color: #1f2937;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #3b82f6;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .info-card {
      background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
    }

    .info-card .label {
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }

    .info-card .value {
      font-size: 24px;
      font-weight: bold;
      color: #1f2937;
    }

    .info-card .sub-value {
      font-size: 14px;
      color: #6b7280;
      margin-top: 5px;
    }

    .candidate-info {
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      border: 2px solid #3b82f6;
    }

    .candidate-info h3 {
      font-size: 28px;
      color: #1e40af;
      margin-bottom: 15px;
    }

    .candidate-info .detail {
      display: flex;
      align-items: center;
      margin: 10px 0;
      font-size: 16px;
    }

    .candidate-info .detail strong {
      min-width: 150px;
      color: #1e40af;
    }

    .results-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }

    .results-table thead {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
    }

    .results-table th {
      padding: 16px;
      text-align: left;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.5px;
    }

    .results-table th:last-child,
    .results-table td:last-child {
      text-align: right;
    }

    .results-table tbody tr {
      border-bottom: 1px solid #e5e7eb;
      transition: background-color 0.2s;
    }

    .results-table tbody tr:hover {
      background-color: #f9fafb;
    }

    .results-table tbody tr:nth-child(even) {
      background-color: #f9fafb;
    }

    .results-table td {
      padding: 16px;
      font-size: 14px;
    }

    .rank-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-weight: bold;
      font-size: 14px;
    }

    .rank-1 {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      color: white;
      box-shadow: 0 2px 4px rgba(251, 191, 36, 0.4);
    }

    .rank-2 {
      background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
      color: white;
      box-shadow: 0 2px 4px rgba(156, 163, 175, 0.4);
    }

    .rank-3 {
      background: linear-gradient(135deg, #fb923c 0%, #f97316 100%);
      color: white;
      box-shadow: 0 2px 4px rgba(251, 146, 60, 0.4);
    }

    .rank-other {
      background: #e5e7eb;
      color: #6b7280;
    }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 8px;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .party-badge {
      display: inline-block;
      padding: 4px 12px;
      background: #dbeafe;
      color: #1e40af;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .footer {
      background: #f3f4f6;
      padding: 30px 40px;
      text-align: center;
      border-top: 2px solid #e5e7eb;
    }

    .footer .logo {
      font-size: 24px;
      font-weight: bold;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 10px;
    }

    .footer .disclaimer {
      font-size: 14px;
      color: #6b7280;
      line-height: 1.8;
      max-width: 800px;
      margin: 0 auto;
    }

    .stats-highlight {
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border-left: 4px solid #10b981;
    }

    .stats-highlight .value {
      color: #047857;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .container {
        box-shadow: none;
        border-radius: 0;
      }

      .results-table tbody tr:hover {
        background-color: transparent;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>🗳️ ELECTION RESULTS REPORT</h1>
      <div class="subtitle">${profile.position.toUpperCase()} - ${profile.electoral_area}</div>
    </div>

    <!-- Meta Information -->
    <div class="meta-info">
      <div class="date">📅 Generated: ${reportDate}</div>
    </div>

    <!-- Content -->
    <div class="content">
      <!-- Candidate Information Section -->
      <div class="section">
        <h2 class="section-title">Candidate Information</h2>
        <div class="candidate-info">
          <h3>${profile.full_name}</h3>
          <div class="detail"><strong>Position:</strong> ${profile.position.toUpperCase()}</div>
          <div class="detail"><strong>Political Party:</strong> ${profile.party_name}</div>
          <div class="detail"><strong>Electoral Area:</strong> ${profile.electoral_area}</div>
        </div>
      </div>

      <!-- Summary Statistics Section -->
      <div class="section">
        <h2 class="section-title">Summary Statistics</h2>
        <div class="info-grid">
          <div class="info-card">
            <div class="label">Total Polling Stations</div>
            <div class="value">${summary.total_stations.toLocaleString()}</div>
          </div>

          <div class="info-card stats-highlight">
            <div class="label">Stations Reported</div>
            <div class="value">${summary.stations_reported.toLocaleString()}</div>
            <div class="sub-value">${getProgressPercentage()}% reporting</div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${getProgressPercentage()}%"></div>
            </div>
          </div>

          <div class="info-card">
            <div class="label">Pending Stations</div>
            <div class="value">${(summary.total_stations - summary.stations_reported).toLocaleString()}</div>
            <div class="sub-value">Awaiting results</div>
          </div>

          <div class="info-card">
            <div class="label">Registered Voters</div>
            <div class="value">${summary.registered_voters.toLocaleString()}</div>
          </div>

          <div class="info-card stats-highlight">
            <div class="label">Total Votes Cast</div>
            <div class="value">${summary.total_votes_cast.toLocaleString()}</div>
          </div>

          <div class="info-card">
            <div class="label">Voter Turnout</div>
            <div class="value">${summary.turnout_percentage.toFixed(1)}%</div>
          </div>

          <div class="info-card">
            <div class="label">Valid Votes</div>
            <div class="value">${totalValidVotes.toLocaleString()}</div>
          </div>

          <div class="info-card">
            <div class="label">Rejected Votes</div>
            <div class="value">${summary.rejected_votes.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <!-- Detailed Results Section -->
      <div class="section">
        <h2 class="section-title">Detailed Results - ${profile.position.toUpperCase()} Position</h2>
        ${results.length > 0 ? `
        <table class="results-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Candidate Name</th>
              <th>Party</th>
              <th>Votes</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            ${results.map((result, index) => `
            <tr>
              <td>
                <span class="rank-badge ${index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'rank-other'}">
                  ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                </span>
              </td>
              <td><strong>${result.candidate_name}</strong></td>
              <td><span class="party-badge">${result.party_name}</span></td>
              <td><strong>${result.total_votes.toLocaleString()}</strong></td>
              <td>
                <strong>${result.percentage.toFixed(2)}%</strong>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${result.percentage}%"></div>
                </div>
              </td>
            </tr>
            `).join('')}
          </tbody>
        </table>
        ` : `
        <p style="text-align: center; color: #6b7280; padding: 40px;">No results available yet. Results will appear as polling stations submit their data.</p>
        `}
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="logo">UkweliTally</div>
      <div class="disclaimer">
        <strong>⚠️ Official Use Only</strong><br>
        This report was generated from the UkweliTally Election Results System.<br>
        Please verify all data before making public announcements.<br>
        For inquiries, contact: elgeiy8@gmail.com | WhatsApp: 0721 237 811
      </div>
    </div>
  </div>
</body>
</html>`

    // Create and download file
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    const fileName = `Election_Report_${profile.position}_${profile.electoral_area.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`
    link.download = fileName

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardNav />

      <div className="container mx-auto px-4 py-8">
        {/* Header with Electoral Area */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Candidate Dashboard</h1>
          <p className="text-dark-300">Real-time election results tracking</p>
          {profile && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div>
                <p className="text-xs text-blue-300">Electoral Area</p>
                <p className="text-sm font-semibold text-white">{profile.electoral_area}</p>
              </div>
              <div className="ml-4 pl-4 border-l border-blue-500/30">
                <p className="text-xs text-blue-300">Position</p>
                <p className="text-sm font-semibold text-white">{profile.position.toUpperCase()}</p>
              </div>
              <div className="ml-4 pl-4 border-l border-blue-500/30">
                <p className="text-xs text-blue-300">Party</p>
                <p className="text-sm font-semibold text-white">{profile.party_name}</p>
              </div>
            </div>
          )}
        </div>

        {/* Election Process Overview */}
        <div className="glass-effect rounded-xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Election Process Overview</h2>
              <p className="text-sm text-dark-300">Complete statistics for {profile?.electoral_area}</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Stations */}
            <div className="bg-dark-800/50 rounded-lg p-4 border border-dark-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-dark-400 uppercase tracking-wide">Total Polling Stations</p>
                  <p className="text-2xl font-bold text-white">{summary?.total_stations.toLocaleString() || 0}</p>
                </div>
              </div>
            </div>

            {/* Stations Submitted */}
            <div className="bg-dark-800/50 rounded-lg p-4 border border-dark-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-dark-400 uppercase tracking-wide">Stations Reported</p>
                  <p className="text-2xl font-bold text-white">{summary?.stations_reported.toLocaleString() || 0}</p>
                  <p className="text-xs text-emerald-400 mt-1">{getProgressPercentage()}% of total</p>
                </div>
              </div>
            </div>

            {/* Pending Stations */}
            <div className="bg-dark-800/50 rounded-lg p-4 border border-dark-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-dark-400 uppercase tracking-wide">Pending Submission</p>
                  <p className="text-2xl font-bold text-white">
                    {((summary?.total_stations || 0) - (summary?.stations_reported || 0)).toLocaleString()}
                  </p>
                  <p className="text-xs text-orange-400 mt-1">Awaiting results</p>
                </div>
              </div>
            </div>

            {/* Reporting Progress */}
            <div className="bg-dark-800/50 rounded-lg p-4 border border-dark-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-dark-400 uppercase tracking-wide">Overall Progress</p>
                  <p className="text-2xl font-bold text-white">{getProgressPercentage()}%</p>
                  <p className="text-xs text-purple-400 mt-1">Completion rate</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Voter Statistics */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Registered Voters */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-dark-400 font-medium">Total Registered Voters</p>
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{summary?.registered_voters.toLocaleString() || 0}</p>
            <p className="text-xs text-dark-400">Across all {summary?.total_stations || 0} stations</p>
          </div>

          {/* Total Votes Cast */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-dark-400 font-medium">Total Votes Cast</p>
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{summary?.total_votes_cast.toLocaleString() || 0}</p>
            <p className="text-xs text-dark-400">From {summary?.stations_reported || 0} reporting stations</p>
          </div>

          {/* Voter Turnout */}
          <div className="glass-effect rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-dark-400 font-medium">Voter Turnout</p>
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{summary?.turnout_percentage?.toFixed(1) || 0}%</p>
            <p className="text-xs text-dark-400">
              {summary?.rejected_votes && summary.rejected_votes > 0 ? `${summary.rejected_votes.toLocaleString()} rejected votes` : 'From reported stations'}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="glass-effect rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Submission Progress</h3>
              <p className="text-xs text-dark-400 mt-1">
                Track real-time progress across all polling stations in {profile?.electoral_area}
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold text-white">{getProgressPercentage()}%</span>
              <p className="text-xs text-dark-400">Complete</p>
            </div>
          </div>
          <div className="w-full bg-dark-800 rounded-full h-4 relative overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 via-emerald-500 to-purple-500 h-4 rounded-full transition-all duration-500 relative"
              style={{ width: `${getProgressPercentage()}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="text-center">
              <p className="text-xs text-dark-400">Completed</p>
              <p className="text-lg font-bold text-emerald-400">{summary?.stations_reported || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-dark-400">Pending</p>
              <p className="text-lg font-bold text-orange-400">
                {((summary?.total_stations || 0) - (summary?.stations_reported || 0))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-dark-400">Total</p>
              <p className="text-lg font-bold text-blue-400">{summary?.total_stations || 0}</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Results Table */}
          <div className="lg:col-span-2">
            <div className="glass-effect rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">
                  Election Results - {profile?.electoral_area}
                </h2>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <p className="text-dark-400 mt-4">Loading results...</p>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-4">
                  {results.map((result, index) => {
                    const isLeader = index === 0
                    const isSecond = index === 1
                    const isThird = index === 2

                    return (
                      <div
                        key={index}
                        className={`glass-effect rounded-xl p-6 border-2 transition-all duration-300 hover:shadow-xl ${
                          isLeader
                            ? 'border-yellow-400/50 bg-yellow-400/5'
                            : isSecond
                            ? 'border-gray-400/50 bg-gray-400/5'
                            : isThird
                            ? 'border-orange-400/50 bg-orange-400/5'
                            : 'border-dark-700 hover:border-dark-600'
                        }`}
                      >
                        <div className="flex items-start gap-6">
                          {/* Rank Badge */}
                          <div className="flex-shrink-0">
                            {isLeader ? (
                              <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-lg">
                                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              </div>
                            ) : isSecond ? (
                              <div className="w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex items-center justify-center shadow-lg">
                                <span className="text-white font-bold text-lg">2</span>
                              </div>
                            ) : isThird ? (
                              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center shadow-lg">
                                <span className="text-white font-bold text-lg">3</span>
                              </div>
                            ) : (
                              <div className="w-12 h-12 bg-dark-700 rounded-full flex items-center justify-center">
                                <span className="text-dark-400 font-bold text-lg">{index + 1}</span>
                              </div>
                            )}
                          </div>

                          {/* Candidate Photo */}
                          <div className="flex-shrink-0">
                            {result.profile_photo ? (
                              <img
                                src={result.profile_photo}
                                alt={result.candidate_name}
                                className="w-24 h-24 rounded-xl object-cover border-2 border-dark-600"
                              />
                            ) : (
                              <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-2 border-dark-600 flex items-center justify-center">
                                <svg className="w-12 h-12 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                            )}
                          </div>

                          {/* Candidate Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div className="min-w-0 flex-1">
                                <h3 className="text-xl font-bold text-white mb-1 truncate">
                                  {result.official_name || result.candidate_name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  {result.candidate_number && (
                                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-mono">
                                      {result.candidate_number}
                                    </span>
                                  )}
                                  <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">
                                    {result.party_name}
                                  </span>
                                  {result.position && (
                                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs uppercase">
                                      {result.position}
                                    </span>
                                  )}
                                </div>
                                {result.electoral_area && (
                                  <p className="text-sm text-dark-400 flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {result.electoral_area}
                                  </p>
                                )}
                              </div>

                              {/* Vote Stats */}
                              <div className="text-right flex-shrink-0">
                                <p className="text-4xl font-bold text-white mb-1">
                                  {result.total_votes.toLocaleString()}
                                </p>
                                <p className="text-lg font-semibold text-emerald-400">
                                  {result.percentage.toFixed(1)}%
                                </p>
                                {result.polling_stations_count && (
                                  <p className="text-xs text-dark-400 mt-1">
                                    From {result.polling_stations_count.toLocaleString()} stations
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="relative">
                              <div className="w-full bg-dark-800 rounded-full h-3 overflow-hidden">
                                <div
                                  className={`h-3 rounded-full transition-all duration-1000 ease-out ${
                                    isLeader
                                      ? 'bg-gradient-to-r from-yellow-400 to-yellow-600'
                                      : isSecond
                                      ? 'bg-gradient-to-r from-gray-400 to-gray-600'
                                      : isThird
                                      ? 'bg-gradient-to-r from-orange-400 to-orange-600'
                                      : 'bg-gradient-to-r from-blue-500 to-purple-500'
                                  }`}
                                  style={{ width: `${result.percentage}%` }}
                                >
                                  <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-dark-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-dark-400">No results available yet</p>
                  <p className="text-dark-500 text-sm mt-1">Results will appear as agents submit them</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => router.push('/dashboard/candidate/manage-agents')}
                  className="w-full btn-primary text-sm py-2"
                >
                  Manage Agents
                </button>
                <button
                  onClick={downloadReport}
                  className="w-full btn-secondary text-sm py-2"
                >
                  Download Report
                </button>
                <button className="w-full btn-secondary text-sm py-2">
                  View Results Map
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
              {activitiesLoading ? (
                <div className="text-center py-6">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                  <p className="text-dark-400 text-sm mt-2">Loading activity...</p>
                </div>
              ) : activities.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {activities.map((activity) => {
                    const colorClasses = {
                      emerald: 'bg-emerald-400',
                      blue: 'bg-blue-400',
                      purple: 'bg-purple-400',
                      orange: 'bg-orange-400',
                      red: 'bg-red-400',
                    }
                    return (
                      <div key={activity.id} className="flex items-start gap-3">
                        <div className={`w-2 h-2 ${colorClasses[activity.icon_color]} rounded-full mt-2 flex-shrink-0`}></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white truncate">{activity.description}</p>
                          <p className="text-xs text-dark-400 truncate">{activity.details}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <svg className="w-12 h-12 mx-auto text-dark-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-dark-400 text-sm">No recent activity</p>
                  <p className="text-dark-500 text-xs mt-1">Activity will appear here as it happens</p>
                </div>
              )}
            </div>

            {/* Support */}
            <div className="glass-effect rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Need Help?</h3>
              <p className="text-sm text-dark-300 mb-4">
                Contact support if you notice any discrepancies or issues.
              </p>
              <div className="space-y-3">
                <a
                  href="mailto:elgeiy8@gmail.com"
                  className="w-full flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg px-4 py-2.5 transition-colors text-sm font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  elgeiy8@gmail.com
                </a>
                <a
                  href="https://wa.me/254721237811"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg px-4 py-2.5 transition-colors text-sm font-medium"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp: 0721 237 811
                </a>
                <a
                  href="tel:+254721237811"
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg px-4 py-2.5 transition-colors text-sm font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call: 0721 237 811
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const dynamic = 'force-dynamic'

interface Activity {
  id: string
  type: 'submission' | 'agent_assigned' | 'result_verified' | 'discrepancy'
  description: string
  details: string
  timestamp: string
  icon_color: 'emerald' | 'blue' | 'purple' | 'orange' | 'red'
}

// GET /api/candidates/activity - Get recent activity for candidate
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    if (decoded.role !== 'candidate') {
      return NextResponse.json({ error: 'Only candidates can access this endpoint' }, { status: 403 })
    }

    // Get candidate ID
    const candidateResult = await query(
      'SELECT id FROM candidates WHERE user_id = $1',
      [decoded.userId]
    )

    if (candidateResult.rows.length === 0) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    const candidateId = candidateResult.rows[0].id

    const activities: Activity[] = []

    // 1. Get recent submissions from agents
    const submissionsResult = await query(
      `SELECT
        s.id,
        s.submitted_at,
        ps.name as station_name,
        ps.code as station_code,
        u.full_name as agent_name,
        s.status
      FROM submissions s
      JOIN polling_stations ps ON s.polling_station_id = ps.id
      JOIN users u ON s.user_id = u.id
      WHERE s.candidate_id = $1
      ORDER BY s.submitted_at DESC
      LIMIT 5`,
      [candidateId]
    )

    submissionsResult.rows.forEach((row) => {
      const timeAgo = getTimeAgo(new Date(row.submitted_at))
      activities.push({
        id: `submission-${row.id}`,
        type: 'submission',
        description: row.status === 'verified' ? 'Results verified' : 'New submission',
        details: `${row.station_name} (${row.station_code}) - ${timeAgo}`,
        timestamp: row.submitted_at,
        icon_color: row.status === 'verified' ? 'emerald' : 'blue',
      })
    })

    // 2. Get recent agent assignments
    const agentsResult = await query(
      `SELECT
        a.id,
        a.created_at,
        u.full_name as agent_name,
        ps.name as station_name,
        ps.code as station_code
      FROM agents a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN polling_stations ps ON a.polling_station_id = ps.id
      WHERE a.candidate_id = $1
      ORDER BY a.created_at DESC
      LIMIT 5`,
      [candidateId]
    )

    agentsResult.rows.forEach((row) => {
      const timeAgo = getTimeAgo(new Date(row.created_at))
      const details = row.station_name
        ? `${row.agent_name} assigned to ${row.station_name} - ${timeAgo}`
        : `${row.agent_name} registered - ${timeAgo}`
      activities.push({
        id: `agent-${row.id}`,
        type: 'agent_assigned',
        description: 'Agent assigned',
        details,
        timestamp: row.created_at,
        icon_color: 'blue',
      })
    })

    // 3. Get recent discrepancies (if any)
    const discrepanciesResult = await query(
      `SELECT
        d.id,
        d.created_at,
        ps.name as station_name,
        ps.code as station_code,
        d.discrepancy_type,
        d.status
      FROM discrepancies d
      JOIN polling_stations ps ON d.polling_station_id = ps.id
      JOIN submissions s ON d.primary_submission_id = s.id OR d.backup_submission_id = s.id
      WHERE s.candidate_id = $1
      ORDER BY d.created_at DESC
      LIMIT 3`,
      [candidateId]
    )

    discrepanciesResult.rows.forEach((row) => {
      const timeAgo = getTimeAgo(new Date(row.created_at))
      activities.push({
        id: `discrepancy-${row.id}`,
        type: 'discrepancy',
        description: 'Discrepancy flagged',
        details: `${row.station_name} - ${row.status} - ${timeAgo}`,
        timestamp: row.created_at,
        icon_color: 'orange',
      })
    })

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Return top 10 most recent activities
    const recentActivities = activities.slice(0, 10)

    return NextResponse.json({
      success: true,
      data: recentActivities,
    })
  } catch (error) {
    console.error('Error fetching candidate activity:', error)
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 })
  }
}

// Helper function to calculate time ago
function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins === 1) return '1 min ago'
  if (diffMins < 60) return `${diffMins} mins ago`
  if (diffHours === 1) return '1 hour ago'
  if (diffHours < 24) return `${diffHours} hours ago`
  if (diffDays === 1) return '1 day ago'
  return `${diffDays} days ago`
}

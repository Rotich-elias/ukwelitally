import { NextRequest, NextResponse } from 'next/server'
import { queryMany } from '@/lib/db'
import { withAuth } from '@/middleware/auth'

// GET /api/submissions/[id]/reviews - Get reviews for a submission
async function handleGet(
  req: NextRequest,
  context?: any
) {
  try {
    const user = (req as any).user

    // Extract params
    let submissionId: number

    if (context && context.params) {
      const params = await Promise.resolve(context.params)
      submissionId = parseInt(params.id)
    } else {
      const url = new URL(req.url)
      const pathParts = url.pathname.split('/')
      const idIndex = pathParts.indexOf('submissions') + 1
      submissionId = parseInt(pathParts[idIndex])
    }

    if (isNaN(submissionId) || submissionId <= 0) {
      return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 })
    }

    // Fetch reviews
    const reviews = await queryMany(
      `SELECT
        sr.*,
        u.full_name as reviewer_name
       FROM submission_reviews sr
       JOIN users u ON sr.reviewer_id = u.id
       WHERE sr.submission_id = $1
       ORDER BY sr.created_at DESC`,
      [submissionId]
    )

    return NextResponse.json({
      success: true,
      reviews,
    })
  } catch (error) {
    console.error('Error fetching reviews:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

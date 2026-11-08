import { NextRequest, NextResponse } from 'next/server'
import { queryMany } from '@/lib/db'
import { withRole } from '@/middleware/auth'
import { recalculateSubmissionConfidence } from '@/lib/confidence'

export const dynamic = 'force-dynamic'

/**
 * Re-score every submission from the evidence already in the database.
 *
 * This exists because the old score was calculated before the vote figures were
 * entered. Running it once after deployment replaces the uniform 35% scores
 * with the new explainable score. It is safe to run again at any time.
 */
async function handlePost(_req: NextRequest) {
  try {
    const submissions = await queryMany<{ id: number }>(
      'SELECT id FROM submissions ORDER BY id'
    )

    let updated = 0
    let failed = 0

    // Score in small batches so a large backfill does not open hundreds of
    // database connections at once.
    const batchSize = 8
    for (let index = 0; index < submissions.length; index += batchSize) {
      const batch = submissions.slice(index, index + batchSize)
      const results = await Promise.allSettled(
        batch.map((submission) => recalculateSubmissionConfidence(submission.id))
      )

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) updated++
        else failed++
      }
    }

    return NextResponse.json({
      message: `Recalculated confidence for ${updated} submission${updated === 1 ? '' : 's'}.`,
      updated,
      failed,
      total: submissions.length,
    })
  } catch (error) {
    console.error('Error recalculating confidence:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withRole(['admin'], handlePost as any)

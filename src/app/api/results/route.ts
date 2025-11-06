import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, queryMany, transaction } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { validateVoteCounts, detectAnomalies } from '@/lib/validation'
import { Result, Submission } from '@/types/database'

// POST /api/results - Create result entry for a submission
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    const body = await req.json()

    const {
      submission_id,
      position,
      registered_voters,
      total_votes_cast,
      valid_votes,
      rejected_votes,
      candidate_votes,
      manually_verified = false,
    } = body

    // Validate required fields
    if (
      !submission_id ||
      !position ||
      registered_voters === undefined ||
      total_votes_cast === undefined ||
      valid_votes === undefined ||
      rejected_votes === undefined ||
      !candidate_votes ||
      !Array.isArray(candidate_votes)
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify submission exists and user has access
    const submission = await queryOne<Submission>(
      'SELECT * FROM submissions WHERE id = $1',
      [submission_id]
    )

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Check permission
    if (user.role !== 'admin' && submission.user_id !== user.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Validate vote counts
    const validation = validateVoteCounts({
      registered_voters,
      total_votes_cast,
      valid_votes,
      rejected_votes,
      candidate_votes,
    })

    // Detect anomalies
    const anomalyCheck = detectAnomalies({
      total_votes_cast,
      registered_voters,
      valid_votes,
      rejected_votes,
      candidate_votes,
    })

    // Create result in transaction
    const result = await transaction(async (client) => {
      // Insert result
      const resultData = await client.query<Result>(
        `INSERT INTO results (
          submission_id, polling_station_id, position,
          registered_voters, total_votes_cast, valid_votes, rejected_votes,
          is_valid, validation_errors, manually_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          submission_id,
          submission.polling_station_id,
          position,
          registered_voters,
          total_votes_cast,
          valid_votes,
          rejected_votes,
          validation.valid,
          validation.valid ? null : JSON.stringify({ errors: validation.errors }),
          manually_verified,
        ]
      )

      const resultRecord = resultData.rows[0]

      // Insert candidate votes
      for (const cv of candidate_votes) {
        await client.query(
          `INSERT INTO candidate_votes (result_id, candidate_name, party_name, votes)
           VALUES ($1, $2, $3, $4)`,
          [resultRecord.id, cv.candidate_name, cv.party_name || null, cv.votes]
        )
      }

      // Update submission confidence score if math is invalid
      if (!validation.valid) {
        await client.query(
          'UPDATE submissions SET confidence_score = confidence_score - 20 WHERE id = $1',
          [submission_id]
        )
      }

      // Flag submission if anomalies detected
      if (anomalyCheck.hasAnomalies) {
        await client.query(
          'UPDATE submissions SET has_discrepancy = TRUE, flagged_reason = $1 WHERE id = $2',
          [anomalyCheck.flags.join('; '), submission_id]
        )
      }

      return resultRecord
    })

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        'result_created',
        'result',
        result.id,
        JSON.stringify({ position, total_votes_cast, valid_votes }),
      ]
    )

    return NextResponse.json(
      {
        message: 'Result created successfully',
        result,
        validation,
        anomalies: anomalyCheck.hasAnomalies ? anomalyCheck.flags : null,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating result:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

import { NextRequest, NextResponse } from 'next/server'
import { query, transaction } from '@/lib/db'
import { withAuth } from '@/middleware/auth'

// POST /api/ballot-candidates/bulk-update - Bulk update ballot candidates (archive/restore)
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json()
    const { candidateIds, action } = body

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return NextResponse.json({ error: 'Candidate IDs array is required' }, { status: 400 })
    }

    if (!action || (action !== 'archive' && action !== 'restore')) {
      return NextResponse.json({ error: 'Valid action (archive/restore) is required' }, { status: 400 })
    }

    const newStatus = action === 'archive'

    const results = await transaction(async (client) => {
      const updatedCandidates = []
      const errors = []

      for (const candidateId of candidateIds) {
        try {
          // Check if candidate exists and is a ballot candidate (not system user)
          const candidateResult = await client.query(
            'SELECT * FROM candidates WHERE id = $1 AND is_system_user = false',
            [candidateId]
          )
          
          if (candidateResult.rows.length === 0) {
            errors.push(`Ballot candidate not found (ID: ${candidateId})`)
            continue
          }

          const candidate = candidateResult.rows[0]

          // Check if candidate has results (prevent archiving candidates with results)
          if (action === 'archive') {
            const hasResults = await client.query(
              'SELECT COUNT(*) as count FROM candidate_votes WHERE candidate_name = $1',
              [candidate.full_name]
            )

            if (parseInt(hasResults.rows[0].count) > 0) {
              errors.push(`Cannot archive candidate "${candidate.full_name}" - has existing results`)
              continue
            }
          }

          // Update candidate archived status
          const result = await client.query(
            'UPDATE candidates SET archived = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, full_name, position, archived',
            [newStatus, candidateId]
          )

          if (result.rows.length > 0) {
            updatedCandidates.push(result.rows[0])
          }
        } catch (error) {
          errors.push(`Failed to update candidate ${candidateId}: ${error}`)
        }
      }

      // Audit log for bulk operation
      if (updatedCandidates.length > 0) {
        await client.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_ids, new_values)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            user.userId,
            `bulk_${action}_ballot_candidates`,
            'candidate',
            JSON.stringify(updatedCandidates.map(c => c.id)),
            JSON.stringify({ action, count: updatedCandidates.length }),
          ]
        )
      }

      return { updatedCandidates, errors }
    })

    return NextResponse.json({
      success: true,
      message: `Successfully ${action}d ${results.updatedCandidates.length} ballot candidates`,
      data: {
        updated: results.updatedCandidates,
        errors: results.errors,
      },
    })
  } catch (error) {
    console.error('Error in bulk ballot candidate update:', error)
    return NextResponse.json({ error: 'Failed to update ballot candidates' }, { status: 500 })
  }
}

export const POST = withAuth(handlePost as any)
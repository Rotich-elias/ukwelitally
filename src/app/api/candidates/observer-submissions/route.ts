import { NextRequest, NextResponse } from 'next/server'
import { queryMany } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { getCandidateProfile } from '@/lib/candidate-restrictions'
import { getObserverSubmissionsForReview, type ReviewStatus } from '@/lib/fallback'
import { getEvidenceUrl } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * GET /api/candidates/observer-submissions
 *
 * The observer review queue of the logged in candidate. Only submissions that
 * belong to the candidate's own electoral area and position are returned, so
 * one candidate can never see or review another candidate's submissions.
 *
 * Query parameters:
 *   status  pending_review | approved_fallback | rejected_fallback | all
 */
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user

    if (user.role !== 'candidate') {
      return NextResponse.json(
        { error: 'Only candidates can review observer submissions' },
        { status: 403 }
      )
    }

    const candidate = await getCandidateProfile(user.userId)
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get('status') as ReviewStatus | 'all' | null
    const reviewStatus: ReviewStatus | 'all' =
      statusParam === 'approved_fallback' ||
      statusParam === 'rejected_fallback' ||
      statusParam === 'pending_review'
        ? statusParam
        : 'pending_review'

    const submissions = await getObserverSubmissionsForReview({
      candidateId: candidate.id,
      position: candidate.position,
      countyId: candidate.county_id ?? null,
      constituencyId: candidate.constituency_id ?? null,
      wardId: candidate.ward_id ?? null,
      reviewStatus,
    })

    // The submitted figures per candidate, so the reviewer can compare them.
    const ids = submissions.map((submission: any) => submission.id)
    const votesBySubmission: Record<string, any[]> = {}

    if (ids.length > 0) {
      const votes = await queryMany(
        `SELECT r.submission_id AS submission_id,
                cv.candidate_name,
                cv.party_name,
                cv.votes
           FROM candidate_votes cv
           JOIN results r ON r.id = cv.result_id
          WHERE r.submission_id = ANY($1::int[])
          ORDER BY cv.votes DESC`,
        [ids]
      )

      for (const vote of votes) {
        const key = String(vote.submission_id)
        if (!votesBySubmission[key]) votesBySubmission[key] = []
        votesBySubmission[key].push({
          candidate_name: vote.candidate_name,
          party_name: vote.party_name,
          votes: Number(vote.votes),
        })
      }
    }

    const enriched = submissions.map((submission: any) => {
      const agentSubmissionId = submission.agent_submission_id ?? null
      const hasAgentSubmission = !!agentSubmissionId
      const selectedIsThis = submission.selected_submission_id === submission.id
      const selectedIsFallback =
        submission.selected_source === 'observer_fallback' && !selectedIsThis

      // A fallback can only be approved while no agent result exists.
      const approvable =
        !hasAgentSubmission &&
        submission.review_status === 'pending_review' &&
        submission.status !== 'rejected' &&
        !selectedIsFallback

      let reason: string | null = null
      if (hasAgentSubmission) {
        reason = 'An agent result already exists for this polling station.'
      } else if (submission.review_status === 'approved_fallback') {
        reason = 'This submission is already the approved fallback result.'
      } else if (submission.review_status === 'rejected_fallback') {
        reason = 'This submission was rejected.'
      } else if (selectedIsFallback) {
        reason = 'Another observer fallback is already approved for this polling station.'
      } else if (submission.status === 'rejected') {
        reason = 'This submission was rejected and is no longer valid.'
      }

      return {
        ...submission,
        submitted_votes: votesBySubmission[String(submission.id)] || [],
        // The evidence is private, so it is served through the authorized
        // evidence route.
        photos: (submission.photos || []).map((photo: any) => ({
          ...photo,
          file_path: getEvidenceUrl(photo.id),
        })),
        has_agent_submission: hasAgentSubmission,
        approvable,
        not_approvable_reason: reason,
      }
    })

    return NextResponse.json({
      success: true,
      submissions: enriched,
      count: enriched.length,
      position: candidate.position,
    })
  } catch (error) {
    console.error('Error fetching observer review queue:', error)
    return NextResponse.json(
      { error: 'Failed to fetch the observer review queue' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

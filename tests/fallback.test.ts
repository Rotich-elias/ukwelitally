import { describe, it, expect } from 'vitest'
import { evaluateFallbackEligibility, type FallbackEligibilityInput } from '@/lib/fallback'

function input(overrides: Partial<FallbackEligibilityInput> = {}): FallbackEligibilityInput {
  return {
    submission: {
      id: 1,
      submission_origin: 'observer',
      review_status: 'pending_review',
      status: 'pending',
      polling_station_id: 5,
      user_id: 9,
    },
    candidateOwnsScope: true,
    observerAuthorized: true,
    agentSubmission: null,
    selectedResult: null,
    ...overrides,
  }
}

describe('evaluateFallbackEligibility', () => {
  it('approves an eligible observer submission', () => {
    const result = evaluateFallbackEligibility(input())

    expect(result.eligible).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('rejects an agent submission', () => {
    const result = evaluateFallbackEligibility(
      input({
        submission: { ...input().submission, submission_origin: 'agent' },
      })
    )

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('not_observer_submission')
  })

  it('rejects a submission that was already rejected', () => {
    const result = evaluateFallbackEligibility(
      input({
        submission: { ...input().submission, review_status: 'rejected_fallback' },
      })
    )

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('already_reviewed')
  })

  it('rejects a submission that was already approved', () => {
    const result = evaluateFallbackEligibility(
      input({
        submission: { ...input().submission, review_status: 'approved_fallback' },
      })
    )

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('already_reviewed')
  })

  it('rejects a submission outside the candidate scope', () => {
    const result = evaluateFallbackEligibility(input({ candidateOwnsScope: false }))

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('not_in_scope')
  })

  it('rejects a submission from an observer who is no longer assigned', () => {
    const result = evaluateFallbackEligibility(input({ observerAuthorized: false }))

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('observer_not_authorized')
  })

  it('blocks the approval while an agent result exists', () => {
    const result = evaluateFallbackEligibility(
      input({ agentSubmission: { id: 2, status: 'pending' } })
    )

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('agent_submission_exists')
  })

  it('blocks the approval while a verified agent result exists', () => {
    const result = evaluateFallbackEligibility(
      input({ agentSubmission: { id: 2, status: 'verified' } })
    )

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('agent_submission_exists')
  })

  it('blocks the approval while an agent result is being corrected', () => {
    const result = evaluateFallbackEligibility(
      input({ agentSubmission: { id: 2, status: 'flagged' } })
    )

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('agent_submission_exists')
  })

  it('allows the approval when the agent result was rejected', () => {
    const result = evaluateFallbackEligibility(
      input({ agentSubmission: { id: 2, status: 'rejected' } })
    )

    expect(result.eligible).toBe(true)
  })

  it('treats a zero vote agent result as an existing result, not an absent one', () => {
    // The agent reported the station. The votes are zero, which is data, not
    // a missing submission, so the fallback must not be approved.
    const result = evaluateFallbackEligibility(
      input({ agentSubmission: { id: 2, status: 'verified' } })
    )

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('agent_submission_exists')
  })

  it('blocks the approval when another observer fallback is already selected', () => {
    const result = evaluateFallbackEligibility(
      input({
        selectedResult: {
          id: 4,
          source: 'observer_fallback',
          submission_id: 77,
        },
      })
    )

    expect(result.eligible).toBe(false)
    expect(result.code).toBe('another_fallback_selected')
  })

  it('allows re-approving the submission that is already selected', () => {
    const result = evaluateFallbackEligibility(
      input({
        selectedResult: { id: 4, source: 'observer_fallback', submission_id: 1 },
      })
    )

    expect(result.eligible).toBe(true)
  })
})

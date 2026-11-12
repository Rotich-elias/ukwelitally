import { describe, it, expect } from 'vitest'
import { candidateCanSeeSubmissionSql, redactSubmitterContact } from '@/lib/submissionAccess'

/**
 * The shared rule for which submissions a candidate may see. The SQL is
 * checked by shape here; the routes that use it are covered by their own
 * tests.
 */

describe('candidateCanSeeSubmissionSql', () => {
  const sql = candidateCanSeeSubmissionSql('s', 'ps', 'c2').replace(/\s+/g, ' ')

  it("allows the candidate's own team", () => {
    expect(sql).toContain('s.candidate_id = c2.id')
  })

  it('only grants geographic access to observer submissions of the same race', () => {
    // Every geographic clause sits inside the observer-only branch.
    const observerBranch = sql.indexOf("s.submission_origin = 'observer'")
    expect(observerBranch).toBeGreaterThan(-1)
    for (const clause of ["c2.position = 'president'", 'ps.county_id = c2.county_id', 'ps.ward_id = c2.ward_id']) {
      expect(sql.indexOf(clause)).toBeGreaterThan(observerBranch)
    }
    expect(sql).toContain('scope_c.position = c2.position')
    expect(sql).toContain('scope_r.position = c2.position')
  })
})

describe('redactSubmitterContact', () => {
  const row = { candidate_id: 5, submitter_email: 'a@x', submitter_phone: '+254700000000' }

  it('keeps contacts for an admin and for the own team', () => {
    expect(redactSubmitterContact(row, { role: 'admin' })).toEqual(row)
    expect(redactSubmitterContact(row, { role: 'candidate', candidateId: 5 })).toEqual(row)
  })

  it('removes contacts for anyone else', () => {
    expect(redactSubmitterContact(row, { role: 'candidate', candidateId: 6 })).toMatchObject({
      submitter_email: null,
      submitter_phone: null,
    })
    expect(redactSubmitterContact(row, { role: 'observer' })).toMatchObject({
      submitter_email: null,
      submitter_phone: null,
    })
  })
})

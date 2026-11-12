/**
 * Which submissions a candidate may see.
 *
 * A candidate sees:
 *   - every submission of their own team (s.candidate_id), and
 *   - observer submissions for their own race inside their own area. Observers
 *     are neutral volunteers whose submissions serve as a fallback result for
 *     every candidate in the race, so they are shared by design.
 *
 * A candidate never sees another team's agent submissions: their figures,
 * evidence and agent contact details are that team's private data. The old
 * check used only geography, which let a presidential candidate read every
 * team's submissions in the country.
 *
 * Submissions do not store their race. An observer submission's race is the
 * race of the candidate whose reporting window authorised it
 * (scope_candidate_id), or, for older rows, the position of its results.
 */

/**
 * SQL condition, true when the candidate row `c` may see submission `s` at
 * polling station `ps`. The aliases must be in scope in the calling query.
 */
export function candidateCanSeeSubmissionSql(
  s = 's',
  ps = 'ps',
  c = 'c'
): string {
  return `(
    ${s}.candidate_id = ${c}.id
    OR (
      ${s}.submission_origin = 'observer'
      AND (
        ${s}.scope_candidate_id = ${c}.id
        OR (
          (
            EXISTS (
              SELECT 1 FROM candidates scope_c
               WHERE scope_c.id = ${s}.scope_candidate_id
                 AND scope_c.position = ${c}.position
            )
            OR EXISTS (
              SELECT 1 FROM results scope_r
               WHERE scope_r.submission_id = ${s}.id
                 AND scope_r.position = ${c}.position
            )
          )
          AND (
            ${c}.position = 'president'
            OR (${c}.position IN ('governor', 'senator', 'women_rep') AND ${ps}.county_id = ${c}.county_id)
            OR (${c}.position = 'mp' AND ${ps}.constituency_id = ${c}.constituency_id)
            OR (${c}.position = 'mca' AND ${ps}.ward_id = ${c}.ward_id)
          )
        )
      )
    )
  )`
}

/**
 * Remove the submitter's contact details unless the viewer may contact them:
 * an administrator, or the candidate whose own team submitted it.
 */
export function redactSubmitterContact<
  T extends { candidate_id?: number | null; submitter_email?: unknown; submitter_phone?: unknown },
>(row: T, viewer: { role: string; candidateId?: number | null }): T {
  if (viewer.role === 'admin') return row
  if (viewer.candidateId && row.candidate_id === viewer.candidateId) return row
  return { ...row, submitter_email: null, submitter_phone: null }
}

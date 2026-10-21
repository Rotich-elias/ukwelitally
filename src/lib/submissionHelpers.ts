import { query, queryMany } from '@/lib/db'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { getStorage } from '@/lib/storage'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/ukwelitally-uploads'

/**
 * Delete a submission and all related data
 * This includes:
 * - Photo files from disk
 * - submission_photos records
 * - results records
 * - candidate_votes records
 * - submission_reviews records
 * - submission record itself
 *
 * This is a maintenance helper, not part of the correction workflow. A
 * correction is stored as the next version of a submission (see
 * `src/lib/submissionRevisions.ts`) so the original figures and evidence are
 * never destroyed.
 */
export async function deleteSubmission(submissionId: number): Promise<void> {
  console.log('[deleteSubmission] Deleting submission:', submissionId)

  try {
    // Get all photo file paths before deleting from database
    const photos = await queryMany<{ file_path: string }>(
      'SELECT file_path FROM submission_photos WHERE submission_id = $1',
      [submissionId]
    )

    console.log('[deleteSubmission] Found', photos.length, 'photos to delete')

    // Delete photo files. Only the local disk backend supports deletion;
    // object storage backends should be cleaned up with a lifecycle rule.
    const storage = getStorage()
    if (storage.name === 'local') {
      for (const photo of photos) {
        try {
          const fullPath = join(UPLOAD_DIR, photo.file_path)
          if (existsSync(fullPath)) {
            await unlink(fullPath)
            console.log('[deleteSubmission] Deleted file:', fullPath)
          }
        } catch (error) {
          console.error('[deleteSubmission] Error deleting file:', photo.file_path, error)
          // Continue with other deletions even if one file fails
        }
      }
    }

    // Delete submission from database
    // CASCADE will automatically delete related records:
    // - submission_photos
    // - results (and their candidate_votes)
    // - submission_reviews
    await query('DELETE FROM submissions WHERE id = $1', [submissionId])

    console.log('[deleteSubmission] Successfully deleted submission:', submissionId)
  } catch (error) {
    console.error('[deleteSubmission] Error deleting submission:', error)
    throw error
  }
}

/**
 * Check if a submission can be revised.
 *
 * A submission can be revised when it was flagged or rejected. The revision
 * is stored as the next version of the submission: the original is kept with
 * its figures and its evidence, and the selected result only follows the new
 * version once the new version is approved.
 *
 * Returns the version that would be corrected and the number the new
 * version gets.
 */
export async function canReviseSubmission(
  userId: number,
  pollingStationId: number,
  candidateId: number,
  submissionType: string
): Promise<{
  canRevise: boolean
  existingSubmissionId?: number
  status?: string
  nextRevisionNumber?: number
}> {
  const existingSubmission = await queryMany<{
    id: number
    status: string
    revision_number: number
  }>(
    `SELECT id, status, revision_number FROM submissions
     WHERE user_id = $1 AND polling_station_id = $2 AND candidate_id = $3 AND submission_type = $4
     ORDER BY revision_number DESC
     LIMIT 1`,
    [userId, pollingStationId, candidateId, submissionType]
  )

  if (existingSubmission.length === 0) {
    return { canRevise: true, nextRevisionNumber: 1 } // No existing submission, can create new
  }

  const submission = existingSubmission[0]
  const status = submission.status as string

  if (status === 'flagged' || status === 'rejected') {
    return {
      canRevise: true,
      existingSubmissionId: submission.id,
      status,
      nextRevisionNumber: submission.revision_number + 1,
    }
  }

  return {
    canRevise: false,
    existingSubmissionId: submission.id,
    status,
    nextRevisionNumber: submission.revision_number,
  }
}

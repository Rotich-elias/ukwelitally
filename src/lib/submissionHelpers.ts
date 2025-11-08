import { query, queryMany } from '@/lib/db'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

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

    // Delete photo files from disk
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
 * Check if a submission can be revised
 * Returns true if submission exists and is flagged/rejected
 */
export async function canReviseSubmission(
  userId: number,
  pollingStationId: number,
  candidateId: number,
  submissionType: string
): Promise<{ canRevise: boolean; existingSubmissionId?: number; status?: string }> {
  const existingSubmission = await queryMany(
    `SELECT id, status FROM submissions
     WHERE user_id = $1 AND polling_station_id = $2 AND candidate_id = $3 AND submission_type = $4`,
    [userId, pollingStationId, candidateId, submissionType]
  )

  if (existingSubmission.length === 0) {
    return { canRevise: true } // No existing submission, can create new
  }

  const submission = existingSubmission[0]
  const status = submission.status as string

  if (status === 'flagged' || status === 'rejected') {
    return {
      canRevise: true,
      existingSubmissionId: submission.id,
      status,
    }
  }

  return {
    canRevise: false,
    existingSubmissionId: submission.id,
    status,
  }
}

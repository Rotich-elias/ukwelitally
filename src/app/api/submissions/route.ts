import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, queryMany, transaction } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { parseFormData, saveUploadedFile } from '@/lib/fileUpload'
import { verifyLocation, calculateConfidenceScore } from '@/lib/validation'
import { getObserverAssignment, getPlaceholderCandidateId } from '@/lib/observer'
import { getFileUrl, getEvidenceUrl } from '@/lib/storage'
import { checkRateLimit, getClientIp, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'
import { getCurrentVersion } from '@/lib/submissionRevisions'
import {
  evaluateSubmissionAuthorization,
  getAgentWindowContext,
  getObserverWindowContext,
} from '@/lib/submissionWindow'
import { Submission, PollingStation, Agent, Candidate } from '@/types/database'

/** The positions a result may be reported for. */
const VALID_POSITIONS = ['president', 'governor', 'senator', 'women_rep', 'mp', 'mca']

// GET /api/submissions - List submissions
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user
    const { searchParams } = new URL(req.url)
    const pollingStationId = searchParams.get('polling_station_id')
    const candidateId = searchParams.get('candidate_id')
    const status = searchParams.get('status')

    let sql = `
      SELECT s.*,
             u.full_name as submitter_name,
             ps.name as polling_station_name,
             ps.code as polling_station_code,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', sp.id,
                   'photo_type', sp.photo_type
                 )
               ) FILTER (WHERE sp.id IS NOT NULL),
               '[]'
             ) as photos
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN polling_stations ps ON s.polling_station_id = ps.id
      LEFT JOIN submission_photos sp ON s.id = sp.submission_id
      WHERE 1=1
    `
    const params: any[] = []
    let paramIndex = 1

    // Apply filters based on role
    if (user.role === 'agent') {
      const agent = await queryOne<Agent>(
        'SELECT candidate_id FROM agents WHERE user_id = $1',
        [user.userId]
      )
      if (!agent) {
        return NextResponse.json({ error: 'Agent profile not found' }, { status: 404 })
      }
      sql += ` AND s.candidate_id = $${paramIndex++}`
      params.push(agent.candidate_id)
    } else if (user.role === 'candidate') {
      const candidate = await queryOne<Candidate>(
        'SELECT id FROM candidates WHERE user_id = $1',
        [user.userId]
      )
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }
      sql += ` AND s.candidate_id = $${paramIndex++}`
      params.push(candidate.id)
    } else if (user.role === 'observer') {
      // An observer only ever sees their own submissions. The alternative
      // results of other observers and the agent results of other teams are
      // not theirs to read.
      sql += ` AND s.user_id = $${paramIndex++}`
      params.push(user.userId)
    }

    // Apply additional filters
    if (pollingStationId) {
      sql += ` AND s.polling_station_id = $${paramIndex++}`
      params.push(pollingStationId)
    }
    if (candidateId && user.role === 'admin') {
      sql += ` AND s.candidate_id = $${paramIndex++}`
      params.push(candidateId)
    }
    if (status) {
      sql += ` AND s.status = $${paramIndex++}`
      params.push(status)
    }

    // The photos are aggregated per submission, so the rows are grouped
    // after the filters have been applied.
    sql += ' GROUP BY s.id, u.id, ps.id'
    sql += ' ORDER BY s.created_at DESC LIMIT 100'

    const submissions = await queryMany(sql, params)

    // The evidence of a submission is private, so it is served through the
    // authorized evidence route instead of the public upload route.
    const withEvidence = submissions.map((submission: any) => ({
      ...submission,
      photos: (submission.photos || []).map((photo: any) => ({
        ...photo,
        file_path: getEvidenceUrl(photo.id),
      })),
    }))

    return NextResponse.json({ submissions: withEvidence })
  } catch (error) {
    console.error('Error fetching submissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/submissions - Create new submission with photos
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user

    // Rate limit the submission endpoint per user and client address.
    const limit = checkRateLimit(
      rateLimitKey('submission', `${user.userId}:${getClientIp(req)}`),
      RATE_LIMITS.submission.limit,
      RATE_LIMITS.submission.windowMs
    )
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many submissions. Please wait a moment and try again.',
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    // Parse multipart form data
    const { fields, files } = await parseFormData(req)

    // Validate required fields
    const pollingStationId = parseInt(fields.polling_station_id)
    let submissionType = fields.submission_type || 'primary'
    const submittedLat = fields.submitted_lat ? parseFloat(fields.submitted_lat) : null
    const submittedLng = fields.submitted_lng ? parseFloat(fields.submitted_lng) : null
    const deviceId = fields.device_id || null
    const deviceType = fields.device_type || null

    if (!pollingStationId) {
      return NextResponse.json(
        { error: 'polling_station_id is required' },
        { status: 400 }
      )
    }

    // Observers tally results for a position rather than a candidate, so the
    // candidate is resolved server side from their assignment. Everyone else
    // must supply the candidate explicitly.
    let candidateId: number
    if (user.role === 'observer') {
      const assignment = await getObserverAssignment(user.userId)
      if (!assignment) {
        return NextResponse.json(
          { error: 'No active observer assignment found' },
          { status: 403 }
        )
      }

      if (assignment.polling_station_id !== pollingStationId) {
        return NextResponse.json(
          { error: 'Observer is not assigned to this polling station' },
          { status: 403 }
        )
      }

      const position = fields.position || 'president'
      const placeholderId = await getPlaceholderCandidateId(position)
      if (!placeholderId) {
        return NextResponse.json(
          { error: `No observer submission target configured for position: ${position}` },
          { status: 500 }
        )
      }
      candidateId = placeholderId
    } else {
      candidateId = parseInt(fields.candidate_id)
      if (!candidateId) {
        return NextResponse.json(
          { error: 'polling_station_id and candidate_id are required' },
          { status: 400 }
        )
      }
    }

    // Get polling station details
    const pollingStation = await queryOne<PollingStation>(
      'SELECT * FROM polling_stations WHERE id = $1',
      [pollingStationId]
    )

    if (!pollingStation) {
      return NextResponse.json({ error: 'Polling station not found' }, { status: 404 })
    }

    // Verify user has permission for this candidate
    if (user.role === 'agent') {
      const agent = await queryOne<Agent>(
        'SELECT * FROM agents WHERE user_id = $1 AND candidate_id = $2',
        [user.userId, candidateId]
      )
      if (!agent) {
        return NextResponse.json({ error: 'Unauthorized for this candidate' }, { status: 403 })
      }
      // Verify agent is assigned to this polling station (for primary submissions)
      if (submissionType === 'primary' && agent.polling_station_id !== pollingStationId) {
        return NextResponse.json(
          { error: 'Agent not assigned to this polling station' },
          { status: 403 }
        )
      }
    } else if (user.role === 'candidate') {
      const candidate = await queryOne<Candidate>(
        'SELECT id FROM candidates WHERE user_id = $1 AND id = $2',
        [user.userId, candidateId]
      )
      if (!candidate) {
        return NextResponse.json({ error: 'Unauthorized for this candidate' }, { status: 403 })
      }
    } else if (user.role === 'observer') {
      // Observers submit against the position placeholder candidate and are
      // already validated against their assignment above.
      const placeholder = await queryOne<{ position: string }>(
        'SELECT position FROM candidates WHERE id = $1 AND is_placeholder = TRUE',
        [candidateId]
      )
      if (!placeholder) {
        return NextResponse.json(
          { error: 'Invalid observer submission target' },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Only agents and observers can submit results' },
        { status: 403 }
      )
    }

    // An observer submission is an alternative result. It must never be
    // recorded as a primary result, and the submission type is fixed by the
    // role rather than by the request.
    const submissionOrigin = user.role === 'observer' ? 'observer' : 'agent'
    if (user.role === 'observer' && submissionType === 'primary') {
      return NextResponse.json(
        { error: 'Observers submit alternative results, not primary results' },
        { status: 400 }
      )
    }
    if (user.role === 'observer') {
      submissionType = 'backup'
    }

    // Submission permission is checked on the server: an active account,
    // valid purchased access, an assigned polling station and an open
    // reporting window. A stale frontend cannot bypass any of it.
    const account = await queryOne<{ active: boolean }>(
      'SELECT active FROM users WHERE id = $1',
      [user.userId]
    )
    const accountActive = account?.active === true

    const position = user.role === 'observer' ? fields.position || 'president' : null

    if (user.role === 'observer' && !VALID_POSITIONS.includes(position!)) {
      return NextResponse.json(
        { error: 'Invalid position for an observer submission' },
        { status: 400 }
      )
    }

    const windowContext =
      user.role === 'observer'
        ? await getObserverWindowContext(user.userId, pollingStationId, position!)
        : await getAgentWindowContext(user.userId)

    if (!windowContext) {
      return NextResponse.json(
        { error: 'Your reporting profile could not be resolved' },
        { status: 403 }
      )
    }

    const stationAssigned =
      user.role === 'agent'
        ? (await queryOne<{ polling_station_id: number | null }>(
            'SELECT polling_station_id FROM agents WHERE user_id = $1 AND candidate_id = $2',
            [user.userId, candidateId]
          ))?.polling_station_id === pollingStationId
        : true

    const authorization = evaluateSubmissionAuthorization({
      role: user.role,
      accountActive,
      candidateAccessStatus: windowContext.accessStatus,
      window: windowContext.evaluation,
      stationAssigned,
      kind: user.role === 'observer' ? 'observer' : 'agent',
    })

    if (!authorization.allowed) {
      return NextResponse.json(
        {
          error: authorization.message,
          code: authorization.code,
          window_status: windowContext.evaluation.status,
        },
        { status: 403 }
      )
    }

    // Verify GPS location if provided
    let locationVerified = false
    let distance = 0
    if (submittedLat && submittedLng && pollingStation.latitude && pollingStation.longitude) {
      const verification = verifyLocation(
        submittedLat,
        submittedLng,
        pollingStation.latitude,
        pollingStation.longitude,
        pollingStation.location_radius
      )
      locationVerified = verification.verified
      distance = verification.distance
    }

    // A correction is stored as the next version of the submission. The
    // original submission, its figures and its evidence are kept: nothing is
    // deleted, and the selected result only follows the new version once the
    // new version is approved.
    const existingSubmission = await getCurrentVersion({
      userId: user.userId,
      pollingStationId,
      candidateId,
      submissionType,
    })

    let supersedesSubmissionId: number | null = null
    let revisionNumber = 1
    let revisionReason: string | null = null

    if (existingSubmission) {
      const status = existingSubmission.status

      if (status === 'flagged' || status === 'rejected') {
        revisionReason = (fields.revision_reason || '').trim() || null
        if (!revisionReason) {
          return NextResponse.json(
            {
              error:
                'A reason is required when correcting a submission. Explain what was wrong with the previous version.',
            },
            { status: 400 }
          )
        }

        supersedesSubmissionId = existingSubmission.id
        revisionNumber = existingSubmission.revision_number + 1
      } else {
        // Submission exists and is pending or verified - block duplicate
        return NextResponse.json(
          {
            error: 'Submission already exists for this polling station',
            details: `Your ${status} submission for this polling station cannot be replaced. Contact admin if you need to make changes.`,
          },
          { status: 409 }
        )
      }
    }

    // Check if user is a primary agent for auto-verification
    let isPrimaryAgent = false
    if (user.role === 'agent') {
      const agentCheck = await queryOne<Agent>(
        'SELECT is_primary FROM agents WHERE user_id = $1 AND candidate_id = $2',
        [user.userId, candidateId]
      )
      isPrimaryAgent = agentCheck?.is_primary || false
    }

    // Process within transaction
    const result = await transaction(async (client) => {
      // Create submission
      const submissionResult = await client.query<Submission>(
        `INSERT INTO submissions (
          polling_station_id, user_id, candidate_id, submission_type,
          submission_origin, review_status, scope_candidate_id,
          supersedes_submission_id, revision_number, revision_reason,
          submitted_lat, submitted_lng, location_verified,
          device_id, device_type, ip_address, confidence_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          pollingStationId,
          user.userId,
          candidateId,
          submissionType,
          submissionOrigin,
          // An observer submission waits for the candidate to decide whether it
          // can be used as the fallback for a station.
          submissionOrigin === 'observer' ? 'pending_review' : null,
          // The candidate whose reporting window authorised this submission.
          windowContext.authorisedByCandidateId,
          supersedesSubmissionId,
          revisionNumber,
          revisionReason,
          submittedLat,
          submittedLng,
          locationVerified,
          deviceId,
          deviceType,
          req.headers.get('x-forwarded-for') || 'unknown',
          0, // Will update after processing photos
        ]
      )

      const submission = submissionResult.rows[0]

      // Process and save photos
      const photoTypes = ['full_form', 'closeup', 'signature', 'stamp', 'serial_number']
      const uploadedPhotos: any[] = []
      const skippedPhotos: Array<{ type: string; reason: string }> = []
      const photoHashes = new Set<string>()
      let attemptedPhotos = 0
      let storageFailures = 0

      for (const [fieldName, fileArray] of Object.entries(files)) {
        const photoType = photoTypes.find((t) => fieldName.includes(t)) || 'other'

        for (const file of fileArray) {
          attemptedPhotos++
          try {
            const fileInfo = await saveUploadedFile(file, `submission-${submission.id}`)

            // Check for duplicate hash
            if (photoHashes.has(fileInfo.hash)) {
              skippedPhotos.push({
                type: photoType,
                reason: 'The same photo was already attached to this submission.',
              })
              continue // Skip duplicate
            }
            photoHashes.add(fileInfo.hash)

            // The photo insert runs inside a savepoint. A rejected photo
            // (for example the same image uploaded twice, which the unique
            // hash constraint refuses) then only rolls back that photo
            // instead of aborting the whole submission.
            await client.query('SAVEPOINT photo_insert')
            try {
              // Insert photo record
              const photoRecord = await client.query<{ id: number }>(
                `INSERT INTO submission_photos (
                  submission_id, photo_type, file_path, file_size, mime_type,
                  width, height, exif_data, hash
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id`,
                [
                  submission.id,
                  photoType,
                  fileInfo.filePath,
                  fileInfo.fileSize,
                  fileInfo.mimeType,
                  fileInfo.width,
                  fileInfo.height,
                  JSON.stringify(fileInfo.exifData),
                  fileInfo.hash,
                ]
              )
              await client.query('RELEASE SAVEPOINT photo_insert')

              uploadedPhotos.push({
                id: photoRecord.rows[0]?.id,
                type: photoType,
                ...fileInfo,
              })
            } catch (error) {
              await client.query('ROLLBACK TO SAVEPOINT photo_insert')
              console.error('Error uploading photo:', error)
              skippedPhotos.push({
                type: photoType,
                reason: 'The photo could not be stored and was not attached.',
              })
              // Continue with other photos
            }
          } catch (error) {
            storageFailures++
            console.error('Error uploading photo:', error)
            const reason =
              error instanceof Error
                ? error.message
                : 'The photo could not be stored and was not attached.'
            skippedPhotos.push({ type: photoType, reason })
            // Continue with other photos
          }
        }
      }

      // A submission whose evidence could not be stored at all must not be
      // accepted: the row would look valid while the image it points at does
      // not exist. Failing here rolls the whole transaction back and tells the
      // agent why, instead of silently creating a submission with no evidence.
      if (attemptedPhotos > 0 && uploadedPhotos.length === 0 && storageFailures > 0) {
        const reason = skippedPhotos[0]?.reason || 'The photos could not be stored.'
        throw new Error(`The evidence photos could not be saved. ${reason}`)
      }

      // Calculate confidence score
      const hasAllRequiredPhotos = ['full_form', 'signature'].every((type) =>
        uploadedPhotos.some((p) => p.type === type)
      )
      const confidenceScore = calculateConfidenceScore({
        locationVerified,
        distance,
        photoCount: uploadedPhotos.length,
        hasAllRequiredPhotos,
        mathValid: true, // Will be validated when results are entered
        submittedWithinHours: 1, // Assume timely for now
        historicalMatch: false, // Would need historical data
      })

      // Auto-verify primary agents with good confidence scores
      let status = 'pending'
      let verifiedAt = null

      if (isPrimaryAgent && submissionType === 'primary' && confidenceScore >= 60) {
        status = 'verified'
        verifiedAt = new Date()
      }

      // Update submission with confidence score and auto-verification
      await client.query(
        'UPDATE submissions SET confidence_score = $1, status = $2, verified_at = $3 WHERE id = $4',
        [confidenceScore, status, verifiedAt, submission.id]
      )

      return {
        submission: {
          ...submission,
          confidence_score: confidenceScore,
          status,
          verified_at: verifiedAt
        },
        uploadedPhotos,
        skippedPhotos
      }
    })

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        'submission_created',
        'submission',
        result.submission.id,
        JSON.stringify({
          polling_station_id: pollingStationId,
          photo_count: result.uploadedPhotos.length,
          submission_origin: submissionOrigin,
          submission_type: submissionType,
          review_status: result.submission.review_status,
          scope_candidate_id: windowContext.authorisedByCandidateId,
          revision_number: revisionNumber,
        }),
      ]
    )

    // A correction is recorded separately, so the relationship between the
    // versions, the correcting user, the time and the reason are in the
    // audit trail.
    if (supersedesSubmissionId) {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, 'submission_revised', 'submission', $2, $3, $4)`,
        [
          user.userId,
          result.submission.id,
          JSON.stringify({
            superseded_submission_id: supersedesSubmissionId,
            previous_status: existingSubmission?.status,
          }),
          JSON.stringify({
            revision_submission_id: result.submission.id,
            revision_number: revisionNumber,
            revision_reason: revisionReason,
            corrected_by: user.userId,
            corrected_at: new Date().toISOString(),
          }),
        ]
      )
    }

    // The evidence is private, so it is served through the authorized
    // evidence route instead of the public upload route.
    const photosWithUrls = result.uploadedPhotos.map((photo: any) => ({
      ...photo,
      filePath: photo.id ? getEvidenceUrl(photo.id) : getFileUrl(photo.filePath),
    }))

    return NextResponse.json(
      {
        message: 'Submission created successfully',
        submission: result.submission,
        photos: photosWithUrls,
        // Photos that could not be attached are reported, never dropped
        // silently.
        skipped_photos: result.skippedPhotos,
      },
      { status: 201 }
    )
  } catch (error) {
    // The unique index idx_submissions_user_station_candidate_type (migration
    // 014) rejects a second submission for the same user, polling station,
    // submission type and candidate. The duplicate is normally caught by the
    // pre-insert check above, but two concurrent requests can both pass it.
    // Report that as the conflict it is instead of a 500.
    const pgCode = (error as { code?: string } | null)?.code
    if (pgCode === '23505') {
      return NextResponse.json(
        {
          error: 'Submission already exists for this polling station',
          details:
            'A submission for this polling station, type and candidate already exists. Please refresh and try again.',
        },
        { status: 409 }
      )
    }

    console.error('Error creating submission:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)
export const POST = withAuth(handlePost as any)

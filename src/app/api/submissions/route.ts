import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, queryMany, transaction } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { parseFormData, saveUploadedFile } from '@/lib/fileUpload'
import { verifyLocation, calculateConfidenceScore } from '@/lib/validation'
import { Submission, PollingStation, Agent, Candidate } from '@/types/database'

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
             ps.code as polling_station_code
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN polling_stations ps ON s.polling_station_id = ps.id
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

    sql += ' ORDER BY s.created_at DESC LIMIT 100'

    const submissions = await queryMany(sql, params)

    return NextResponse.json({ submissions })
  } catch (error) {
    console.error('Error fetching submissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/submissions - Create new submission with photos
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user

    // Parse multipart form data
    const { fields, files } = await parseFormData(req)

    // Validate required fields
    const pollingStationId = parseInt(fields.polling_station_id)
    const candidateId = parseInt(fields.candidate_id)
    const submissionType = fields.submission_type || 'primary'
    const submittedLat = fields.submitted_lat ? parseFloat(fields.submitted_lat) : null
    const submittedLng = fields.submitted_lng ? parseFloat(fields.submitted_lng) : null
    const deviceId = fields.device_id || null
    const deviceType = fields.device_type || null

    if (!pollingStationId || !candidateId) {
      return NextResponse.json(
        { error: 'polling_station_id and candidate_id are required' },
        { status: 400 }
      )
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

    // Check for duplicate submission (same user, station, candidate)
    const existingSubmission = await queryOne(
      `SELECT id FROM submissions
       WHERE user_id = $1 AND polling_station_id = $2 AND candidate_id = $3 AND submission_type = $4`,
      [user.userId, pollingStationId, candidateId, submissionType]
    )

    if (existingSubmission) {
      return NextResponse.json(
        { error: 'Submission already exists for this polling station' },
        { status: 409 }
      )
    }

    // Process within transaction
    const result = await transaction(async (client) => {
      // Create submission
      const submissionResult = await client.query<Submission>(
        `INSERT INTO submissions (
          polling_station_id, user_id, candidate_id, submission_type,
          submitted_lat, submitted_lng, location_verified,
          device_id, device_type, ip_address, confidence_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          pollingStationId,
          user.userId,
          candidateId,
          submissionType,
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
      const photoHashes = new Set<string>()

      for (const [fieldName, fileArray] of Object.entries(files)) {
        const photoType = photoTypes.find((t) => fieldName.includes(t)) || 'other'

        for (const file of fileArray) {
          try {
            const fileInfo = await saveUploadedFile(file, `submission-${submission.id}`)

            // Check for duplicate hash
            if (photoHashes.has(fileInfo.hash)) {
              continue // Skip duplicate
            }
            photoHashes.add(fileInfo.hash)

            // Insert photo record
            await client.query(
              `INSERT INTO submission_photos (
                submission_id, photo_type, file_path, file_size, mime_type,
                width, height, exif_data, hash
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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

            uploadedPhotos.push({ type: photoType, ...fileInfo })
          } catch (error) {
            console.error('Error uploading photo:', error)
            // Continue with other photos
          }
        }
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

      // Update submission with confidence score
      await client.query('UPDATE submissions SET confidence_score = $1 WHERE id = $2', [
        confidenceScore,
        submission.id,
      ])

      return { submission: { ...submission, confidence_score: confidenceScore }, uploadedPhotos }
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
        JSON.stringify({ polling_station_id: pollingStationId, photo_count: result.uploadedPhotos.length }),
      ]
    )

    return NextResponse.json(
      {
        message: 'Submission created successfully',
        submission: result.submission,
        photos: result.uploadedPhotos,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating submission:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)
export const POST = withAuth(handlePost as any)

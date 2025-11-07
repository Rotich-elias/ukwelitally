import { NextRequest, NextResponse } from 'next/server'
import { query, queryMany, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { parseFormData, saveCandidatePhoto } from '@/lib/fileUpload'

// GET /api/ballot-candidates - List all ballot candidates
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user

    // Only admins can manage ballot candidates
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const position = searchParams.get('position')

    let sql = `
      SELECT
        c.id,
        c.full_name as candidate_name,
        c.position,
        c.party_name,
        c.party_abbreviation,
        c.is_system_user,
        co.name as county_name,
        con.name as constituency_name,
        w.name as ward_name,
        c.created_at
      FROM candidates c
      LEFT JOIN counties co ON c.county_id = co.id
      LEFT JOIN constituencies con ON c.constituency_id = con.id
      LEFT JOIN wards w ON c.ward_id = w.id
      WHERE c.is_system_user = false
    `
    const params: any[] = []
    let paramIndex = 1

    if (position) {
      sql += ` AND c.position = $${paramIndex++}`
      params.push(position)
    }

    sql += ' ORDER BY c.position, c.full_name'

    const candidates = await queryMany(sql, params)

    return NextResponse.json({ candidates })
  } catch (error) {
    console.error('Error fetching ballot candidates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/ballot-candidates - Create a new ballot candidate
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user

    // Only admins can create ballot candidates
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Parse FormData
    const { fields, files } = await parseFormData(req)

    const full_name = fields.full_name
    const position = fields.position
    const party_name = fields.party_name || null
    const party_abbreviation = fields.party_abbreviation || null
    const county_id = fields.county_id ? parseInt(fields.county_id) : null
    const constituency_id = fields.constituency_id ? parseInt(fields.constituency_id) : null
    const ward_id = fields.ward_id ? parseInt(fields.ward_id) : null

    // Validate required fields
    if (!full_name || !position) {
      return NextResponse.json(
        { error: 'full_name and position are required' },
        { status: 400 }
      )
    }

    // Validate position
    const validPositions = ['president', 'governor', 'senator', 'women_rep', 'mp', 'mca']
    if (!validPositions.includes(position)) {
      return NextResponse.json({ error: 'Invalid position' }, { status: 400 })
    }

    // Validate location restrictions based on position
    if (position === 'mca' && !ward_id) {
      return NextResponse.json(
        { error: 'MCA candidates must be assigned to a specific ward' },
        { status: 400 }
      )
    }
    if (position === 'mp' && !constituency_id) {
      return NextResponse.json(
        { error: 'MP candidates must be assigned to a specific constituency' },
        { status: 400 }
      )
    }
    if ((position === 'governor' || position === 'senator' || position === 'women_rep') && !county_id) {
      return NextResponse.json(
        { error: `${position.replace('_', ' ')} candidates must be assigned to a specific county` },
        { status: 400 }
      )
    }

    // Handle profile photo upload
    let profile_photo = null
    if (files.profile_photo && files.profile_photo.length > 0) {
      try {
        profile_photo = await saveCandidatePhoto(files.profile_photo[0])
      } catch (photoError) {
        return NextResponse.json(
          { error: photoError instanceof Error ? photoError.message : 'Photo upload failed' },
          { status: 400 }
        )
      }
    }

    // Check for duplicates
    const existing = await queryOne(
      `SELECT id FROM candidates
       WHERE full_name = $1 AND position = $2 AND is_system_user = false`,
      [full_name, position]
    )

    if (existing) {
      return NextResponse.json(
        { error: 'Ballot candidate already exists with this name and position' },
        { status: 409 }
      )
    }

    // Insert ballot candidate
    const result = await query(
      `INSERT INTO candidates (
        full_name, position, party_name, party_abbreviation,
        county_id, constituency_id, ward_id, profile_photo, is_system_user
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
      RETURNING *`,
      [
        full_name,
        position,
        party_name,
        party_abbreviation,
        county_id,
        constituency_id,
        ward_id,
        profile_photo,
      ]
    )

    const candidate = result.rows[0]

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        'ballot_candidate_created',
        'candidate',
        candidate.id,
        JSON.stringify({ full_name, position, party_name, has_photo: !!profile_photo }),
      ]
    )

    return NextResponse.json(
      { message: 'Ballot candidate created successfully', candidate },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating ballot candidate:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/ballot-candidates - Update a ballot candidate
async function handlePut(req: NextRequest) {
  try {
    const user = (req as any).user

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Parse FormData
    const { fields, files } = await parseFormData(req)

    const candidate_id = fields.candidate_id ? parseInt(fields.candidate_id) : null
    const full_name = fields.full_name || null
    const party_name = fields.party_name || null
    const party_abbreviation = fields.party_abbreviation || null

    if (!candidate_id) {
      return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 })
    }

    // Verify it's a ballot candidate
    const existing = await queryOne(
      'SELECT * FROM candidates WHERE id = $1 AND is_system_user = false',
      [candidate_id]
    )

    if (!existing) {
      return NextResponse.json(
        { error: 'Ballot candidate not found' },
        { status: 404 }
      )
    }

    // Handle profile photo upload
    let profile_photo = null
    if (files.profile_photo && files.profile_photo.length > 0) {
      try {
        profile_photo = await saveCandidatePhoto(files.profile_photo[0])
      } catch (photoError) {
        return NextResponse.json(
          { error: photoError instanceof Error ? photoError.message : 'Photo upload failed' },
          { status: 400 }
        )
      }
    }

    // Update
    const result = await query(
      `UPDATE candidates
       SET full_name = COALESCE($1, full_name),
           party_name = COALESCE($2, party_name),
           party_abbreviation = COALESCE($3, party_abbreviation),
           profile_photo = COALESCE($4, profile_photo)
       WHERE id = $5 AND is_system_user = false
       RETURNING *`,
      [full_name, party_name, party_abbreviation, profile_photo, candidate_id]
    )

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.userId,
        'ballot_candidate_updated',
        'candidate',
        candidate_id,
        JSON.stringify(existing),
        JSON.stringify(result.rows[0]),
      ]
    )

    return NextResponse.json({
      message: 'Ballot candidate updated successfully',
      candidate: result.rows[0],
    })
  } catch (error) {
    console.error('Error updating ballot candidate:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/ballot-candidates - Delete a ballot candidate
async function handleDelete(req: NextRequest) {
  try {
    const user = (req as any).user

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const candidateId = searchParams.get('candidate_id')

    if (!candidateId) {
      return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 })
    }

    // Verify it's a ballot candidate
    const existing = await queryOne(
      'SELECT * FROM candidates WHERE id = $1 AND is_system_user = false',
      [candidateId]
    )

    if (!existing) {
      return NextResponse.json(
        { error: 'Ballot candidate not found' },
        { status: 404 }
      )
    }

    // Check if candidate has any results
    const hasResults = await queryOne(
      'SELECT COUNT(*) as count FROM candidate_votes WHERE candidate_name = $1',
      [existing.full_name]
    )

    if (hasResults && parseInt(hasResults.count) > 0) {
      return NextResponse.json(
        {
          error:
            'Cannot delete ballot candidate with existing results. Please archive instead.',
        },
        { status: 409 }
      )
    }

    // Delete
    await query('DELETE FROM candidates WHERE id = $1', [candidateId])

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        'ballot_candidate_deleted',
        'candidate',
        candidateId,
        JSON.stringify(existing),
      ]
    )

    return NextResponse.json({ message: 'Ballot candidate deleted successfully' })
  } catch (error) {
    console.error('Error deleting ballot candidate:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)
export const POST = withAuth(handlePost as any)
export const PUT = withAuth(handlePut as any)
export const DELETE = withAuth(handleDelete as any)

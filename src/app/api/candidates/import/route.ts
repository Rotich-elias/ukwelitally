import { NextRequest, NextResponse } from 'next/server'
import { query, transaction, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'

// Generate unique candidate number
async function generateCandidateNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `CAND-${year}-`

  // Get the highest number for this year
  const result = await queryOne(
    `SELECT candidate_number FROM candidates
     WHERE candidate_number LIKE $1
     ORDER BY candidate_number DESC
     LIMIT 1`,
    [`${prefix}%`]
  )

  let nextNumber = 1
  if (result && result.candidate_number) {
    const lastNumber = parseInt(result.candidate_number.split('-')[2])
    nextNumber = lastNumber + 1
  }

  return `${prefix}${String(nextNumber).padStart(5, '0')}`
}

// POST /api/candidates/import - Bulk import candidates from CSV
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user

    // Only admins can import candidates
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read CSV content
    const content = await file.text()
    const lines = content.split('\n').filter((line) => line.trim())

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV file must have at least a header and one data row' },
        { status: 400 }
      )
    }

    // Parse header
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
    const requiredColumns = ['full_name', 'position', 'party_name', 'party_abbreviation']
    const missingColumns = requiredColumns.filter((col) => !header.includes(col))

    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required columns: ${missingColumns.join(', ')}`,
          hint: 'CSV must have: full_name, position, party_name, party_abbreviation, county_id (optional), constituency_id (optional), ward_id (optional)',
        },
        { status: 400 }
      )
    }

    // Valid positions
    const validPositions = ['president', 'governor', 'senator', 'women_rep', 'mp', 'mca']

    // Parse data rows
    const candidates: any[] = []
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const values = line.split(',').map((v) => v.trim())
      const row: any = {}

      header.forEach((col, index) => {
        row[col] = values[index] || null
      })

      // Validate required fields
      if (!row.full_name) {
        errors.push(`Row ${i + 1}: Missing full_name`)
        continue
      }

      if (!row.position) {
        errors.push(`Row ${i + 1}: Missing position`)
        continue
      }

      if (!validPositions.includes(row.position.toLowerCase())) {
        errors.push(`Row ${i + 1}: Invalid position '${row.position}'. Must be one of: ${validPositions.join(', ')}`)
        continue
      }

      if (!row.party_name) {
        errors.push(`Row ${i + 1}: Missing party_name`)
        continue
      }

      if (!row.party_abbreviation) {
        errors.push(`Row ${i + 1}: Missing party_abbreviation`)
        continue
      }

      // Validate position-specific location requirements
      const position = row.position.toLowerCase()

      // President - no location required
      if (position === 'president') {
        // No location validation needed
      }
      // Governor, Senator, Women Rep - require county_id
      else if (['governor', 'senator', 'women_rep'].includes(position)) {
        if (!row.county_id) {
          errors.push(`Row ${i + 1}: ${position} requires county_id`)
          continue
        }
        const countyId = parseInt(row.county_id)
        if (isNaN(countyId)) {
          errors.push(`Row ${i + 1}: Invalid county_id '${row.county_id}'`)
          continue
        }
        row.county_id = countyId
      }
      // MP - requires constituency_id
      else if (position === 'mp') {
        if (!row.constituency_id) {
          errors.push(`Row ${i + 1}: MP requires constituency_id`)
          continue
        }
        const constituencyId = parseInt(row.constituency_id)
        if (isNaN(constituencyId)) {
          errors.push(`Row ${i + 1}: Invalid constituency_id '${row.constituency_id}'`)
          continue
        }
        row.constituency_id = constituencyId
      }
      // MCA - requires ward_id
      else if (position === 'mca') {
        if (!row.ward_id) {
          errors.push(`Row ${i + 1}: MCA requires ward_id`)
          continue
        }
        const wardId = parseInt(row.ward_id)
        if (isNaN(wardId)) {
          errors.push(`Row ${i + 1}: Invalid ward_id '${row.ward_id}'`)
          continue
        }
        row.ward_id = wardId
      }

      candidates.push({
        full_name: row.full_name,
        position: position,
        party_name: row.party_name,
        party_abbreviation: row.party_abbreviation,
        county_id: row.county_id || null,
        constituency_id: row.constituency_id || null,
        ward_id: row.ward_id || null,
      })
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: 'No valid candidates to import', errors },
        { status: 400 }
      )
    }

    // Import in transaction
    const result = await transaction(async (client) => {
      let imported = 0
      let skipped = 0
      const skippedList = []

      // Get the starting candidate number for this batch
      const year = new Date().getFullYear()
      const prefix = `CAND-${year}-`
      const lastNumberResult = await client.query(
        `SELECT candidate_number FROM candidates
         WHERE candidate_number LIKE $1
         ORDER BY candidate_number DESC
         LIMIT 1`,
        [`${prefix}%`]
      )

      let nextNumber = 1
      if (lastNumberResult.rows.length > 0 && lastNumberResult.rows[0].candidate_number) {
        const lastNumber = parseInt(lastNumberResult.rows[0].candidate_number.split('-')[2])
        nextNumber = lastNumber + 1
      }

      for (const candidate of candidates) {
        // Check if candidate already exists
        const existing = await client.query(
          'SELECT id FROM candidates WHERE full_name = $1 AND position = $2 AND is_system_user = false',
          [candidate.full_name, candidate.position]
        )

        if (existing.rows.length > 0) {
          skipped++
          skippedList.push(`${candidate.full_name} (${candidate.position}) - Candidate already exists`)
          continue
        }

        // Verify county exists if provided
        if (candidate.county_id) {
          const countyExists = await client.query(
            'SELECT id FROM counties WHERE id = $1',
            [candidate.county_id]
          )
          if (countyExists.rows.length === 0) {
            skipped++
            skippedList.push(`${candidate.full_name} - County ID ${candidate.county_id} not found`)
            continue
          }
        }

        // Verify constituency exists if provided
        if (candidate.constituency_id) {
          const constituencyExists = await client.query(
            'SELECT id FROM constituencies WHERE id = $1',
            [candidate.constituency_id]
          )
          if (constituencyExists.rows.length === 0) {
            skipped++
            skippedList.push(`${candidate.full_name} - Constituency ID ${candidate.constituency_id} not found`)
            continue
          }
        }

        // Verify ward exists if provided
        if (candidate.ward_id) {
          const wardExists = await client.query(
            'SELECT id FROM wards WHERE id = $1',
            [candidate.ward_id]
          )
          if (wardExists.rows.length === 0) {
            skipped++
            skippedList.push(`${candidate.full_name} - Ward ID ${candidate.ward_id} not found`)
            continue
          }
        }

        // Generate unique candidate number for this candidate
        const candidate_number = `${prefix}${String(nextNumber).padStart(5, '0')}`
        nextNumber++ // Increment for next candidate

        // Create candidate
        await client.query(
          `INSERT INTO candidates (full_name, position, party_name, party_abbreviation, county_id, constituency_id, ward_id, is_system_user, candidate_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)`,
          [
            candidate.full_name,
            candidate.position,
            candidate.party_name,
            candidate.party_abbreviation,
            candidate.county_id,
            candidate.constituency_id,
            candidate.ward_id,
            candidate_number,
          ]
        )

        imported++
      }

      return { imported, skipped, skippedList }
    })

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.userId,
        'candidates_imported',
        'candidate',
        null,
        JSON.stringify({ imported: result.imported, skipped: result.skipped }),
      ]
    )

    return NextResponse.json({
      message: 'Import completed',
      imported: result.imported,
      skipped: result.skipped,
      skippedList: result.skippedList,
      errors: errors.length > 0 ? errors : null,
    })
  } catch (error) {
    console.error('Error importing candidates:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

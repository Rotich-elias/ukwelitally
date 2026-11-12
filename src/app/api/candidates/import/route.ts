import { NextRequest, NextResponse } from 'next/server'
import { query, transaction, queryOne } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { parseCsv, readCsvHeaders } from '@/lib/locationAdmin'
import {
  resolveCandidateLocation,
  type ConstituencyRef,
  type CountyRef,
  type WardRef,
} from '@/lib/candidateImportLocation'

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
    const requestedMode = String(formData.get('mode') || 'replace').toLowerCase()
    if (requestedMode !== 'update' && requestedMode !== 'replace') {
      return NextResponse.json(
        { error: 'mode must be update or replace' },
        { status: 400 }
      )
    }
    const mode = requestedMode as 'update' | 'replace'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // parseCsv handles quoted values and both comma and tab separated files.
    const content = await file.text()
    const rows = parseCsv(content)

    if (rows.length < 1) {
      return NextResponse.json(
        { error: 'CSV file must have at least a header and one data row' },
        { status: 400 }
      )
    }

    // Parse header
    const header = readCsvHeaders(content)
    const requiredColumns = ['full_name', 'position', 'party_name', 'party_abbreviation']
    const missingColumns = requiredColumns.filter((col) => !header.includes(col))

    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required columns: ${missingColumns.join(', ')}`,
          hint: 'CSV must have: full_name, position, party_name, party_abbreviation, county, constituency, ward. Location columns hold names, for example "Nairobi", "Westlands", "Parklands/Highridge".',
        },
        { status: 400 }
      )
    }

    // Valid positions
    const validPositions = ['president', 'governor', 'senator', 'women_rep', 'mp', 'mca']

    // Location names are matched against the whole geography, which is small
    // enough (47 counties, ~290 constituencies, ~1,450 wards) to load once.
    const [counties, constituencies, wards] = await Promise.all([
      query<CountyRef>('SELECT id, name FROM counties'),
      query<ConstituencyRef>('SELECT id, name, county_id FROM constituencies'),
      query<WardRef>('SELECT id, name, constituency_id, county_id FROM wards'),
    ])
    const lookup = {
      counties: counties.rows,
      constituencies: constituencies.rows,
      wards: wards.rows,
    }

    // Parse data rows
    const candidates: any[] = []
    const errors: string[] = []

    rows.forEach((row, index) => {
      const rowNumber = index + 2
      if (Object.values(row).every((value) => !value)) return

      // Validate required fields
      for (const column of requiredColumns) {
        if (!row[column]) {
          errors.push(`Row ${rowNumber}: Missing ${column}`)
          return
        }
      }

      const position = row.position.toLowerCase()
      if (!validPositions.includes(position)) {
        errors.push(`Row ${rowNumber}: Invalid position '${row.position}'. Must be one of: ${validPositions.join(', ')}`)
        return
      }

      // Validate position-specific location requirements
      const resolved = resolveCandidateLocation(
        position,
        {
          county: row.county ?? row.county_name,
          constituency: row.constituency ?? row.constituency_name,
          ward: row.ward ?? row.ward_name,
          county_id: row.county_id,
          constituency_id: row.constituency_id,
          ward_id: row.ward_id,
        },
        lookup
      )
      if (!resolved.ok) {
        errors.push(`Row ${rowNumber} (${row.full_name}): ${resolved.error}`)
        return
      }

      candidates.push({
        full_name: row.full_name,
        position,
        party_name: row.party_name,
        party_abbreviation: row.party_abbreviation,
        ...resolved.location,
      })
    })

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: 'No valid candidates to import', errors },
        { status: 400 }
      )
    }

    // Import in transaction
    const result = await transaction(async (client) => {
      let imported = 0
      let updated = 0
      let skipped = 0
      const skippedList: string[] = []
      const replaces = mode === 'replace'
      let deleted = 0

      // Replace mode removes the previous ballot first so re-importing a
      // corrected file does not leave the old entries behind. System candidates
      // (the teams that log in) and observer placeholders are not part of the
      // ballot import and are kept. Update mode never deletes anything.
      if (replaces) {
        const deletedResult = await client.query(
          `DELETE FROM candidates
           WHERE is_system_user = false AND is_placeholder = false`
        )
        deleted = deletedResult.rowCount ?? 0
      }

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
        // The natural key is the name, the position and the electoral area.
        // Two candidates with the same name in different wards are different
        // people, while a corrected party for the same person is an update.
        const existing = await client.query(
          `SELECT id FROM candidates
           WHERE lower(full_name) = lower($1)
             AND position = $2
             AND COALESCE(county_id, 0) = COALESCE($3, 0)
             AND COALESCE(constituency_id, 0) = COALESCE($4, 0)
             AND COALESCE(ward_id, 0) = COALESCE($5, 0)
             AND is_system_user = false
             AND is_placeholder = false
           LIMIT 1`,
          [
            candidate.full_name,
            candidate.position,
            candidate.county_id,
            candidate.constituency_id,
            candidate.ward_id,
          ]
        )

        if (existing.rows.length > 0) {
          if (replaces) {
            // Only a duplicate row inside the same file can reach this after
            // the table was cleared.
            skipped++
            skippedList.push(`${candidate.full_name} (${candidate.position}) - Duplicate row in the file`)
            continue
          }

          await client.query(
            `UPDATE candidates
                SET full_name = $2,
                    party_name = $3,
                    party_abbreviation = $4,
                    county_id = $5,
                    constituency_id = $6,
                    ward_id = $7
              WHERE id = $1`,
            [
              existing.rows[0].id,
              candidate.full_name,
              candidate.party_name,
              candidate.party_abbreviation,
              candidate.county_id,
              candidate.constituency_id,
              candidate.ward_id,
            ]
          )
          updated++
          continue
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

      return { imported, updated, deleted, skipped, skippedList }
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
        JSON.stringify({
          mode,
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          deleted: result.deleted,
        }),
      ]
    )

    return NextResponse.json({
      message: 'Import completed',
      mode,
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      deleted: result.deleted,
      skippedList: result.skippedList,
      errors: errors.length > 0 ? errors : null,
    })
  } catch (error) {
    console.error('Error importing candidates:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

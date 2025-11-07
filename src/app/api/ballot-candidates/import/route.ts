import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, transaction } from '@/lib/db'
import { withAuth } from '@/middleware/auth'

// POST /api/ballot-candidates/import - Bulk import ballot candidates from CSV
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user

    // Only admins can import ballot candidates
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
    const requiredColumns = ['full_name', 'position']
    const missingColumns = requiredColumns.filter((col) => !header.includes(col))

    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required columns: ${missingColumns.join(', ')}`,
          hint: 'CSV must have: full_name, position, party_name, party_abbreviation',
        },
        { status: 400 }
      )
    }

    // Parse data rows
    const candidates: any[] = []
    const errors: string[] = []
    const validPositions = ['president', 'governor', 'senator', 'women_rep', 'mp', 'mca']

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const values = line.split(',').map((v) => v.trim())
      const row: any = {}

      header.forEach((col, index) => {
        row[col] = values[index] || null
      })

      // Validate
      if (!row.full_name) {
        errors.push(`Row ${i + 1}: Missing full_name`)
        continue
      }

      if (!row.position) {
        errors.push(`Row ${i + 1}: Missing position`)
        continue
      }

      if (!validPositions.includes(row.position.toLowerCase())) {
        errors.push(
          `Row ${i + 1}: Invalid position '${row.position}'. Must be one of: ${validPositions.join(', ')}`
        )
        continue
      }

      candidates.push({
        full_name: row.full_name,
        position: row.position.toLowerCase(),
        party_name: row.party_name || null,
        party_abbreviation: row.party_abbreviation || null,
        county_id: row.county_id ? parseInt(row.county_id) : null,
        constituency_id: row.constituency_id ? parseInt(row.constituency_id) : null,
        ward_id: row.ward_id ? parseInt(row.ward_id) : null,
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

      for (const candidate of candidates) {
        // Check for duplicates
        const existing = await client.query(
          `SELECT id FROM candidates
           WHERE full_name = $1 AND position = $2 AND is_system_user = false`,
          [candidate.full_name, candidate.position]
        )

        if (existing.rows.length > 0) {
          skipped++
          skippedList.push(`${candidate.full_name} (${candidate.position}) - already exists`)
          continue
        }

        // Insert
        await client.query(
          `INSERT INTO candidates (
            full_name, position, party_name, party_abbreviation,
            county_id, constituency_id, ward_id, is_system_user
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
          [
            candidate.full_name,
            candidate.position,
            candidate.party_name,
            candidate.party_abbreviation,
            candidate.county_id,
            candidate.constituency_id,
            candidate.ward_id,
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
        'ballot_candidates_imported',
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
    console.error('Error importing ballot candidates:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

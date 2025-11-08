import { NextRequest, NextResponse } from 'next/server'
import { query, transaction } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import { hashPassword, normalizePhoneNumber } from '@/lib/auth'

// POST /api/agents/import - Bulk import agents from CSV
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user

    // Only admins and candidates can import agents
    if (user.role !== 'admin' && user.role !== 'candidate') {
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
    const requiredColumns = ['full_name', 'email', 'phone', 'id_number', 'candidate_id', 'polling_station_id']
    const missingColumns = requiredColumns.filter((col) => !header.includes(col))

    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required columns: ${missingColumns.join(', ')}`,
          hint: 'CSV must have: full_name, email, phone, id_number, candidate_id, polling_station_id, is_primary (optional)',
        },
        { status: 400 }
      )
    }

    // Parse data rows
    const agents: any[] = []
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

      if (!row.email) {
        errors.push(`Row ${i + 1}: Missing email`)
        continue
      }

      if (!row.phone) {
        errors.push(`Row ${i + 1}: Missing phone`)
        continue
      }

      if (!row.id_number) {
        errors.push(`Row ${i + 1}: Missing id_number`)
        continue
      }

      if (!row.candidate_id) {
        errors.push(`Row ${i + 1}: Missing candidate_id`)
        continue
      }

      if (!row.polling_station_id) {
        errors.push(`Row ${i + 1}: Missing polling_station_id`)
        continue
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(row.email)) {
        errors.push(`Row ${i + 1}: Invalid email format '${row.email}'`)
        continue
      }

      // Parse IDs
      const candidateId = parseInt(row.candidate_id)
      const pollingStationId = parseInt(row.polling_station_id)

      if (isNaN(candidateId)) {
        errors.push(`Row ${i + 1}: Invalid candidate_id '${row.candidate_id}'`)
        continue
      }

      if (isNaN(pollingStationId)) {
        errors.push(`Row ${i + 1}: Invalid polling_station_id '${row.polling_station_id}'`)
        continue
      }

      agents.push({
        full_name: row.full_name,
        email: row.email.toLowerCase(),
        phone: row.phone,
        id_number: row.id_number,
        candidate_id: candidateId,
        polling_station_id: pollingStationId,
        is_primary: row.is_primary?.toLowerCase() === 'true' || row.is_primary === '1' || !row.is_primary, // Default to true
        password: row.password || 'Agent123!', // Default password if not provided
      })
    }

    if (agents.length === 0) {
      return NextResponse.json(
        { error: 'No valid agents to import', errors },
        { status: 400 }
      )
    }

    // Import in transaction
    const result = await transaction(async (client) => {
      let imported = 0
      let skipped = 0
      const skippedList = []

      for (const agent of agents) {
        // Normalize phone
        let normalizedPhone
        try {
          normalizedPhone = normalizePhoneNumber(agent.phone)
        } catch (error) {
          skipped++
          skippedList.push(`${agent.full_name} - Invalid phone number: ${agent.phone}`)
          continue
        }

        // Check if user already exists
        const existingUser = await client.query(
          'SELECT id FROM users WHERE email = $1 OR phone = $2 OR id_number = $3',
          [agent.email, normalizedPhone, agent.id_number]
        )

        if (existingUser.rows.length > 0) {
          skipped++
          skippedList.push(`${agent.full_name} (${agent.email}) - User already exists`)
          continue
        }

        // Verify candidate exists
        const candidateExists = await client.query(
          'SELECT id FROM candidates WHERE id = $1',
          [agent.candidate_id]
        )

        if (candidateExists.rows.length === 0) {
          skipped++
          skippedList.push(`${agent.full_name} - Candidate ID ${agent.candidate_id} not found`)
          continue
        }

        // Verify polling station exists
        const stationExists = await client.query(
          'SELECT id FROM polling_stations WHERE id = $1',
          [agent.polling_station_id]
        )

        if (stationExists.rows.length === 0) {
          skipped++
          skippedList.push(`${agent.full_name} - Polling Station ID ${agent.polling_station_id} not found`)
          continue
        }

        // Hash password
        const passwordHash = await hashPassword(agent.password)

        // Create user
        const userResult = await client.query(
          `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
           VALUES ($1, $2, $3, $4, 'agent', $5, true, true)
           RETURNING id`,
          [agent.email, normalizedPhone, passwordHash, agent.full_name, agent.id_number]
        )

        const userId = userResult.rows[0].id

        // Create agent profile
        await client.query(
          `INSERT INTO agents (user_id, candidate_id, polling_station_id, is_primary)
           VALUES ($1, $2, $3, $4)`,
          [userId, agent.candidate_id, agent.polling_station_id, agent.is_primary]
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
        'agents_imported',
        'agent',
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
    console.error('Error importing agents:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

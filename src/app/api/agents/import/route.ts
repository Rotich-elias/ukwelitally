import { NextRequest, NextResponse } from 'next/server'
import { query, transaction } from '@/lib/db'
import { withAuth } from '@/middleware/auth'
import {
  generateSecurePassword,
  hashPassword,
  isPublishedPassword,
  isStrongPassword,
  normalizePhoneNumber,
} from '@/lib/auth'
import { getAssignmentScope, isStationInScope } from '@/lib/agentScope'
import { parseCsv, readCsvHeaders } from '@/lib/locationAdmin'
import {
  resolveWard,
  type ConstituencyRef,
  type CountyRef,
  type WardRef,
} from '@/lib/candidateImportLocation'
import { resolveStation, stationCodeKey, type StationRef } from '@/lib/agentImportStation'

// POST /api/agents/import - Bulk import agents from CSV
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user

    // Only admins and candidates can import agents
    if (user.role !== 'admin' && user.role !== 'candidate') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // A candidate may only import agents for their own team, and only for
    // the polling stations inside their own electoral area. The CSV names a
    // candidate and a station, so both have to be checked rather than trusted.
    let importScope = null
    if (user.role === 'candidate') {
      importScope = await getAssignmentScope(user.userId)
      if (!importScope) {
        return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
      }
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const requestedMode = String(formData.get('mode') || 'update').toLowerCase()
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

    const HINT =
      'CSV must have: full_name, email, phone, id_number, candidate, county, constituency, ward, ' +
      'polling_station, stream, is_primary (optional), password (optional). The polling station can ' +
      'instead be given by polling_station_code and stream. Candidates importing their own agents ' +
      'can leave the candidate column empty.'

    // Parse header
    const header = readCsvHeaders(content)
    const requiredColumns = ['full_name', 'email', 'phone', 'id_number']
    const missingColumns = requiredColumns.filter((col) => !header.includes(col))
    const hasStation = ['polling_station', 'polling_station_code', 'polling_station_id'].some(
      (col) => header.includes(col)
    )
    if (!hasStation) missingColumns.push('polling_station')
    // An administrator imports for any candidate, so the file must say which.
    if (!importScope && !header.includes('candidate') && !header.includes('candidate_id')) {
      missingColumns.push('candidate')
    }

    if (missingColumns.length > 0) {
      return NextResponse.json(
        { error: `Missing required columns: ${missingColumns.join(', ')}`, hint: HINT },
        { status: 400 }
      )
    }

    // Location names are matched against the whole geography, which is small
    // enough to load once. Stations are loaded later, only for the wards and
    // codes the file mentions.
    const [counties, constituencies, wards, teamCandidates] = await Promise.all([
      query<CountyRef>('SELECT id, name FROM counties'),
      query<ConstituencyRef>('SELECT id, name, county_id FROM constituencies'),
      query<WardRef>('SELECT id, name, constituency_id, county_id FROM wards'),
      // Agents work for a candidate's team, i.e. a candidate with a login.
      query<{ id: number; name: string }>(
        `SELECT c.id, COALESCE(NULLIF(u.full_name, ''), c.full_name) AS name
           FROM candidates c
           JOIN users u ON u.id = c.user_id`
      ),
    ])
    const lookup = {
      counties: counties.rows,
      constituencies: constituencies.rows,
      wards: wards.rows,
    }

    // A candidate only matches wards inside their own electoral area.
    const within =
      importScope && !importScope.national
        ? {
            county_id: importScope.county_id,
            constituency_id: importScope.constituency_id,
            ward_id: importScope.ward_id,
          }
        : {}

    const nameKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

    const resolveCandidate = (row: Record<string, string>): { id: number } | { error: string } => {
      const name = row.candidate || row.candidate_name || ''
      const rawId = row.candidate_id || ''

      if (importScope) {
        // A candidate may only import agents for their own team.
        const own = importScope.candidate
        if (!name && !rawId) return { id: own.id }
        if (name && nameKey(name) === nameKey(own.full_name || '')) return { id: own.id }
        if (!name && Number(rawId) === own.id) return { id: own.id }
        return { error: `You can only import agents for your own candidate (${own.full_name})` }
      }

      if (name) {
        const matches = teamCandidates.rows.filter((c) => nameKey(c.name || '') === nameKey(name))
        if (matches.length === 0) return { error: `Candidate '${name}' not found` }
        if (matches.length > 1) {
          return {
            error: `More than one candidate is named '${name}' (ids ${matches
              .map((c) => c.id)
              .join(', ')}); use the candidate_id column for this row`,
          }
        }
        return { id: matches[0].id }
      }

      const id = Number(rawId)
      if (!rawId) return { error: 'Missing candidate' }
      if (!Number.isInteger(id) || id <= 0) return { error: `Invalid candidate_id '${rawId}'` }
      return { id }
    }

    // First pass: validate the row, the candidate and the ward.
    const errors: string[] = []
    const pending: Array<{
      rowNumber: number
      row: Record<string, string>
      candidateId: number
      wardId: number | null
    }> = []

    rows.forEach((row, index) => {
      const rowNumber = index + 2
      if (Object.values(row).every((value) => !value)) return
      const who = row.full_name ? ` (${row.full_name})` : ''

      // Validate required fields
      for (const column of requiredColumns) {
        if (!row[column]) {
          errors.push(`Row ${rowNumber}: Missing ${column}`)
          return
        }
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(row.email)) {
        errors.push(`Row ${rowNumber}: Invalid email format '${row.email}'`)
        return
      }

      // A password in the file must meet the same policy as every other
      // password, and may not be a published example.
      if (row.password) {
        if (isPublishedPassword(row.password)) {
          errors.push(
            `Row ${rowNumber}${who}: The password '${row.password}' is a published example and cannot be used. Leave the column empty to generate one.`
          )
          return
        }
        const strength = isStrongPassword(row.password)
        if (!strength.valid) {
          errors.push(`Row ${rowNumber}${who}: ${strength.errors.join('. ')}`)
          return
        }
      }

      const candidate = resolveCandidate(row)
      if ('error' in candidate) {
        errors.push(`Row ${rowNumber}${who}: ${candidate.error}`)
        return
      }

      // The old polling_station_id column still works and needs no ward.
      const usesStationId =
        !row.polling_station && !row.polling_station_code && Boolean(row.polling_station_id)

      // A row given by code alone may leave the location columns empty.
      const hasLocation = Boolean(row.county || row.constituency || row.ward || row.ward_id)
      let wardId: number | null = null
      if (!usesStationId && (row.polling_station || hasLocation || within.ward_id)) {
        const ward = resolveWard(
          {
            county: row.county || row.county_name,
            constituency: row.constituency || row.constituency_name,
            ward: row.ward || row.ward_name,
            county_id: row.county_id,
            constituency_id: row.constituency_id,
            ward_id: row.ward_id,
          },
          lookup,
          within
        )
        if (!ward.ok) {
          errors.push(`Row ${rowNumber}${who}: ${ward.error}`)
          return
        }
        wardId = ward.ward.id
      }

      pending.push({ rowNumber, row, candidateId: candidate.id, wardId })
    })

    // Second pass: load the stations the file can refer to, then match them.
    const wardIds = [...new Set(pending.map((p) => p.wardId).filter((id): id is number => id !== null))]
    const codes = [
      ...new Set(
        pending.map((p) => p.row.polling_station_code).filter(Boolean).map(stationCodeKey)
      ),
    ]
    const stations =
      wardIds.length || codes.length
        ? (
            await query<StationRef>(
              `SELECT id, name, code, stream, ward_id
                 FROM polling_stations
                WHERE ward_id = ANY($1::int[]) OR upper(trim(code)) = ANY($2::text[])`,
              [wardIds, codes]
            )
          ).rows
        : []

    const agents: any[] = []
    for (const { rowNumber, row, candidateId, wardId } of pending) {
      let pollingStationId: number
      if (!row.polling_station && !row.polling_station_code) {
        pollingStationId = Number(row.polling_station_id)
        if (!Number.isInteger(pollingStationId) || pollingStationId <= 0) {
          errors.push(`Row ${rowNumber} (${row.full_name}): Invalid polling_station_id '${row.polling_station_id}'`)
          continue
        }
      } else {
        const station = resolveStation(
          {
            polling_station: row.polling_station,
            polling_station_code: row.polling_station_code,
            stream: row.stream,
          },
          wardId,
          stations
        )
        if (!station.ok) {
          errors.push(`Row ${rowNumber} (${row.full_name}): ${station.error}`)
          continue
        }
        pollingStationId = station.station.id
      }

      const isPrimary = (row.is_primary || '').toLowerCase()
      agents.push({
        full_name: row.full_name,
        email: row.email.toLowerCase(),
        phone: row.phone,
        id_number: row.id_number,
        candidate_id: candidateId,
        polling_station_id: pollingStationId,
        is_primary: !isPrimary || isPrimary === 'true' || isPrimary === '1' || isPrimary === 'yes', // Default to true
        // A password in the file is honoured. Without one a new account gets
        // the default, and an existing account keeps its current password.
        password: row.password || null,
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
      let updated = 0
      let deleted = 0
      let skipped = 0
      const skippedList: string[] = []
      const credentials: Array<{ full_name: string; email: string; phone: string; password: string }> = []
      const replaces = mode === 'replace'

      // Replace mode clears the agent assignments of the candidates in the
      // file. The user accounts are not deleted: an account that appears in
      // the new file is re-used, while one that does not simply loses its
      // assignment. Submissions and other records the account owns are kept.
      if (replaces) {
        const candidateIds = [...new Set(agents.map((agent) => agent.candidate_id))]
        const removed = await client.query(
          'DELETE FROM agents WHERE candidate_id = ANY($1::int[])',
          [candidateIds]
        )
        deleted = removed.rowCount ?? 0
      }

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

        // Verify the station is inside the candidate's own scope. The check
        // runs here as well, so a hand edited CSV cannot move an agent into
        // another candidate's area.
        if (importScope) {
          const inScope = await isStationInScope(importScope, agent.polling_station_id)
          if (!inScope) {
            skipped++
            skippedList.push(
              `${agent.full_name} - Polling Station ID ${agent.polling_station_id} is outside your electoral area`
            )
            continue
          }
        }

        // A user is matched by any of the three identifiers the CSV carries.
        const existingUser = await client.query(
          `SELECT id, role FROM users
            WHERE email = $1 OR phone = $2 OR id_number = $3
            ORDER BY id
            LIMIT 1`,
          [agent.email, normalizedPhone, agent.id_number]
        )

        if (existingUser.rows.length > 0) {
          const existing = existingUser.rows[0]

          // Never turn an administrator, candidate or observer into an agent
          // through an import.
          if (existing.role !== 'agent') {
            skipped++
            skippedList.push(
              `${agent.full_name} (${agent.email}) - Existing account is a ${existing.role}, not an agent`
            )
            continue
          }

          const profile = await client.query(
            'SELECT id, candidate_id FROM agents WHERE user_id = $1',
            [existing.id]
          )

          if (profile.rows.length > 0 && profile.rows[0].candidate_id !== agent.candidate_id) {
            skipped++
            skippedList.push(
              `${agent.full_name} (${agent.email}) - Already assigned to another candidate`
            )
            continue
          }

          // Keep the current password unless the file supplies a new one.
          if (agent.password) {
            const passwordHash = await hashPassword(agent.password)
            await client.query(
              `UPDATE users
                  SET full_name = $2, phone = $3, id_number = $4,
                      role = 'agent', verified = true, active = true,
                      password_hash = $5, token_version = token_version + 1
                WHERE id = $1`,
              [existing.id, agent.full_name, normalizedPhone, agent.id_number, passwordHash]
            )
          } else {
            await client.query(
              `UPDATE users
                  SET full_name = $2, phone = $3, id_number = $4,
                      role = 'agent', verified = true, active = true,
                      token_version = token_version + 1
                WHERE id = $1`,
              [existing.id, agent.full_name, normalizedPhone, agent.id_number]
            )
          }

          if (profile.rows.length > 0) {
            await client.query(
              `UPDATE agents
                  SET polling_station_id = $2, is_primary = $3
                WHERE id = $1`,
              [profile.rows[0].id, agent.polling_station_id, agent.is_primary]
            )
          } else {
            await client.query(
              `INSERT INTO agents (user_id, candidate_id, polling_station_id, is_primary)
               VALUES ($1, $2, $3, $4)`,
              [existing.id, agent.candidate_id, agent.polling_station_id, agent.is_primary]
            )
          }

          updated++
          continue
        }

        // New account. A file without a password gets a random one, returned
        // once in the response so it can be shared with the agent. It is never
        // stored in plain text. (A shared default password let anyone who
        // knew an agent's email sign in as them.)
        const password = agent.password || generateSecurePassword()
        if (!agent.password) {
          credentials.push({ full_name: agent.full_name, email: agent.email, phone: normalizedPhone, password })
        }
        const passwordHash = await hashPassword(password)

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

      return { imported, updated, deleted, skipped, skippedList, credentials }
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
        JSON.stringify({
          mode,
          imported: result.imported,
          updated: result.updated,
          deleted: result.deleted,
          skipped: result.skipped,
        }),
      ]
    )

    return NextResponse.json({
      message: 'Import completed',
      mode,
      imported: result.imported,
      updated: result.updated,
      deleted: result.deleted,
      skipped: result.skipped,
      skippedList: result.skippedList,
      // Generated passwords, shown once. Not written to the audit log.
      credentials: result.credentials,
      errors: errors.length > 0 ? errors : null,
    })
  } catch (error) {
    console.error('Error importing agents:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handlePost as any)

import { NextRequest, NextResponse } from 'next/server'
import { queryOne, queryMany, transaction } from '@/lib/db'
import { withRole } from '@/middleware/auth'
import { generateSecurePassword, hashPassword } from '@/lib/auth'

// GET /api/admin/volunteers - List volunteer registrations with filtering
async function handleGet(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'all'

    // Never expose the password hash through the admin listing. The boolean
    // tells the UI whether the volunteer can sign in with their own password.
    let sql = `
      SELECT 
        vr.id, vr.full_name, vr.email, vr.phone, vr.id_number,
        vr.county_id, vr.constituency_id, vr.ward_id, vr.polling_station_id,
        vr.status, vr.notes, vr.assigned_candidate_id, vr.assigned_agent_id,
        vr.assigned_at, vr.created_at, vr.updated_at, vr.password_set_at,
        (vr.password_hash IS NOT NULL) as password_set,
        co.name as county_name,
        c.name as constituency_name,
        w.name as ward_name,
        ps.name as polling_station_name,
        ps.code as polling_station_code,
        ca.full_name as assigned_candidate_name
      FROM volunteer_registrations vr
      LEFT JOIN counties co ON vr.county_id = co.id
      LEFT JOIN constituencies c ON vr.constituency_id = c.id
      LEFT JOIN wards w ON vr.ward_id = w.id
      LEFT JOIN polling_stations ps ON vr.polling_station_id = ps.id
      LEFT JOIN candidates ca ON vr.assigned_candidate_id = ca.id
    `

    let params: any[] = []

    if (status !== 'all') {
      sql += ' WHERE vr.status = $1'
      params.push(status)
    }

    sql += ' ORDER BY vr.created_at DESC'

    const volunteers = await queryMany(sql, params)

    return NextResponse.json({ volunteers })
  } catch (error) {
    console.error('Error fetching volunteers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/volunteers/assign - Assign volunteer to candidate and create agent account
async function handlePost(req: NextRequest) {
  try {
    const user = (req as any).user
    const body = await req.json()
    const { volunteer_id, candidate_id, polling_station_id, notes } = body

    if (!volunteer_id || !candidate_id) {
      return NextResponse.json(
        { error: 'volunteer_id and candidate_id are required' },
        { status: 400 }
      )
    }

    // Get volunteer details
    const volunteer = await queryOne(
      `SELECT * FROM volunteer_registrations WHERE id = $1`,
      [volunteer_id]
    )

    if (!volunteer) {
      return NextResponse.json(
        { error: 'Volunteer not found' },
        { status: 404 }
      )
    }

    if (volunteer.status !== 'approved') {
      return NextResponse.json(
        { error: 'Volunteer must be approved before assignment' },
        { status: 400 }
      )
    }

    // Check if volunteer already assigned
    if (volunteer.assigned_candidate_id) {
      return NextResponse.json(
        { error: 'Volunteer already assigned to a candidate' },
        { status: 409 }
      )
    }

    // Get candidate details
    const candidate = await queryOne(
      `SELECT c.*, u.full_name 
       FROM candidates c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.id = $1`,
      [candidate_id]
    )

    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      )
    }

    // Check if email already exists in users
    const existingUser = await queryOne(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [volunteer.email, volunteer.phone]
    )

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email or phone already exists' },
        { status: 409 }
      )
    }

    // Enforce agent limits inside this candidate's own team: max 1 primary
    // and max 2 backups per polling station. Other teams at the station are
    // counted separately.
    const targetStationId = polling_station_id || volunteer.polling_station_id
    if (targetStationId) {
      const primaryCount = await queryOne(
        `SELECT COUNT(*)::int AS cnt FROM agents
          WHERE candidate_id = $1 AND polling_station_id = $2 AND is_primary = TRUE`,
        [candidate_id, targetStationId]
      )
      if (parseInt(primaryCount?.cnt) >= 1) {
        return NextResponse.json(
          { error: 'This candidate already has a primary agent at this polling station. Assign this volunteer as a backup agent.' },
          { status: 409 }
        )
      }
    }

    // Reuse the password the volunteer chose at registration. Only a
    // registration without one needs a generated password, which is shown to
    // the administrator once.
    // The generated password is random; the old 'Pass' + 4 digits had only
    // 9,000 possibilities.
    const password = volunteer.password_hash ? null : generateSecurePassword()
    const hashedPassword = volunteer.password_hash || (await hashPassword(password!))

    // Every statement runs on the same connection inside one transaction.
    // query('BEGIN') through the pool could put BEGIN, the inserts and
    // COMMIT on different connections, leaving a pooled connection inside an
    // open transaction and the assignment half-applied.
    const { newUser, agent } = await transaction(async (client) => {
      // Create user account for volunteer
      const newUser = (await client.query<{ id: number }>(
        `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          volunteer.email,
          volunteer.phone,
          hashedPassword,
          volunteer.full_name,
          'agent',
          volunteer.id_number,
          true,
          true
        ]
      )).rows[0]

      // Create agent record
      const agent = (await client.query<{ id: number }>(
        `INSERT INTO agents (user_id, candidate_id, polling_station_id, is_primary)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          newUser.id,
          candidate_id,
          polling_station_id || volunteer.polling_station_id,
          true
        ]
      )).rows[0]

      // Update volunteer registration with assignment info
      await client.query(
        `UPDATE volunteer_registrations 
         SET status = 'assigned', 
             assigned_candidate_id = $1,
             assigned_agent_id = $2,
             assigned_at = CURRENT_TIMESTAMP,
             notes = COALESCE(notes || ' ', '') || $3
         WHERE id = $4`,
        [
          candidate_id,
          agent.id,
          `Assigned to ${candidate.full_name} on ${new Date().toLocaleDateString()}. ${notes || ''}`,
          volunteer_id
        ]
      )

      // Log the assignment
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          user.userId,
          'volunteer_assigned',
          'volunteer_registration',
          volunteer_id,
          JSON.stringify({
            volunteer_id,
            candidate_id,
            polling_station_id,
            agent_id: agent.id,
            user_id: newUser.id
          }),
        ]
      )

      return { newUser, agent }
    })

    return NextResponse.json({
      message: 'Volunteer assigned successfully',
      agent: {
        id: agent.id,
        user_id: newUser.id,
        candidate_name: candidate.full_name
      },
      credentials: {
        email: volunteer.email,
        ...(password ? { password } : {}),
        password_source: volunteer.password_hash ? 'self_service' : 'generated',
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Error assigning volunteer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRole(['admin'], handleGet as any)
export const POST = withRole(['admin'], handlePost as any)
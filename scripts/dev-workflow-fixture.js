/**
 * Local development fixture for the submission window / fallback workflow.
 *
 * Creates a candidate, an agent and an observer on one polling station so the
 * workflow can be exercised end to end against the local database.
 */
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')
const fs = require('fs')

function loadDotEnv() {
  const envPath = __dirname + '/../.env'
  if (!fs.existsSync(envPath)) return
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}
loadDotEnv()

const PASSWORD = 'TestPass123!'

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  try {
    await client.query('BEGIN')

    // Pick a station that has a constituency, and use it for the fixture.
    const station = await client.query(
      `SELECT ps.id, ps.name, ps.code, ps.constituency_id, ps.county_id, ps.ward_id, ps.registered_voters
         FROM polling_stations ps
        WHERE ps.constituency_id IS NOT NULL
        ORDER BY ps.id
        LIMIT 1`
    )
    if (station.rows.length === 0) throw new Error('No polling station available')
    const ps = station.rows[0]

    const constituency = await client.query(
      'SELECT id, name, county_id FROM constituencies WHERE id = $1',
      [ps.constituency_id]
    )
    const county = await client.query('SELECT id, name FROM counties WHERE id = $1', [
      ps.county_id,
    ])

    // Clean up any previous fixture.
    await client.query(
      `DELETE FROM submissions
        WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2, $3))`,
      ['wf-candidate@test.local', 'wf-agent@test.local', 'wf-observer@test.local']
    )
    await client.query(
      `DELETE FROM users WHERE email IN ($1, $2, $3, $4)`,
      [
        'wf-candidate@test.local',
        'wf-agent@test.local',
        'wf-observer@test.local',
        'wf-admin@test.local',
      ]
    )

    const candidateUser = await client.query(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
       VALUES ('wf-candidate@test.local', '+254710000001', $1, 'Workflow Candidate', 'candidate', '9000001', true, true)
       RETURNING id`,
      [passwordHash]
    )

    const candidate = await client.query(
      `INSERT INTO candidates (user_id, party_name, position, constituency_id, county_id, is_system_user, access_status)
       VALUES ($1, 'Test Party', 'mp', $2, $3, true, 'active')
       RETURNING id`,
      [candidateUser.rows[0].id, ps.constituency_id, ps.county_id]
    )

    const agentUser = await client.query(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
       VALUES ('wf-agent@test.local', '+254710000002', $1, 'Workflow Agent', 'agent', '9000002', true, true)
       RETURNING id`,
      [passwordHash]
    )
    await client.query(
      `INSERT INTO agents (user_id, candidate_id, polling_station_id, is_primary)
       VALUES ($1, $2, $3, true)`,
      [agentUser.rows[0].id, candidate.rows[0].id, ps.id]
    )

    const observerUser = await client.query(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
       VALUES ('wf-observer@test.local', '+254710000003', $1, 'Workflow Observer', 'observer', '9000003', true, true)
       RETURNING id`,
      [passwordHash]
    )
    await client.query(
      `INSERT INTO observer_assignments (user_id, polling_station_id, assignment_type, status)
       VALUES ($1, $2, 'presidential', 'active')`,
      [observerUser.rows[0].id, ps.id]
    )

    // An administrator, so the review workflow can be exercised.
    await client.query(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
       VALUES ('wf-admin@test.local', '+254710000004', $1, 'Workflow Admin', 'admin', '9000004', true, true)`,
      [passwordHash]
    )

    await client.query('COMMIT')

    console.log(
      JSON.stringify(
        {
          password: PASSWORD,
          candidate_user_id: candidateUser.rows[0].id,
          candidate_id: candidate.rows[0].id,
          agent_user_id: agentUser.rows[0].id,
          observer_user_id: observerUser.rows[0].id,
          polling_station_id: ps.id,
          polling_station_name: ps.name,
          constituency_id: ps.constituency_id,
          constituency_name: constituency.rows[0].name,
          county_id: ps.county_id,
          county_name: county.rows[0].name,
          registered_voters: ps.registered_voters,
        },
        null,
        2
      )
    )
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Fixture failed:', error.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()

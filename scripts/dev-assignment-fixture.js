#!/usr/bin/env node
/**
 * Local development fixture for the agent assignment scope and the image
 * upload flow.
 *
 * Creates one candidate per race (member of county assembly, member of
 * parliament, county level race and president) so the scope rules can be
 * exercised against the local database.
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}
loadDotEnv()

const PASSWORD = 'TestPass123!'
const EMAILS = {
  mca: 'scope-mca@test.local',
  mp: 'scope-mp@test.local',
  governor: 'scope-governor@test.local',
  president: 'scope-president@test.local',
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  try {
    await client.query('BEGIN')

    await client.query(
      `DELETE FROM users WHERE email = ANY($1::text[])`,
      [Object.values(EMAILS)]
    )

    // A ward with a constituency, a county and polling stations.
    const ward = await client.query(
      `SELECT w.id, w.name, w.constituency_id, c.county_id
         FROM wards w
         JOIN constituencies c ON c.id = w.constituency_id
        WHERE w.id IS NOT NULL
        ORDER BY w.id
        LIMIT 1`
    )
    if (ward.rows.length === 0) throw new Error('No ward available')
    const w = ward.rows[0]

    // Another ward in a different constituency, for the out of scope check.
    const otherWard = await client.query(
      `SELECT w.id, w.constituency_id, c.county_id
         FROM wards w
         JOIN constituencies c ON c.id = w.constituency_id
        WHERE w.constituency_id <> $1
        ORDER BY w.id
        LIMIT 1`,
      [w.constituency_id]
    )

    const inScopeStation = await client.query(
      'SELECT id, name, code FROM polling_stations WHERE ward_id = $1 ORDER BY id LIMIT 1',
      [w.id]
    )
    const outOfScopeStation = otherWard.rows.length
      ? await client.query(
          'SELECT id, name, code FROM polling_stations WHERE ward_id = $1 ORDER BY id LIMIT 1',
          [otherWard.rows[0].id]
        )
      : { rows: [] }

    const created = {}

    async function createCandidate(key, position, location) {
      const user = await client.query(
        `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
         VALUES ($1, $2, $3, $4, 'candidate', $5, true, true)
         RETURNING id`,
        [EMAILS[key], `+25472${Object.keys(EMAILS).indexOf(key)}00001`, passwordHash, `Scope ${key}`, `95${Object.keys(EMAILS).indexOf(key)}001`]
      )

      const candidate = await client.query(
        `INSERT INTO candidates (user_id, party_name, position, county_id, constituency_id, ward_id, is_system_user, access_status)
         VALUES ($1, 'Scope Party', $2, $3, $4, $5, true, 'active')
         RETURNING id`,
        [user.rows[0].id, position, location.county_id, location.constituency_id, location.ward_id]
      )

      created[key] = {
        user_id: user.rows[0].id,
        candidate_id: candidate.rows[0].id,
        email: EMAILS[key],
      }
    }

    await createCandidate('mca', 'mca', {
      county_id: w.county_id,
      constituency_id: w.constituency_id,
      ward_id: w.id,
    })
    await createCandidate('mp', 'mp', {
      county_id: w.county_id,
      constituency_id: w.constituency_id,
      ward_id: null,
    })
    await createCandidate('governor', 'governor', {
      county_id: w.county_id,
      constituency_id: null,
      ward_id: null,
    })
    await createCandidate('president', 'president', {
      county_id: null,
      constituency_id: null,
      ward_id: null,
    })

    await client.query('COMMIT')

    console.log(
      JSON.stringify(
        {
          password: PASSWORD,
          ward_id: w.id,
          ward_name: w.name,
          constituency_id: w.constituency_id,
          county_id: w.county_id,
          in_scope_station: inScopeStation.rows[0] || null,
          out_of_scope_station: outOfScopeStation.rows[0] || null,
          candidates: created,
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

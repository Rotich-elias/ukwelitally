#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { Pool } = require('pg')

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const contents = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of contents.split('\n')) {
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

const DEMO_TAG = 'DEMO-SEED-PRESIDENTIAL'
const DEMO_EMAIL = 'demo-seed-presidential@ukwelitally.local'
const DEMO_IDNUM = '999999999'
const DEMO_PHONE = '+254700000999'
const DEMO_CAND_NAME = 'DEMO PRES — Sample Presidential Candidate'
const DEMO_CAND_PARTY = 'Sample Party (Illustration)'

function getArg(name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return null
  return process.argv[idx + 1]
}
function hasFlag(name) {
  return process.argv.includes(name)
}

function main() {
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
  if (!connectionString) {
    console.error('No DATABASE_URL/DATABASE_URL_DIRECT set')
    process.exit(1)
  }

  const wipeOnly = hasFlag('--wipe')
  const replace = hasFlag('--replace')
  const confirm = hasFlag('--confirm')
  const dryRun = !confirm
  const countyFilter = getArg('--county')
  const maxStations = getArg('--max-stations') ? parseInt(getArg('--max-stations')) : null

  const pool = new Pool({ connectionString })

  ;(async () => {
    const client = await pool.connect()
    try {
      if (wipeOnly) {
        console.log('Wiping demo presidential data (', DEMO_TAG, ')...')
        await client.query('BEGIN')
        await client.query(`DELETE FROM candidate_votes WHERE result_id IN (SELECT r.id FROM results r JOIN submissions s ON s.id=r.submission_id WHERE s.device_id=$1)`, [DEMO_TAG])
        await client.query(`DELETE FROM selected_results WHERE submission_id IN (SELECT id FROM submissions WHERE device_id=$1)`, [DEMO_TAG])
        await client.query(`DELETE FROM results WHERE submission_id IN (SELECT id FROM submissions WHERE device_id=$1)`, [DEMO_TAG])
        await client.query(`DELETE FROM submissions WHERE device_id=$1`, [DEMO_TAG])
        await client.query(`DELETE FROM candidates WHERE full_name=$1`, [DEMO_CAND_NAME])
        await client.query(`DELETE FROM users WHERE email=$1`, [DEMO_EMAIL])
        await client.query('COMMIT')
        console.log('Done.')
        return
      }

      const existing = await client.query(`SELECT COUNT(*)::int c FROM submissions WHERE device_id=$1`, [DEMO_TAG])
      if (existing.rows[0].c > 0 && !replace) {
        console.log(`Found ${existing.rows[0].c} existing demo submissions with ${DEMO_TAG}. Use --replace to wipe and reseed, or --wipe to remove.`)
        return
      }

      if (existing.rows[0].c > 0 && replace) {
        console.log('Replacing: wiping existing demo data...')
        await client.query('BEGIN')
        await client.query(`DELETE FROM candidate_votes WHERE result_id IN (SELECT r.id FROM results r JOIN submissions s ON s.id=r.submission_id WHERE s.device_id=$1)`, [DEMO_TAG])
        await client.query(`DELETE FROM selected_results WHERE submission_id IN (SELECT id FROM submissions WHERE device_id=$1)`, [DEMO_TAG])
        await client.query(`DELETE FROM results WHERE submission_id IN (SELECT id FROM submissions WHERE device_id=$1)`, [DEMO_TAG])
        await client.query(`DELETE FROM submissions WHERE device_id=$1`, [DEMO_TAG])
        await client.query(`DELETE FROM candidates WHERE full_name=$1`, [DEMO_CAND_NAME])
        await client.query(`DELETE FROM users WHERE email=$1`, [DEMO_EMAIL])
        await client.query('COMMIT')
      }

      let stationsSql = `
        SELECT ps.id, ps.name, ps.registered_voters, ps.latitude, ps.longitude, ps.code,
               w.name as ward_name, c.name as constituency_name, co.name as county_name, co.id as county_id
        FROM polling_stations ps
        JOIN wards w ON w.id=ps.ward_id
        JOIN constituencies c ON c.id=w.constituency_id
        JOIN counties co ON co.id=c.county_id
        WHERE 1=1
      `
      const params = []
      if (countyFilter) {
        params.push(countyFilter)
        stationsSql += ` AND LOWER(co.name)=LOWER($${params.length})`
      }
      stationsSql += ` ORDER BY ps.id`
      if (maxStations) {
        stationsSql += ` LIMIT ${parseInt(maxStations)}`
      }

      const stationsRes = await client.query(stationsSql, params)
      const stations = stationsRes.rows
      console.log(`Stations to seed: ${stations.length}${countyFilter? ' (county='+countyFilter+')':''}`)

      if (stations.length === 0) {
        console.log('No stations found.')
        return
      }

      const pwd = crypto.randomBytes(16).toString('hex')
      const hash = bcrypt.hashSync(pwd, 10)

      if (dryRun) {
        console.log('[DRY RUN] Would create demo user', DEMO_EMAIL, '(role agent, active=false)')
        console.log('[DRY RUN] Would create demo candidate', DEMO_CAND_NAME, '(position president, is_placeholder=true)')
        console.log('[DRY RUN] Would create submissions/results/candidate_votes/selected_results for', stations.length, 'stations')
        console.log('[DRY RUN] Candidates (votes): Demo Candidate Alpha (Alpha Alliance), Demo Candidate Bravo (Bravo Coalition), Demo Candidate Charlie (Charlie Movement), Demo Candidate Delta (Delta Party)')
        console.log('[DRY RUN] Use --confirm to write. Use --wipe to remove demo data.')
        return
      }

      await client.query('BEGIN')
      const userRes = await client.query(
        `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
         VALUES ($1,$2,$3,$4,'agent',$5,false,false)
         ON CONFLICT (email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`,
        [DEMO_EMAIL, DEMO_PHONE, hash, 'DEMO SEED (Illustration)', DEMO_IDNUM]
      )
      const demoUserId = userRes.rows[0].id

      const candRes = await client.query(
        `INSERT INTO candidates (user_id, position, party_name, full_name, is_placeholder, county_id, constituency_id, ward_id, access_status)
         VALUES (NULL,'president',$1,$2,true,NULL,NULL,NULL,'active')
         ON CONFLICT DO NOTHING RETURNING id`,
        [DEMO_CAND_PARTY, DEMO_CAND_NAME]
      )
      let demoCandId
      if (candRes.rows.length > 0) {
        demoCandId = candRes.rows[0].id
      } else {
        const c2 = await client.query(`SELECT id FROM candidates WHERE full_name=$1`, [DEMO_CAND_NAME])
        demoCandId = c2.rows[0].id
      }

      const demoVoteCandidates = [
        { name: 'Demo Candidate Alpha', party: 'Alpha Alliance' },
        { name: 'Demo Candidate Bravo', party: 'Bravo Coalition' },
        { name: 'Demo Candidate Charlie', party: 'Charlie Movement' },
        { name: 'Demo Candidate Delta', party: 'Delta Party' },
      ]
      const baseShares = [0.42, 0.31, 0.18, 0.09]

      let totalSub = 0, totalVotes = 0
      for (const st of stations) {
        const reg = parseInt(st.registered_voters) || 0
        if (reg <= 0) continue
        const seed = crypto.createHash('sha256').update(DEMO_TAG + ':' + st.id).digest()
        const r = seed[0] / 255
        const r2 = seed[1] / 255
        const turnout = Math.min(0.95, Math.max(0.4, 0.55 + r * 0.25))
        let totalCast = Math.round(reg * turnout)
        if (totalCast < 1) totalCast = 1
        let rejected = Math.max(0, Math.round(totalCast * (0.005 + r2 * 0.015)))
        if (rejected >= totalCast) rejected = Math.max(0, totalCast - 1)
        let valid = totalCast - rejected
        if (valid < 1) valid = 1

        let shares = baseShares.map((s, i) => {
          const jr = (seed[2 + i] - 128) / 128
          let ns = s + jr * 0.04
          if (ns < 0.01) ns = 0.01
          return ns
        })
        const sumS = shares.reduce((a,b)=>a+b,0)
        shares = shares.map(s => s / sumS)
        let votesArr = shares.map(s => Math.floor(valid * s))
        let rem = valid - votesArr.reduce((a,b)=>a+b,0)
        const order = shares.map((s,i)=>({i,s})).sort((a,b)=>b.s-a.s)
        let k = 0
        while (rem > 0) {
          votesArr[order[k % order.length].i]++
          rem--
          k++
        }

        const lat = st.latitude != null ? parseFloat(st.latitude) : null
        const lng = st.longitude != null ? parseFloat(st.longitude) : null
        const subRes = await client.query(
          `INSERT INTO submissions (polling_station_id, user_id, candidate_id, submission_type, status, submitted_lat, submitted_lng, location_verified, submitted_at, verified_at, device_id, device_type, confidence_score, has_discrepancy, submission_origin, review_status, revision_number)
           VALUES ($1,$2,$3,'primary','verified',$4,$5,true,NOW(),NOW(),$6,'web',85,false,'agent',NULL,1)
           ON CONFLICT DO NOTHING RETURNING id`,
          [st.id, demoUserId, demoCandId, lat, lng, DEMO_TAG]
        )
        let subId
        if (subRes.rows.length > 0) {
          subId = subRes.rows[0].id
        } else {
          const s2 = await client.query(`SELECT id FROM submissions WHERE device_id=$1 AND polling_station_id=$2 ORDER BY id DESC LIMIT 1`, [DEMO_TAG, st.id])
          subId = s2.rows[0].id
        }

        const resRes = await client.query(
          `INSERT INTO results (submission_id, polling_station_id, position, registered_voters, total_votes_cast, valid_votes, rejected_votes, is_valid, manually_verified)
           VALUES ($1,$2,'president',$3,$4,$5,$6,true,false)
           ON CONFLICT (submission_id, position) DO UPDATE SET registered_voters=EXCLUDED.registered_voters, total_votes_cast=EXCLUDED.total_votes_cast, valid_votes=EXCLUDED.valid_votes, rejected_votes=EXCLUDED.rejected_votes RETURNING id`,
          [subId, st.id, reg, totalCast, valid, rejected]
        )
        const resId = resRes.rows[0].id

        await client.query(`DELETE FROM candidate_votes WHERE result_id=$1`, [resId])
        for (let i=0; i<demoVoteCandidates.length; i++) {
          await client.query(
            `INSERT INTO candidate_votes (result_id, candidate_name, party_name, votes) VALUES ($1,$2,$3,$4)`,
            [resId, demoVoteCandidates[i].name, demoVoteCandidates[i].party, votesArr[i]]
          )
        }

        await client.query(
          `INSERT INTO selected_results (polling_station_id, position, submission_id, source)
           VALUES ($1,'president',$2,'agent_primary')
           ON CONFLICT (polling_station_id, position) DO UPDATE SET submission_id=EXCLUDED.submission_id, source=EXCLUDED.source`,
          [st.id, subId]
        )

        totalSub++
        totalVotes += valid
      }

      await client.query('COMMIT')
      console.log(`Seeded ${totalSub} stations. Total valid votes ~${totalVotes}. Demo user: ${DEMO_EMAIL} (active=false), demo candidate: ${DEMO_CAND_NAME} (president, is_placeholder=true).`)
      console.log('Candidates on results: Demo Candidate Alpha/Bravo/Charlie/Delta with Sample Parties. Marker:', DEMO_TAG)
      console.log('To remove: node scripts/seed-demo-presidential.js --wipe')
    } catch (e) {
      await client.query('ROLLBACK').catch(()=>{})
      console.error('Error:', e.message)
      throw e
    } finally {
      client.release()
      await pool.end()
    }
  })()
}

main()

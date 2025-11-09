#!/usr/bin/env node

/**
 * Create test candidates with known passwords for testing dashboard
 */

const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
})

async function createTestCandidates() {
  console.log('\n👤 Creating Test Candidates...\n')

  try {
    const password = 'Test123!' // Common password for all test candidates
    const passwordHash = await bcrypt.hash(password, 10)

    // Get a county
    const countyResult = await pool.query("SELECT id FROM counties WHERE code = '001' LIMIT 1")
    const countyId = countyResult.rows[0]?.id

    // Get a constituency in that county
    const constResult = await pool.query(
      'SELECT id FROM constituencies WHERE county_id = $1 LIMIT 1',
      [countyId]
    )
    const constituencyId = constResult.rows[0]?.id

    // Get a ward in that constituency
    const wardResult = await pool.query(
      'SELECT id FROM wards WHERE constituency_id = $1 LIMIT 1',
      [constituencyId]
    )
    const wardId = wardResult.rows[0]?.id

    const candidates = [
      {
        email: 'test.governor@ukwelitally.com',
        phone: '+254700111001',
        full_name: 'Test Governor',
        id_number: '99111111',
        position: 'governor',
        party_name: 'Test Party',
        county_id: countyId,
        constituency_id: null,
        ward_id: null,
      },
      {
        email: 'test.senator@ukwelitally.com',
        phone: '+254700111002',
        full_name: 'Test Senator',
        id_number: '99111112',
        position: 'senator',
        party_name: 'Test Party',
        county_id: countyId,
        constituency_id: null,
        ward_id: null,
      },
      {
        email: 'test.womenrep@ukwelitally.com',
        phone: '+254700111003',
        full_name: 'Test Women Rep',
        id_number: '99111113',
        position: 'women_rep',
        party_name: 'Test Party',
        county_id: countyId,
        constituency_id: null,
        ward_id: null,
      },
      {
        email: 'test.mp@ukwelitally.com',
        phone: '+254700111004',
        full_name: 'Test MP',
        id_number: '99111114',
        position: 'mp',
        party_name: 'Test Party',
        county_id: null,
        constituency_id: constituencyId,
        ward_id: null,
      },
      {
        email: 'test.mca@ukwelitally.com',
        phone: '+254700111005',
        full_name: 'Test MCA',
        id_number: '99111115',
        position: 'mca',
        party_name: 'Test Party',
        county_id: null,
        constituency_id: null,
        ward_id: wardId,
      },
    ]

    for (const cand of candidates) {
      // Check if user exists
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [cand.email])

      if (existing.rows.length > 0) {
        console.log(`   ⚠️  ${cand.email} already exists, skipping...`)
        continue
      }

      // Create user
      const userResult = await pool.query(
        `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
         VALUES ($1, $2, $3, $4, 'candidate', $5, true, true)
         RETURNING id`,
        [cand.email, cand.phone, passwordHash, cand.full_name, cand.id_number]
      )

      const userId = userResult.rows[0].id

      // Create candidate profile
      await pool.query(
        `INSERT INTO candidates (user_id, position, party_name, county_id, constituency_id, ward_id, is_system_user)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [userId, cand.position, cand.party_name, cand.county_id, cand.constituency_id, cand.ward_id]
      )

      console.log(`   ✓ ${cand.full_name} (${cand.position})`)
    }

    console.log(`\n✅ Test candidates created!`)
    console.log(`\n📧 Login credentials:`)
    console.log(`   Email: test.governor@ukwelitally.com`)
    console.log(`   Email: test.senator@ukwelitally.com`)
    console.log(`   Email: test.womenrep@ukwelitally.com`)
    console.log(`   Email: test.mp@ukwelitally.com`)
    console.log(`   Email: test.mca@ukwelitally.com`)
    console.log(`   Password: ${password} (all users)`)

  } catch (error) {
    console.error('❌ Error creating test candidates:', error)
    throw error
  } finally {
    await pool.end()
  }
}

createTestCandidates()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

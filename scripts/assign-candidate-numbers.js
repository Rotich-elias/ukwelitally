#!/usr/bin/env node

/**
 * Assign unique candidate numbers to existing ballot candidates
 */

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
})

async function assignCandidateNumbers() {
  console.log('\n🔢 Assigning Candidate Numbers...\n')

  try {
    const year = new Date().getFullYear()
    const prefix = `CAND-${year}-`

    // Get all ballot candidates without a candidate number
    const result = await pool.query(
      'SELECT id, full_name FROM candidates WHERE is_system_user = false AND candidate_number IS NULL ORDER BY id'
    )

    if (result.rows.length === 0) {
      console.log('✅ All candidates already have numbers assigned!')
      return
    }

    console.log(`📋 Found ${result.rows.length} candidates without numbers\n`)

    let nextNumber = 1

    for (const candidate of result.rows) {
      const candidateNumber = `${prefix}${String(nextNumber).padStart(5, '0')}`

      await pool.query(
        'UPDATE candidates SET candidate_number = $1 WHERE id = $2',
        [candidateNumber, candidate.id]
      )

      console.log(`   ✓ ${candidateNumber} → ${candidate.full_name}`)
      nextNumber++
    }

    console.log(`\n✅ Assigned ${result.rows.length} candidate numbers!`)

  } catch (error) {
    console.error('❌ Error assigning candidate numbers:', error)
    throw error
  } finally {
    await pool.end()
  }
}

assignCandidateNumbers()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

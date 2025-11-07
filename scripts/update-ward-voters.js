const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
})

async function updateWardVoters() {
  console.log('📊 Updating Ward Registered Voters...\n')

  try {
    // Get all wards with their constituency data
    const result = await pool.query(`
      SELECT
        w.id,
        w.name,
        w.constituency_id,
        c.name as constituency_name,
        c.registered_voters as constituency_voters,
        co.name as county_name
      FROM wards w
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
      ORDER BY co.name, c.name, w.name
    `)

    console.log(`Found ${result.rows.length} wards to update...\n`)

    let updated = 0
    const batchSize = 100
    let currentBatch = []

    for (const ward of result.rows) {
      // Calculate ward voters based on constituency
      // Get number of wards in this constituency
      const countResult = await pool.query(
        'SELECT COUNT(*) as count FROM wards WHERE constituency_id = $1',
        [ward.constituency_id]
      )

      const wardsInConstituency = parseInt(countResult.rows[0].count)
      const constituencyVoters = ward.constituency_voters || 100000

      // Divide constituency voters among wards with variation (±25%)
      const baseVoters = Math.floor(constituencyVoters / wardsInConstituency)
      const variation = Math.floor(baseVoters * 0.25)
      let wardVoters = baseVoters + Math.floor(Math.random() * variation * 2 - variation)

      // Ensure minimum of 5,000 voters per ward
      wardVoters = Math.max(5000, wardVoters)

      // Update the ward
      currentBatch.push({
        id: ward.id,
        voters: wardVoters,
        name: ward.name,
        constituency: ward.constituency_name,
        county: ward.county_name
      })

      if (currentBatch.length >= batchSize) {
        // Process batch
        for (const item of currentBatch) {
          await pool.query(
            'UPDATE wards SET registered_voters = $1 WHERE id = $2',
            [item.voters, item.id]
          )
        }

        console.log(`✓ Updated ${updated + currentBatch.length} wards...`)
        updated += currentBatch.length
        currentBatch = []
      }
    }

    // Process remaining batch
    if (currentBatch.length > 0) {
      for (const item of currentBatch) {
        await pool.query(
          'UPDATE wards SET registered_voters = $1 WHERE id = $2',
          [item.voters, item.id]
        )
      }
      updated += currentBatch.length
      console.log(`✓ Updated ${updated} wards (final batch)`)
    }

    console.log(`\n✅ Updated ${updated} wards with voter registration data!\n`)

    // Show summary statistics
    console.log('📈 Summary Statistics:\n')

    // Overall stats
    const overallStats = await pool.query(`
      SELECT
        COUNT(*) as total_wards,
        SUM(registered_voters) as total_voters,
        AVG(registered_voters)::integer as avg_voters,
        MIN(registered_voters) as min_voters,
        MAX(registered_voters) as max_voters
      FROM wards
    `)

    const stats = overallStats.rows[0]
    console.log('Overall:')
    console.log(`   Total Wards: ${stats.total_wards}`)
    console.log(`   Total Voters: ${parseInt(stats.total_voters).toLocaleString()}`)
    console.log(`   Average per Ward: ${stats.avg_voters.toLocaleString()}`)
    console.log(`   Range: ${stats.min_voters.toLocaleString()} - ${stats.max_voters.toLocaleString()}`)

    // Top constituencies by ward count
    console.log('\nTop 10 Constituencies by Number of Wards:')
    const topConstituencies = await pool.query(`
      SELECT
        c.name as constituency,
        co.name as county,
        COUNT(w.id) as ward_count,
        SUM(w.registered_voters) as total_voters,
        AVG(w.registered_voters)::integer as avg_per_ward
      FROM wards w
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
      GROUP BY c.name, co.name
      ORDER BY ward_count DESC
      LIMIT 10
    `)

    topConstituencies.rows.forEach(row => {
      console.log(`   ${row.constituency} (${row.county}): ${row.ward_count} wards, ${parseInt(row.total_voters).toLocaleString()} voters, avg ${row.avg_per_ward.toLocaleString()}`)
    })

    // Sample data from different counties
    console.log('\nSample Wards Data:')
    const samples = await pool.query(`
      SELECT
        w.name as ward,
        c.name as constituency,
        co.name as county,
        w.registered_voters
      FROM wards w
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
      WHERE co.name IN ('NAIROBI', 'MOMBASA', 'KISUMU', 'NAKURU')
      ORDER BY co.name, c.name, w.name
      LIMIT 20
    `)

    samples.rows.forEach(row => {
      console.log(`   ${row.county} - ${row.constituency} - ${row.ward}: ${row.registered_voters.toLocaleString()} voters`)
    })

  } catch (error) {
    console.error('Error updating wards:', error)
    throw error
  } finally {
    await pool.end()
  }
}

updateWardVoters()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

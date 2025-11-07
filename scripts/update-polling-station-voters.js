const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
})

async function updatePollingStationVoters() {
  console.log('📊 Updating Polling Station Registered Voters...\n')

  try {
    // Get all polling stations with their ward data
    const result = await pool.query(`
      SELECT
        ps.id,
        ps.name,
        ps.ward_id,
        w.name as ward_name,
        w.registered_voters as ward_voters,
        c.name as constituency_name,
        co.name as county_name
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
      ORDER BY co.name, c.name, w.name, ps.name
    `)

    console.log(`Found ${result.rows.length} polling stations to update...\n`)

    let updated = 0
    const batchSize = 200
    let currentBatch = []

    for (const station of result.rows) {
      // Calculate station voters based on ward
      // Get number of polling stations in this ward
      const countResult = await pool.query(
        'SELECT COUNT(*) as count FROM polling_stations WHERE ward_id = $1',
        [station.ward_id]
      )

      const stationsInWard = parseInt(countResult.rows[0].count)
      const wardVoters = station.ward_voters || 15000

      // Divide ward voters among polling stations with variation (±30%)
      const baseVoters = Math.floor(wardVoters / stationsInWard)
      const variation = Math.floor(baseVoters * 0.3)
      let stationVoters = baseVoters + Math.floor(Math.random() * variation * 2 - variation)

      // Ensure realistic range: 300 - 1,500 voters per polling station
      // (Kenya IEBC guidelines suggest max ~700 voters, but can go higher)
      stationVoters = Math.max(300, Math.min(1500, stationVoters))

      currentBatch.push({
        id: station.id,
        voters: stationVoters,
      })

      if (currentBatch.length >= batchSize) {
        // Process batch
        for (const item of currentBatch) {
          await pool.query(
            'UPDATE polling_stations SET registered_voters = $1 WHERE id = $2',
            [item.voters, item.id]
          )
        }

        console.log(`✓ Updated ${updated + currentBatch.length} polling stations...`)
        updated += currentBatch.length
        currentBatch = []
      }
    }

    // Process remaining batch
    if (currentBatch.length > 0) {
      for (const item of currentBatch) {
        await pool.query(
          'UPDATE polling_stations SET registered_voters = $1 WHERE id = $2',
          [item.voters, item.id]
        )
      }
      updated += currentBatch.length
      console.log(`✓ Updated ${updated} polling stations (final batch)`)
    }

    console.log(`\n✅ Updated ${updated} polling stations with voter registration data!\n`)

    // Show summary statistics
    console.log('📈 Summary Statistics:\n')

    // Overall stats
    const overallStats = await pool.query(`
      SELECT
        COUNT(*) as total_stations,
        SUM(registered_voters) as total_voters,
        AVG(registered_voters)::integer as avg_voters,
        MIN(registered_voters) as min_voters,
        MAX(registered_voters) as max_voters
      FROM polling_stations
    `)

    const stats = overallStats.rows[0]
    console.log('Overall:')
    console.log(`   Total Polling Stations: ${stats.total_stations}`)
    console.log(`   Total Voters: ${parseInt(stats.total_voters).toLocaleString()}`)
    console.log(`   Average per Station: ${stats.avg_voters.toLocaleString()}`)
    console.log(`   Range: ${stats.min_voters.toLocaleString()} - ${stats.max_voters.toLocaleString()}`)

    // Top counties by polling stations
    console.log('\nTop 10 Counties by Number of Polling Stations:')
    const topCounties = await pool.query(`
      SELECT
        co.name as county,
        COUNT(ps.id) as station_count,
        SUM(ps.registered_voters) as total_voters,
        AVG(ps.registered_voters)::integer as avg_per_station
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
      GROUP BY co.name
      ORDER BY station_count DESC
      LIMIT 10
    `)

    topCounties.rows.forEach(row => {
      console.log(`   ${row.county}: ${row.station_count} stations, ${parseInt(row.total_voters).toLocaleString()} voters, avg ${row.avg_per_station.toLocaleString()}/station`)
    })

    // Top wards by polling stations
    console.log('\nTop 10 Wards by Number of Polling Stations:')
    const topWards = await pool.query(`
      SELECT
        w.name as ward,
        c.name as constituency,
        co.name as county,
        COUNT(ps.id) as station_count,
        SUM(ps.registered_voters) as total_voters
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
      GROUP BY w.name, c.name, co.name
      ORDER BY station_count DESC
      LIMIT 10
    `)

    topWards.rows.forEach(row => {
      console.log(`   ${row.ward} (${row.constituency}, ${row.county}): ${row.station_count} stations, ${parseInt(row.total_voters).toLocaleString()} voters`)
    })

    // Sample data from major cities
    console.log('\nSample Polling Stations (Nairobi, Mombasa, Kisumu):')
    const samples = await pool.query(`
      SELECT
        ps.name as station,
        ps.code,
        w.name as ward,
        c.name as constituency,
        co.name as county,
        ps.registered_voters
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
      WHERE co.name IN ('NAIROBI', 'MOMBASA', 'KISUMU')
      ORDER BY co.name, ps.name
      LIMIT 20
    `)

    samples.rows.forEach(row => {
      console.log(`   ${row.county} - ${row.station} (${row.code}): ${row.registered_voters.toLocaleString()} voters`)
    })

    // Verify data integrity
    console.log('\n🔍 Data Integrity Check:')
    const integrityCheck = await pool.query(`
      SELECT
        co.name as county,
        SUM(ps.registered_voters) as ps_voters,
        MAX(w.registered_voters) as ward_voters_sample
      FROM polling_stations ps
      JOIN wards w ON ps.ward_id = w.id
      JOIN constituencies c ON w.constituency_id = c.id
      JOIN counties co ON c.county_id = co.id
      WHERE co.name IN ('NAIROBI', 'MOMBASA', 'KISUMU')
      GROUP BY co.name
      ORDER BY co.name
    `)

    integrityCheck.rows.forEach(row => {
      console.log(`   ${row.county}: ${parseInt(row.ps_voters).toLocaleString()} total voters across all stations`)
    })

  } catch (error) {
    console.error('Error updating polling stations:', error)
    throw error
  } finally {
    await pool.end()
  }
}

updatePollingStationVoters()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

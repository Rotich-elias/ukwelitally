const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
})

// Approximate registered voters per constituency (based on Kenya 2022 data)
// These are realistic estimates - you can replace with actual IEBC data later
const constituencyVoterData = {
  // NAIROBI COUNTY
  'WESTLANDS': 180000,
  'DAGORETTI NORTH': 165000,
  'DAGORETTI SOUTH': 170000,
  'LANGATA': 175000,
  'KIBRA': 160000,
  'ROYSAMBU': 185000,
  'KASARANI': 195000,
  'RUARAKA': 155000,
  'EMBAKASI SOUTH': 190000,
  'EMBAKASI NORTH': 180000,
  'EMBAKASI CENTRAL': 175000,
  'EMBAKASI EAST': 185000,
  'EMBAKASI WEST': 170000,
  'MAKADARA': 145000,
  'KAMUKUNJI': 140000,
  'STAREHE': 150000,
  'MATHARE': 135000,

  // MOMBASA COUNTY
  'CHANGAMWE': 125000,
  'JOMVU': 115000,
  'KISAUNI': 140000,
  'NYALI': 130000,
  'LIKONI': 120000,
  'MVITA': 110000,

  // KISUMU COUNTY
  'KISUMU CENTRAL': 95000,
  'KISUMU EAST': 90000,
  'KISUMU WEST': 88000,
  'SEME': 75000,
  'MUHORONI': 80000,
  'NYANDO': 85000,
  'NYAKACH': 78000,

  // Add more major constituencies...
  // For others, we'll use an average based on county size
}

async function updateConstituencyVoters() {
  console.log('📊 Updating Constituency Registered Voters...\n')

  try {
    // Get all constituencies
    const result = await pool.query(`
      SELECT c.id, c.name, co.name as county_name, co.registered_voters as county_voters
      FROM constituencies c
      JOIN counties co ON c.county_id = co.id
      ORDER BY co.name, c.name
    `)

    let updated = 0

    for (const constituency of result.rows) {
      let registeredVoters

      // Check if we have specific data for this constituency
      const constName = constituency.name.toUpperCase().trim()

      if (constituencyVoterData[constName]) {
        registeredVoters = constituencyVoterData[constName]
      } else {
        // Calculate based on county average
        // Get number of constituencies in this county
        const countResult = await pool.query(
          'SELECT COUNT(*) as count FROM constituencies WHERE county_id = (SELECT county_id FROM constituencies WHERE id = $1)',
          [constituency.id]
        )

        const constituenciesInCounty = parseInt(countResult.rows[0].count)
        const countyVoters = constituency.county_voters || 500000

        // Divide county voters among constituencies with some randomization (±20%)
        const baseVoters = Math.floor(countyVoters / constituenciesInCounty)
        const variation = Math.floor(baseVoters * 0.2)
        registeredVoters = baseVoters + Math.floor(Math.random() * variation * 2 - variation)

        // Ensure minimum of 30,000 voters per constituency
        registeredVoters = Math.max(30000, registeredVoters)
      }

      // Update the constituency
      await pool.query(
        'UPDATE constituencies SET registered_voters = $1 WHERE id = $2',
        [registeredVoters, constituency.id]
      )

      console.log(`✓ ${constituency.county_name} - ${constituency.name}: ${registeredVoters.toLocaleString()} voters`)
      updated++
    }

    console.log(`\n✅ Updated ${updated} constituencies with voter registration data!`)

    // Show summary by county
    console.log('\n📈 Summary by County:')
    const summary = await pool.query(`
      SELECT
        co.name as county,
        COUNT(c.id) as constituencies,
        SUM(c.registered_voters) as total_voters,
        AVG(c.registered_voters)::integer as avg_per_constituency
      FROM constituencies c
      JOIN counties co ON c.county_id = co.id
      GROUP BY co.name
      ORDER BY total_voters DESC
      LIMIT 10
    `)

    console.log('\nTop 10 Counties by Total Registered Voters:')
    summary.rows.forEach(row => {
      console.log(`   ${row.county}: ${row.total_voters.toLocaleString()} voters (${row.constituencies} constituencies, avg ${row.avg_per_constituency.toLocaleString()})`)
    })

  } catch (error) {
    console.error('Error updating constituencies:', error)
    throw error
  } finally {
    await pool.end()
  }
}

updateConstituencyVoters()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

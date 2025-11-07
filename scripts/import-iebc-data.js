const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
const csv = require('csv-parser')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
})

/**
 * IEBC Data Import Script
 *
 * This script imports official IEBC electoral data from CSV files
 *
 * Expected CSV Formats:
 *
 * 1. POLLING_STATIONS.csv
 *    Columns: station_name, station_code, ward_name, constituency_name, county_name, latitude, longitude, registered_voters
 *
 * 2. WARDS.csv (optional)
 *    Columns: ward_name, constituency_name, county_name, registered_voters
 *
 * 3. CONSTITUENCIES.csv (optional)
 *    Columns: constituency_name, county_name, code, registered_voters
 *
 * Usage:
 *   node scripts/import-iebc-data.js <file_path> <data_type>
 *
 * Examples:
 *   node scripts/import-iebc-data.js ./data/polling_stations.csv polling_stations
 *   node scripts/import-iebc-data.js ./data/wards.csv wards
 *   node scripts/import-iebc-data.js ./data/constituencies.csv constituencies
 */

async function createBackup() {
  console.log('📦 Creating backup of current data...\n')

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(__dirname, '../backups')

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const tables = ['polling_stations', 'wards', 'constituencies']

  for (const table of tables) {
    const result = await pool.query(`SELECT * FROM ${table}`)
    const backupFile = path.join(backupDir, `${table}_${timestamp}.json`)
    fs.writeFileSync(backupFile, JSON.stringify(result.rows, null, 2))
    console.log(`   ✓ Backed up ${table}: ${result.rows.length} records → ${backupFile}`)
  }

  console.log('\n✅ Backup complete!\n')
}

async function importPollingStations(filePath) {
  console.log('📥 Importing Polling Stations from IEBC data...\n')
  console.log(`File: ${filePath}\n`)

  const records = []

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Support multiple column name formats
        const record = {
          station_name: row.station_name || row.polling_station || row.name || row['Polling Station'],
          station_code: row.station_code || row.code || row['Station Code'],
          ward_name: row.ward_name || row.ward || row.Ward,
          constituency_name: row.constituency_name || row.constituency || row.Constituency,
          county_name: row.county_name || row.county || row.County,
          latitude: parseFloat(row.latitude || row.lat || row.Latitude || 0),
          longitude: parseFloat(row.longitude || row.lng || row.lon || row.Longitude || 0),
          registered_voters: parseInt(row.registered_voters || row.voters || row['Registered Voters'] || 0),
        }

        records.push(record)
      })
      .on('end', async () => {
        console.log(`✓ Parsed ${records.length} polling stations from CSV\n`)

        try {
          let imported = 0
          let updated = 0
          let errors = 0

          console.log('Processing records...\n')

          for (const record of records) {
            try {
              // Find the ward ID
              const wardResult = await pool.query(
                `SELECT w.id, w.constituency_id, c.county_id
                 FROM wards w
                 JOIN constituencies c ON w.constituency_id = c.id
                 JOIN counties co ON c.county_id = co.id
                 WHERE UPPER(w.name) = UPPER($1)
                   AND UPPER(c.name) = UPPER($2)
                   AND UPPER(co.name) = UPPER($3)`,
                [record.ward_name, record.constituency_name, record.county_name]
              )

              if (wardResult.rows.length === 0) {
                console.log(`   ⚠ Warning: Ward not found: ${record.ward_name} (${record.constituency_name}, ${record.county_name})`)
                errors++
                continue
              }

              const ward = wardResult.rows[0]

              // Check if station already exists
              const existingStation = await pool.query(
                'SELECT id FROM polling_stations WHERE code = $1',
                [record.station_code]
              )

              if (existingStation.rows.length > 0) {
                // Update existing station
                await pool.query(
                  `UPDATE polling_stations
                   SET name = $1, ward_id = $2, constituency_id = $3, county_id = $4,
                       latitude = $5, longitude = $6, registered_voters = $7
                   WHERE code = $8`,
                  [
                    record.station_name,
                    ward.id,
                    ward.constituency_id,
                    ward.county_id,
                    record.latitude,
                    record.longitude,
                    record.registered_voters,
                    record.station_code,
                  ]
                )
                updated++
              } else {
                // Insert new station
                await pool.query(
                  `INSERT INTO polling_stations
                   (name, code, ward_id, constituency_id, county_id, latitude, longitude, registered_voters)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                  [
                    record.station_name,
                    record.station_code,
                    ward.id,
                    ward.constituency_id,
                    ward.county_id,
                    record.latitude,
                    record.longitude,
                    record.registered_voters,
                  ]
                )
                imported++
              }

              if ((imported + updated) % 100 === 0) {
                console.log(`   Processing... ${imported + updated} stations`)
              }

            } catch (err) {
              console.error(`   ✗ Error processing: ${record.station_name} - ${err.message}`)
              errors++
            }
          }

          console.log(`\n✅ Import Complete!`)
          console.log(`   New stations imported: ${imported}`)
          console.log(`   Existing stations updated: ${updated}`)
          console.log(`   Errors: ${errors}`)

          resolve({ imported, updated, errors })

        } catch (error) {
          reject(error)
        }
      })
      .on('error', reject)
  })
}

async function importWards(filePath) {
  console.log('📥 Importing Wards from IEBC data...\n')
  console.log(`File: ${filePath}\n`)

  const records = []

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const record = {
          ward_name: row.ward_name || row.ward || row.Ward || row.name,
          constituency_name: row.constituency_name || row.constituency || row.Constituency,
          county_name: row.county_name || row.county || row.County,
          registered_voters: parseInt(row.registered_voters || row.voters || row['Registered Voters'] || 0),
        }
        records.push(record)
      })
      .on('end', async () => {
        console.log(`✓ Parsed ${records.length} wards from CSV\n`)

        try {
          let updated = 0
          let errors = 0

          for (const record of records) {
            try {
              const result = await pool.query(
                `UPDATE wards w
                 SET registered_voters = $1
                 FROM constituencies c, counties co
                 WHERE w.constituency_id = c.id
                   AND c.county_id = co.id
                   AND UPPER(w.name) = UPPER($2)
                   AND UPPER(c.name) = UPPER($3)
                   AND UPPER(co.name) = UPPER($4)`,
                [record.registered_voters, record.ward_name, record.constituency_name, record.county_name]
              )

              if (result.rowCount > 0) {
                updated++
              } else {
                console.log(`   ⚠ Ward not found: ${record.ward_name} (${record.constituency_name})`)
                errors++
              }

              if (updated % 50 === 0) {
                console.log(`   Processing... ${updated} wards`)
              }

            } catch (err) {
              console.error(`   ✗ Error: ${record.ward_name} - ${err.message}`)
              errors++
            }
          }

          console.log(`\n✅ Import Complete!`)
          console.log(`   Wards updated: ${updated}`)
          console.log(`   Errors: ${errors}`)

          resolve({ updated, errors })

        } catch (error) {
          reject(error)
        }
      })
      .on('error', reject)
  })
}

async function importConstituencies(filePath) {
  console.log('📥 Importing Constituencies from IEBC data...\n')
  console.log(`File: ${filePath}\n`)

  const records = []

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const record = {
          constituency_name: row.constituency_name || row.constituency || row.Constituency || row.name,
          county_name: row.county_name || row.county || row.County,
          code: row.code || row.constituency_code || row.Code,
          registered_voters: parseInt(row.registered_voters || row.voters || row['Registered Voters'] || 0),
        }
        records.push(record)
      })
      .on('end', async () => {
        console.log(`✓ Parsed ${records.length} constituencies from CSV\n`)

        try {
          let updated = 0
          let errors = 0

          for (const record of records) {
            try {
              const result = await pool.query(
                `UPDATE constituencies c
                 SET registered_voters = $1, code = $2
                 FROM counties co
                 WHERE c.county_id = co.id
                   AND UPPER(c.name) = UPPER($3)
                   AND UPPER(co.name) = UPPER($4)`,
                [record.registered_voters, record.code, record.constituency_name, record.county_name]
              )

              if (result.rowCount > 0) {
                updated++
              } else {
                console.log(`   ⚠ Constituency not found: ${record.constituency_name} (${record.county_name})`)
                errors++
              }

              if (updated % 20 === 0) {
                console.log(`   Processing... ${updated} constituencies`)
              }

            } catch (err) {
              console.error(`   ✗ Error: ${record.constituency_name} - ${err.message}`)
              errors++
            }
          }

          console.log(`\n✅ Import Complete!`)
          console.log(`   Constituencies updated: ${updated}`)
          console.log(`   Errors: ${errors}`)

          resolve({ updated, errors })

        } catch (error) {
          reject(error)
        }
      })
      .on('error', reject)
  })
}

async function validateData() {
  console.log('\n🔍 Validating imported data...\n')

  // Check for stations without GPS
  const noGPS = await pool.query(
    'SELECT COUNT(*) FROM polling_stations WHERE latitude = 0 OR longitude = 0 OR latitude IS NULL OR longitude IS NULL'
  )
  console.log(`   Stations without GPS: ${noGPS.rows[0].count}`)

  // Check for stations without voters
  const noVoters = await pool.query(
    'SELECT COUNT(*) FROM polling_stations WHERE registered_voters = 0 OR registered_voters IS NULL'
  )
  console.log(`   Stations without voter data: ${noVoters.rows[0].count}`)

  // Summary
  const summary = await pool.query(`
    SELECT
      co.name as county,
      COUNT(ps.id) as stations,
      SUM(ps.registered_voters) as total_voters,
      AVG(ps.registered_voters)::integer as avg_voters
    FROM polling_stations ps
    JOIN counties co ON ps.county_id = co.id
    GROUP BY co.name
    ORDER BY stations DESC
    LIMIT 10
  `)

  console.log('\n   Top 10 Counties by Stations:')
  summary.rows.forEach(row => {
    console.log(`      ${row.county}: ${row.stations} stations, ${parseInt(row.total_voters).toLocaleString()} voters`)
  })
}

// Main execution
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.log('\n📋 IEBC Data Import Script\n')
    console.log('Usage:')
    console.log('  node scripts/import-iebc-data.js <file_path> <data_type>\n')
    console.log('Data Types:')
    console.log('  polling_stations - Import polling station data')
    console.log('  wards - Import ward voter data')
    console.log('  constituencies - Import constituency data\n')
    console.log('Examples:')
    console.log('  node scripts/import-iebc-data.js ./data/stations.csv polling_stations')
    console.log('  node scripts/import-iebc-data.js ./data/wards.csv wards')
    console.log('  node scripts/import-iebc-data.js ./data/constituencies.csv constituencies\n')
    process.exit(1)
  }

  const [filePath, dataType] = args

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: File not found: ${filePath}`)
    process.exit(1)
  }

  try {
    // Create backup first
    await createBackup()

    // Import based on type
    switch (dataType.toLowerCase()) {
      case 'polling_stations':
      case 'stations':
        await importPollingStations(filePath)
        break

      case 'wards':
        await importWards(filePath)
        break

      case 'constituencies':
        await importConstituencies(filePath)
        break

      default:
        console.error(`❌ Error: Unknown data type: ${dataType}`)
        console.log('Valid types: polling_stations, wards, constituencies')
        process.exit(1)
    }

    // Validate
    await validateData()

    console.log('\n✅ All done!\n')

  } catch (error) {
    console.error('\n❌ Error during import:', error)
    console.log('\n💡 Your data has been backed up in the ./backups directory')
    console.log('   You can restore it if needed.\n')
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()

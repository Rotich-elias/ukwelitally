#!/usr/bin/env node

/**
 * Import the official IEBC ward list.
 *
 * The file is expected to carry the official codes:
 *
 *   code,name,constituency,constituency_code,county_code
 *   0721,Ainabkoi/Olare,Ainabkoi,144,027
 *
 * The importer matches existing records instead of duplicating them:
 *
 *   - counties are matched by their official code
 *   - constituencies are matched by their official code, then by name inside
 *     the county
 *   - wards are matched by their official code, then by name inside the
 *     constituency
 *
 * Matching by name is what upgrades the wards created by the polling-station
 * import (whose code is the ward name, e.g. EMSOO) to the official numeric
 * code without touching the polling stations attached to them.
 *
 * Nothing is deleted. Wards that are not in the file - placeholder wards, for
 * example - are left alone; the admin "Remove the placeholder wards" action
 * can prune the empty ones afterwards.
 *
 * Usage:
 *   node scripts/import-wards.js ~/Downloads/wards.csv --dry-run
 *   node scripts/import-wards.js ~/Downloads/wards.csv
 *
 *   DATABASE_URL_DIRECT='postgresql://...' \
 *     node scripts/import-wards.js ~/Downloads/wards.csv --dry-run
 *
 * The dry run writes inside a transaction and rolls it back, so the database
 * is left exactly as it was while still checking every constraint.
 */

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

/**
 * Load .env into process.env.
 *
 * Values already present in the environment win, so an explicit
 * DATABASE_URL_DIRECT on the command line always overrides the file.
 */
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

/**
 * Resolve the connection string.
 *
 * A direct (non-pooled) connection is preferred for one-off imports. There is
 * deliberately no hard-coded fallback: a missing connection string must fail
 * loudly rather than silently retarget another database.
 */
function resolveConnectionString() {
  const candidates = [
    process.env.DATABASE_URL_DIRECT,
    process.env.DIRECT_DATABASE_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.PG_URL_DIRECT,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.PG_URL,
  ]

  for (const candidate of candidates) {
    if (candidate && candidate.trim()) return candidate.trim()
  }

  return null
}

/**
 * Describe the target without revealing any secret: host, port and database
 * name only. The user, the password and the query string are dropped.
 */
function describeTarget(connectionString) {
  let url
  try {
    url = new URL(connectionString)
  } catch {
    return null
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return null
  }

  let database = ''
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  } catch {
    database = url.pathname.replace(/^\//, '')
  }

  return {
    host: url.hostname || '(unix socket)',
    port: url.port || '5432',
    database: database || '(default)',
  }
}

// All 47 official Kenya counties with their IEBC codes. Used only to fill in
// a county that is missing; existing county rows are never renamed.
const OFFICIAL_COUNTIES = [
  { code: '001', name: 'Mombasa' },
  { code: '002', name: 'Kwale' },
  { code: '003', name: 'Kilifi' },
  { code: '004', name: 'Tana River' },
  { code: '005', name: 'Lamu' },
  { code: '006', name: 'Taita Taveta' },
  { code: '007', name: 'Garissa' },
  { code: '008', name: 'Wajir' },
  { code: '009', name: 'Mandera' },
  { code: '010', name: 'Marsabit' },
  { code: '011', name: 'Isiolo' },
  { code: '012', name: 'Meru' },
  { code: '013', name: 'Tharaka-Nithi' },
  { code: '014', name: 'Embu' },
  { code: '015', name: 'Kitui' },
  { code: '016', name: 'Machakos' },
  { code: '017', name: 'Makueni' },
  { code: '018', name: 'Nyandarua' },
  { code: '019', name: 'Nyeri' },
  { code: '020', name: 'Kirinyaga' },
  { code: '021', name: "Murang'a" },
  { code: '022', name: 'Kiambu' },
  { code: '023', name: 'Turkana' },
  { code: '024', name: 'West Pokot' },
  { code: '025', name: 'Samburu' },
  { code: '026', name: 'Trans Nzoia' },
  { code: '027', name: 'Uasin Gishu' },
  { code: '028', name: 'Elgeyo/Marakwet' },
  { code: '029', name: 'Nandi' },
  { code: '030', name: 'Baringo' },
  { code: '031', name: 'Laikipia' },
  { code: '032', name: 'Nakuru' },
  { code: '033', name: 'Narok' },
  { code: '034', name: 'Kajiado' },
  { code: '035', name: 'Kericho' },
  { code: '036', name: 'Bomet' },
  { code: '037', name: 'Kakamega' },
  { code: '038', name: 'Vihiga' },
  { code: '039', name: 'Bungoma' },
  { code: '040', name: 'Busia' },
  { code: '041', name: 'Siaya' },
  { code: '042', name: 'Kisumu' },
  { code: '043', name: 'Homa Bay' },
  { code: '044', name: 'Migori' },
  { code: '045', name: 'Kisii' },
  { code: '046', name: 'Nyamira' },
  { code: '047', name: 'Nairobi' },
]

/** Split one CSV row, honouring quoted values. */
function splitCsvRow(row) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i]

    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

/** Parse the CSV into records keyed by normalised header names. */
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '')

  const rows = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (char === '"') {
      current += char
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === '\n' && !inQuotes) {
      rows.push(current)
      current = ''
      continue
    }

    if (char === '\r') continue

    current += char
  }
  if (current.trim()) rows.push(current)

  if (rows.length === 0) return { headers: [], records: [] }

  const headers = splitCsvRow(rows[0]).map((header) =>
    header.trim().toLowerCase().replace(/\s+/g, '_')
  )

  const records = rows.slice(1).map((row, index) => {
    const values = splitCsvRow(row)
    const record = { __line: index + 2 }
    headers.forEach((header, column) => {
      record[header] = (values[column] ?? '').trim()
    })
    return record
  })

  return { headers, records }
}

function pick(record, names) {
  for (const name of names) {
    const value = record[name]
    if (value !== undefined && value !== '') return value
  }
  return ''
}

/** Case and punctuation insensitive key used to match names. */
function normaliseName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Keep the leading zeros an official code needs. */
function padCode(value, length) {
  const raw = String(value ?? '').trim()
  if (/^\d+$/.test(raw) && raw.length < length) {
    return raw.padStart(length, '0')
  }
  return raw
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const csvFile = args.find((arg) => !arg.startsWith('--')) || null
  const dryRun = args.includes('--dry-run')
  return { csvFile, dryRun }
}

const { csvFile, dryRun } = parseArgs(process.argv)

if (!csvFile) {
  console.error(
    '\n❌ A wards CSV file is required.\n' +
      '   node scripts/import-wards.js ~/Downloads/wards.csv --dry-run\n'
  )
  process.exit(1)
}

const resolvedFile = csvFile.startsWith('~')
  ? path.join(process.env.HOME || '', csvFile.slice(1))
  : path.resolve(csvFile)

if (!fs.existsSync(resolvedFile)) {
  console.error(`\n❌ File not found: ${resolvedFile}\n`)
  process.exit(1)
}

const connectionString = resolveConnectionString()

if (!connectionString) {
  console.error(
    '\n❌ No database connection string found.\n' +
      '   Set DATABASE_URL (or DATABASE_URL_DIRECT) in your environment.\n'
  )
  process.exit(1)
}

const target = describeTarget(connectionString)

if (!target) {
  console.error(
    '\n❌ The connection string could not be parsed, so the target database\n' +
      '   cannot be verified. Refusing to continue.\n'
  )
  process.exit(1)
}

/**
 * Read and validate the file before touching the database.
 *
 * Every problem carries the CSV line so the file can be fixed rather than
 * guessed at.
 */
function readWardRows(text) {
  const { headers, records } = parseCsv(text)

  const required = ['name', 'constituency', 'constituency_code', 'county_code']
  const missing = required.filter((header) => !headers.includes(header))
  const codeHeader = ['code', 'ward_code', 'ward_iebc_code'].find((header) =>
    headers.includes(header)
  )

  if (!codeHeader) missing.unshift('code')

  if (missing.length > 0) {
    throw new Error(
      `The file is missing the column(s) ${missing.join(', ')}. ` +
        'It must have: code, name, constituency, constituency_code, county_code'
    )
  }

  const errors = []
  const rows = []
  const seenWardCodes = new Map()
  const seenWardNames = new Map()
  const constituencyInfo = new Map()

  for (const record of records) {
    const line = record.__line
    const wardCode = padCode(
      pick(record, ['code', 'ward_code', 'ward_iebc_code']),
      4
    )
    const name = pick(record, ['name', 'ward_name', 'ward']).trim()
    const constituencyName = pick(record, [
      'constituency',
      'constituency_name',
    ]).trim()
    const constituencyCode = padCode(
      pick(record, [
        'constituency_code',
        'constituency_iebc_code',
        'const_code',
      ]),
      3
    )
    const countyCode = padCode(
      pick(record, ['county_code', 'county_iebc_code']),
      3
    )

    if (!wardCode) errors.push(`Line ${line}: the ward code is empty`)
    else if (!/^[0-9]+$/.test(wardCode)) {
      errors.push(`Line ${line}: the ward code "${wardCode}" is not numeric`)
    }

    if (!name) errors.push(`Line ${line}: the ward name is empty`)
    if (!constituencyName) {
      errors.push(`Line ${line}: the constituency name is empty`)
    }
    if (!constituencyCode) {
      errors.push(`Line ${line}: the constituency code is empty`)
    } else if (!/^[0-9]+$/.test(constituencyCode)) {
      errors.push(
        `Line ${line}: the constituency code "${constituencyCode}" is not numeric`
      )
    }
    if (!countyCode) {
      errors.push(`Line ${line}: the county code is empty`)
    } else if (!/^[0-9]+$/.test(countyCode)) {
      errors.push(`Line ${line}: the county code "${countyCode}" is not numeric`)
    }

    if (wardCode && seenWardCodes.has(wardCode)) {
      errors.push(
        `Line ${line}: the ward code "${wardCode}" is also used on line ${seenWardCodes.get(
          wardCode
        )}`
      )
    } else if (wardCode) {
      seenWardCodes.set(wardCode, line)
    }

    if (name && constituencyCode) {
      const nameKey = `${constituencyCode}::${normaliseName(name)}`
      if (seenWardNames.has(nameKey)) {
        errors.push(
          `Line ${line}: the ward "${name}" already appears in constituency ${constituencyCode} on line ${seenWardNames.get(
            nameKey
          )}`
        )
      } else {
        seenWardNames.set(nameKey, line)
      }
    }

    if (constituencyCode) {
      const existing = constituencyInfo.get(constituencyCode)
      if (existing) {
        if (normaliseName(existing.name) !== normaliseName(constituencyName)) {
          errors.push(
            `Line ${line}: constituency ${constituencyCode} is called "${existing.name}" on line ${existing.line} and "${constituencyName}" here`
          )
        }
        if (existing.countyCode !== countyCode) {
          errors.push(
            `Line ${line}: constituency ${constituencyCode} belongs to county ${existing.countyCode} on line ${existing.line} and county ${countyCode} here`
          )
        }
      } else {
        constituencyInfo.set(constituencyCode, {
          name: constituencyName,
          countyCode,
          line,
        })
      }
    }

    rows.push({
      line,
      wardCode,
      name,
      constituencyName,
      constituencyCode,
      countyCode,
    })
  }

  if (errors.length > 0) {
    throw new Error(
      `The file has ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`
    )
  }

  if (rows.length === 0) throw new Error('The file has no data rows')

  return { rows, constituencyInfo }
}

/** Run `run` over a list in fixed-size slices. */
async function inBatches(items, size, run) {
  for (let start = 0; start < items.length; start += size) {
    await run(items.slice(start, start + size))
  }
}

/**
 * Update rows of a table from a list of value tuples.
 *
 * A batch is one statement. A hosted database is a network round trip per
 * statement, so writing row by row turns a 1,450-row import into thousands of
 * round trips and a timeout.
 *
 * `columns` carries the SQL type of each column so the parameter placeholders
 * can be cast and PostgreSQL does not have to guess.
 */
async function updateBatch(client, table, columns, updates) {
  await inBatches(updates, 200, async (batch) => {
    const params = []
    const values = batch.map((update) => {
      const placeholders = columns.map((column) => {
        params.push(update[column.name])
        return `$${params.length}::${column.type}`
      })
      return `(${placeholders.join(', ')})`
    })

    const assignments = columns
      .filter((column) => column.name !== 'id')
      .map((column) => `${column.name} = v.${column.name}`)
      .join(', ')

    await client.query(
      `UPDATE ${table} AS t
          SET ${assignments}
         FROM (VALUES ${values.join(', ')}) AS v(${columns
        .map((column) => column.name)
        .join(', ')})
        WHERE t.id = v.id`,
      params
    )
  })
}

async function importWards(client, rows, constituencyInfo) {
  const summary = {
    countiesCreated: 0,
    countiesUpdated: 0,
    constituenciesCreated: 0,
    constituenciesUpdated: 0,
    wardsCreated: 0,
    wardsUpdated: 0,
    wardsMatchedByName: 0,
  }

  // ---- Counties ----------------------------------------------------------
  const countyResult = await client.query(
    'SELECT id, code, name FROM counties'
  )
  const countyByCode = new Map(
    countyResult.rows.map((row) => [String(row.code), row])
  )
  const countyByName = new Map(
    countyResult.rows.map((row) => [normaliseName(row.name), row])
  )
  const countiesToInsert = []

  for (const county of OFFICIAL_COUNTIES) {
    if (countyByCode.has(county.code)) continue

    const byName = countyByName.get(normaliseName(county.name))

    if (byName) {
      // Keep the county row (and the constituencies that point at it) and
      // correct its code to the official one.
      await client.query('UPDATE counties SET code = $1 WHERE id = $2', [
        county.code,
        byName.id,
      ])
      byName.code = county.code
      countyByCode.set(county.code, byName)
      summary.countiesUpdated += 1
    } else {
      countiesToInsert.push(county)
    }
  }

  if (countiesToInsert.length > 0) {
    const inserted = await client.query(
      `INSERT INTO counties (code, name)
       SELECT * FROM UNNEST($1::text[], $2::text[])
       RETURNING id, code, name`,
      [
        countiesToInsert.map((county) => county.code),
        countiesToInsert.map((county) => county.name),
      ]
    )
    for (const row of inserted.rows) {
      countyByCode.set(String(row.code), row)
      countyByName.set(normaliseName(row.name), row)
    }
    summary.countiesCreated = inserted.rowCount
  }

  // A ward cannot be placed without its county.
  for (const [code, info] of constituencyInfo) {
    if (!countyByCode.has(info.countyCode)) {
      throw new Error(
        `Constituency ${code} (${info.name}) refers to county code ${info.countyCode}, which does not exist and is not one of the 47 official counties`
      )
    }
  }

  // ---- Constituencies ----------------------------------------------------
  const constituencyResult = await client.query(
    'SELECT id, code, name, county_id FROM constituencies'
  )
  const constituencyByCode = new Map(
    constituencyResult.rows.map((row) => [String(row.code), row])
  )
  const constituencyByName = new Map()
  for (const row of constituencyResult.rows) {
    constituencyByName.set(
      `${row.county_id}::${normaliseName(row.name)}`,
      row
    )
  }

  const constituencyUpdates = []
  const constituenciesToInsert = []

  for (const [code, info] of constituencyInfo) {
    const county = countyByCode.get(info.countyCode)
    const existing = constituencyByCode.get(code)

    if (existing) {
      if (
        existing.name !== info.name ||
        Number(existing.county_id) !== Number(county.id)
      ) {
        constituencyUpdates.push({
          id: existing.id,
          code,
          name: info.name,
          county_id: county.id,
        })
        existing.name = info.name
        existing.county_id = county.id
      }
      continue
    }

    const byName = constituencyByName.get(
      `${county.id}::${normaliseName(info.name)}`
    )

    if (byName) {
      // A constituency created by an earlier import keeps its row and its
      // foreign keys; only the code is corrected to the official one.
      constituencyUpdates.push({
        id: byName.id,
        code,
        name: info.name,
        county_id: county.id,
      })
      byName.code = code
      byName.name = info.name
      byName.county_id = county.id
      constituencyByCode.set(code, byName)
    } else {
      constituenciesToInsert.push({
        code,
        name: info.name,
        county_id: county.id,
      })
    }
  }

  await updateBatch(client, 'constituencies', [
    { name: 'id', type: 'int' },
    { name: 'code', type: 'text' },
    { name: 'name', type: 'text' },
    { name: 'county_id', type: 'int' },
  ], constituencyUpdates)
  summary.constituenciesUpdated = constituencyUpdates.length

  if (constituenciesToInsert.length > 0) {
    const inserted = await client.query(
      `INSERT INTO constituencies (code, name, county_id)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::int[])
       RETURNING id, code, name, county_id`,
      [
        constituenciesToInsert.map((row) => row.code),
        constituenciesToInsert.map((row) => row.name),
        constituenciesToInsert.map((row) => row.county_id),
      ]
    )
    for (const row of inserted.rows) {
      constituencyByCode.set(String(row.code), row)
      constituencyByName.set(
        `${row.county_id}::${normaliseName(row.name)}`,
        row
      )
    }
    summary.constituenciesCreated = inserted.rowCount
  }

  // ---- Wards -------------------------------------------------------------
  const wardResult = await client.query(
    'SELECT id, code, name, constituency_id, county_id FROM wards'
  )
  const wardByCode = new Map(
    wardResult.rows.map((row) => [String(row.code), row])
  )
  const wardByName = new Map()
  for (const row of wardResult.rows) {
    wardByName.set(
      `${row.constituency_id}::${normaliseName(row.name)}`,
      row
    )
  }

  const wardUpdates = []
  const wardsToInsert = []

  for (const row of rows) {
    const constituency = constituencyByCode.get(row.constituencyCode)
    if (!constituency) {
      throw new Error(
        `Constituency ${row.constituencyCode} (${row.constituencyName}) was not created`
      )
    }
    const countyId = constituency.county_id

    const existingByCode = wardByCode.get(row.wardCode)

    if (existingByCode) {
      if (
        existingByCode.name !== row.name ||
        Number(existingByCode.constituency_id) !== Number(constituency.id) ||
        Number(existingByCode.county_id) !== Number(countyId)
      ) {
        wardUpdates.push({
          id: existingByCode.id,
          code: row.wardCode,
          name: row.name,
          constituency_id: constituency.id,
          county_id: countyId,
        })
        existingByCode.name = row.name
        existingByCode.constituency_id = constituency.id
        existingByCode.county_id = countyId
      }
      continue
    }

    const matchByName = wardByName.get(
      `${constituency.id}::${normaliseName(row.name)}`
    )

    if (matchByName) {
      // The polling-station import names a new ward after the ward itself
      // (EMSOO, KAMARINY, ...). Give that row the official code so the
      // stations attached to it stay attached.
      wardUpdates.push({
        id: matchByName.id,
        code: row.wardCode,
        name: row.name,
        constituency_id: constituency.id,
        county_id: countyId,
      })
      matchByName.code = row.wardCode
      matchByName.name = row.name
      matchByName.constituency_id = constituency.id
      matchByName.county_id = countyId
      wardByCode.set(row.wardCode, matchByName)
      summary.wardsMatchedByName += 1
      continue
    }

    wardsToInsert.push({
      code: row.wardCode,
      name: row.name,
      constituency_id: constituency.id,
      county_id: countyId,
    })
  }

  await updateBatch(client, 'wards', [
    { name: 'id', type: 'int' },
    { name: 'code', type: 'text' },
    { name: 'name', type: 'text' },
    { name: 'constituency_id', type: 'int' },
    { name: 'county_id', type: 'int' },
  ], wardUpdates)
  summary.wardsUpdated = wardUpdates.length

  if (wardsToInsert.length > 0) {
    await inBatches(wardsToInsert, 500, async (batch) => {
      const inserted = await client.query(
        `INSERT INTO wards (code, name, constituency_id, county_id)
         SELECT * FROM UNNEST($1::text[], $2::text[], $3::int[], $4::int[])
         RETURNING id`,
        [
          batch.map((row) => row.code),
          batch.map((row) => row.name),
          batch.map((row) => row.constituency_id),
          batch.map((row) => row.county_id),
        ]
      )
      summary.wardsCreated += inserted.rowCount
    })
  }

  return summary
}

async function main() {
  const text = fs.readFileSync(resolvedFile, 'utf8')
  const { rows, constituencyInfo } = readWardRows(text)

  console.log('\n🗺️  Official IEBC wards import\n')
  console.log(`   File:   ${resolvedFile}`)
  console.log(`   Rows:   ${rows.length}`)
  console.log(
    `   Target: host=${target.host} port=${target.port} database=${target.database}`
  )
  console.log(
    `   Mode:   ${dryRun ? 'DRY RUN (all changes are rolled back)' : 'WRITE'}\n`
  )

  const pool = new Pool({ connectionString })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const summary = await importWards(client, rows, constituencyInfo)

    if (dryRun) {
      await client.query('ROLLBACK')
    } else {
      await client.query('COMMIT')
    }

    console.log(
      `   Counties created:        ${summary.countiesCreated}`
    )
    console.log(
      `   Counties updated:        ${summary.countiesUpdated}`
    )
    console.log(
      `   Constituencies created:  ${summary.constituenciesCreated}`
    )
    console.log(
      `   Constituencies updated:  ${summary.constituenciesUpdated}`
    )
    console.log(`   Wards created:           ${summary.wardsCreated}`)
    console.log(
      `   Wards updated:           ${summary.wardsUpdated} (${summary.wardsMatchedByName} matched by name and given their official code)`
    )
    console.log(
      `\n${dryRun ? '✅ Dry run complete - nothing was written.' : '✅ Import complete.'}\n`
    )
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(`\n❌ Import failed: ${error.message}\n`)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * Database migration runner.
 *
 * Applies every SQL file in src/db/migrations in filename order, tracking what
 * has already run in a `schema_migrations` table. Each migration runs inside
 * its own transaction so a failure leaves the database consistent.
 *
 * Usage:
 *   node scripts/migrate.js            # apply pending migrations
 *   node scripts/migrate.js --status   # show applied/pending without applying
 *   node scripts/migrate.js --dry-run  # print what would run
 *   node scripts/migrate.js --baseline [N] # mark the first N migrations as applied
 *
 * The --baseline flag is for databases that were created before the tracking
 * table existed: it marks migrations already present in the schema as applied
 * without running them, so only genuinely new migrations are executed.
 * Pass N to limit how many are marked (defaults to all).
 */

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations')

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

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally'

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

async function main() {
  const statusOnly = process.argv.includes('--status')
  const dryRun = process.argv.includes('--dry-run')
  const baseline = process.argv.includes('--baseline')

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migration directory not found: ${MIGRATIONS_DIR}`)
    process.exit(1)
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const pool = new Pool({ connectionString })
  const client = await pool.connect()

  try {
    await ensureTrackingTable(client)

    const appliedResult = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    )
    const applied = new Set(appliedResult.rows.map((r) => r.filename))

    const pending = files.filter((f) => !applied.has(f))

    console.log(`\n📦 Migrations directory: ${MIGRATIONS_DIR}`)
    console.log(`   Total: ${files.length} | Applied: ${applied.size} | Pending: ${pending.length}\n`)

    if (baseline) {
      // Record existing migrations as applied without executing them. Used
      // when adopting a database that was migrated before the tracking table
      // existed. An optional count limits how many are marked.
      const baselineIndex = process.argv.indexOf('--baseline')
      const countArg = process.argv[baselineIndex + 1]
      const count = countArg && /^\d+$/.test(countArg) ? parseInt(countArg) : files.length
      const toBaseline = files.slice(0, count)

      for (const file of toBaseline) {
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
          [file]
        )
      }
      console.log(`✅ Baseline recorded: ${toBaseline.length} migrations marked as applied.`)
      console.log('   New migrations added from now on will be applied normally.\n')
      return
    }

    if (statusOnly || dryRun) {
      for (const file of files) {
        const state = applied.has(file) ? '✔ applied' : '→ pending'
        console.log(`   ${state.padEnd(12)} ${file}`)
      }
      console.log('')
      if (statusOnly) {
        console.log('Status only. No migrations applied.\n')
      } else {
        console.log('Dry run. No migrations applied.\n')
      }
      return
    }

    if (pending.length === 0) {
      console.log('✅ Database is up to date. Nothing to apply.\n')
      return
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      console.log(`🔧 Applying ${file}...`)

      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
          [file]
        )
        await client.query('COMMIT')
        console.log(`   ✅ ${file} applied\n`)
      } catch (error) {
        await client.query('ROLLBACK')
        console.error(`   ❌ ${file} failed: ${error.message}`)
        console.error(`   Rolled back. Fix the migration and re-run.\n`)
        process.exitCode = 1
        return
      }
    }

    console.log('✅ All migrations applied successfully.\n')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Migration runner failed:', error)
  process.exit(1)
})

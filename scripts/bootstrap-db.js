#!/usr/bin/env node

/**
 * One-shot bootstrap for a hosted (or empty) database.
 *
 * Runs the migrations, then loads the Kenya electoral geography and creates
 * the initial admin account.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/bootstrap-db.js
 *   node scripts/bootstrap-db.js            # reads .env
 *
 * Flags:
 *   --skip-admin     do not create the admin account
 *   --admin-email    email for the admin account (default admin@ukwelitally.com)
 *   --admin-password password for the admin account (default Admin123)
 */

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const ROOT = path.join(__dirname, '..')

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env')
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

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(name)
const flagValue = (name, fallback) => {
  const index = args.indexOf(name)
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback
}

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.PG_URL

if (!connectionString) {
  console.error(
    '❌ No database connection string found.\n' +
      '   Set DATABASE_URL (or POSTGRES_URL) and try again.\n' +
      '   Example:\n' +
      '     DATABASE_URL=postgresql://user:pass@host/db?sslmode=require node scripts/bootstrap-db.js'
  )
  process.exit(1)
}

function runMigrations() {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const child = spawn('node', [path.join(__dirname, 'migrate.js')], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`migrate.js exited with ${code}`))
    )
    child.on('error', reject)
  })
}

async function seedGeography(pool) {
  const existing = await pool.query('SELECT COUNT(*) as count FROM counties')
  const countyCount = parseInt(existing.rows[0].count, 10)

  if (countyCount > 0) {
    console.log(`   Counties already present (${countyCount}). Skipping geography seed.`)
    return
  }

  console.log('   Loading Kenya electoral geography...')
  // The geography seeder is a standalone script that uses the same
  // connection string from the environment.
  await new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const child = spawn('node', [path.join(__dirname, 'seed-iebc-geography.js')], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`seed-iebc-geography.js exited with ${code}`))
    )
    child.on('error', reject)
  })
}

async function seedAdmin(pool, email, password) {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    console.log(`   Admin account already exists (${email}).`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)

  await pool.query(
    `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
     VALUES ($1, $2, $3, $4, 'admin', $5, true, true)`,
    [email, '+254700000000', passwordHash, 'System Administrator', '10000000']
  )

  console.log(`   ✅ Admin created: ${email}`)
  console.log('   🔒 Change this password immediately after first login.')
}

async function main() {
  console.log('\n🚀 Bootstrapping UkweliTally database\n')
  console.log('=====================================\n')

  console.log('1. Running migrations...')
  await runMigrations()

  const pool = new Pool({ connectionString })

  try {
    console.log('\n2. Seeding electoral geography...')
    await seedGeography(pool)

    if (!hasFlag('--skip-admin')) {
      const email = flagValue('--admin-email', 'admin@ukwelitally.com')
      const password = flagValue('--admin-password', 'Admin123')
      console.log('\n3. Creating admin account...')
      await seedAdmin(pool, email, password)
    }

    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM counties) as counties,
        (SELECT COUNT(*) FROM constituencies) as constituencies,
        (SELECT COUNT(*) FROM wards) as wards,
        (SELECT COUNT(*) FROM polling_stations) as polling_stations,
        (SELECT COUNT(*) FROM users) as users
    `)

    const row = counts.rows[0]
    console.log('\n📊 Database summary:')
    console.log(`   Counties:        ${row.counties}`)
    console.log(`   Constituencies:  ${row.constituencies}`)
    console.log(`   Wards:           ${row.wards}`)
    console.log(`   Polling stations:${row.polling_stations}`)
    console.log(`   Users:           ${row.users}`)
    console.log('\n✅ Bootstrap complete.\n')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('\n❌ Bootstrap failed:', error.message)
  process.exit(1)
})

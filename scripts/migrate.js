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
 *   node scripts/migrate.js --allow-pooled # permit a pooled (PgBouncer) connection
 *   node scripts/migrate.js --baseline [N] # mark the first N migrations as applied
 *
 * The --baseline flag is for databases that were created before the tracking
 * table existed: it marks migrations already present in the schema as applied
 * without running them, so only genuinely new migrations are executed.
 * Pass N to limit how many are marked (defaults to all).
 *
 * Safety rules enforced by this script:
 *   - TLS is required for remote database connections. A connection string
 *     that disables TLS, or that turns certificate verification off
 *     (sslmode=no-verify), is rejected for a remote host rather than
 *     silently accepted.
 *   - A pooled (PgBouncer) connection is refused by default, because schema
 *     changes do not behave reliably through a transaction pooler. Pass
 *     --allow-pooled to override this deliberately.
 *   - --status and --dry-run never write to the database. They do not create
 *     the schema_migrations table.
 *   - The target is printed as a redacted host/database identifier only. No
 *     credential or query parameter is ever written to the output.
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

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']

/**
 * Describe the connection target without revealing anything secret.
 *
 * Only the host, the port and the database name are returned. The user name,
 * the password and the whole query string are deliberately dropped, because
 * query parameters can carry secrets (sslkey, sslpassword, options, ...).
 *
 * The WHATWG URL parser is used because it splits the authority on the LAST
 * "@" before the path. A naive regular expression stops at the FIRST "@", so
 * a password that contains an unencoded "@" would leak a fragment of it into
 * the host.
 */
function describeTarget(connectionString) {
  let url
  try {
    url = new URL(connectionString)
  } catch {
    return { host: '(unparseable)', port: '', database: '(unparseable)', parseable: false }
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return { host: '(unparseable)', port: '', database: '(unparseable)', parseable: false }
  }

  let database = ''
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  } catch {
    database = url.pathname.replace(/^\//, '')
  }

  // An empty host means a Unix socket (postgresql:///dbname). That is a local
  // connection, so it is not treated as a remote host.
  return {
    host: url.hostname || '',
    port: url.port || '5432',
    database: database || '(default)',
    parseable: true,
  }
}

/**
 * Detect a connection pooler.
 *
 * Neon:       ep-xxx-pooler.<region>.aws.neon.tech
 * Supabase:   aws-0-<region>.pooler.supabase.com
 * Railway:    <name>-pooler.<...>
 *
 * The host must contain "pooler" as a dot or dash separated word followed by a
 * dot, so a project that happens to be named "pooler-demo" is not mistaken
 * for a pooler endpoint.
 *
 * A `pgbouncer=true` or `pooled=true` query parameter counts too.
 */
function isPooledUrl(connectionString) {
  const { host } = describeTarget(connectionString)
  const lowerHost = host.toLowerCase()

  if (/(^|[.\-])pooler[.]/.test(lowerHost)) return true
  if (/[?&](pgbouncer|pooled)=true/i.test(connectionString)) return true

  return false
}

/**
 * Resolve the sslmode for the connection.
 *
 * This mirrors src/lib/db.ts so the application and the migration runner
 * agree on when TLS is used:
 *   - DATABASE_SSL always wins when it holds a recognised value
 *   - an sslmode already present in the connection string is respected
 *   - local development hosts do not use TLS
 *   - every other host is treated as a managed provider and requires TLS
 *
 * On certificate verification: with pg >= 8.16 (pg-connection-string >= 2.x)
 * an `sslmode=require` maps to `ssl = {}`, and Node's TLS default is
 * `rejectUnauthorized: true`, so the server certificate IS verified against
 * the system CA store. `verify-ca` and `verify-full` additionally check the
 * hostname. This script never uses `no-verify`, `allow` or
 * `rejectUnauthorized: false`; `no-verify` is rejected outright for a remote
 * host because it turns certificate verification off.
 */
function resolveSslMode(connectionString) {
  const explicit = (process.env.DATABASE_SSL || '').trim().toLowerCase()

  if (explicit) {
    if (['false', '0', 'disable'].includes(explicit)) return 'disable'
    if (['true', '1', 'require'].includes(explicit)) return 'require'
    if (explicit === 'verify-ca' || explicit === 'verify-full') return explicit
    if (explicit === 'no-verify') return 'no-verify'

    console.warn(
      `⚠️  Ignoring unrecognised DATABASE_SSL value "${explicit}". ` +
        'Expected one of: require, verify-ca, verify-full.'
    )
  }

  const existing = /[?&]sslmode=([^&]*)/i.exec(connectionString)
  if (existing) return existing[1].toLowerCase()

  const { host } = describeTarget(connectionString)
  if (!host || LOCAL_HOSTS.includes(host.toLowerCase())) return null

  return 'require'
}

/**
 * Apply the resolved sslmode to the connection string.
 *
 * pg gives the connection string precedence over a separate `ssl` option, so
 * the mode has to be carried in the URL rather than passed alongside it.
 */
function normalizeConnectionString(connectionString, sslmode) {
  if (!sslmode) return connectionString

  const [base, query] = connectionString.split('?')
  const params = query
    ? query.split('&').filter((p) => !/^sslmode=/i.test(p))
    : []

  params.push(`sslmode=${sslmode}`)
  return `${base}?${params.join('&')}`
}

/**
 * Resolve the connection string for migrations.
 *
 * Schema migrations should use a DIRECT connection. Managed providers such as
 * Neon and Supabase put a pooler (PgBouncer) in front of the database, and in
 * transaction pooling mode some tooling behaves differently. Providers expose
 * the direct connection separately, so it is preferred when available.
 */
function resolveMigrationUrl() {
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

const connectionString = resolveMigrationUrl()

if (!connectionString) {
  console.error(
    'No database connection string found.\n' +
      'Set DATABASE_URL (or DATABASE_URL_DIRECT for migrations) and try again.'
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Target checks. These run before a connection is opened so that a
// misconfigured run fails fast instead of talking to the wrong database.
// ---------------------------------------------------------------------------

const target = describeTarget(connectionString)

if (!target.parseable) {
  console.error(
    '❌ The connection string could not be parsed, so the target database\n' +
      '   cannot be verified. Refusing to continue.'
  )
  process.exit(1)
}

const sslMode = resolveSslMode(connectionString)
// An empty host means a Unix socket, which is always a local connection.
const isLocalHost = !target.host || LOCAL_HOSTS.includes(target.host.toLowerCase())

// Modes that switch TLS off entirely, or that switch certificate
// verification off while leaving the connection encrypted.
const INSECURE_SSL_MODES = ['disable', 'no-verify']

if (!isLocalHost && INSECURE_SSL_MODES.includes(sslMode)) {
  if (sslMode === 'disable') {
    console.error(
      '❌ TLS is disabled for a remote database connection.\n' +
        `   Target: ${target.host}/${target.database}\n` +
        '   Remove "sslmode=disable" (or DATABASE_SSL=disable) from the\n' +
        '   connection string, or point DATABASE_URL_DIRECT at a local database.\n' +
        '   If the server uses a private certificate authority, use\n' +
        '   "?sslmode=verify-ca&sslrootcert=/path/to/ca.crt" instead.'
    )
  } else {
    console.error(
      '❌ Certificate verification is disabled for a remote database\n' +
        '   connection ("sslmode=no-verify").\n' +
        `   Target: ${target.host}/${target.database}\n` +
        '   This makes the connection vulnerable to interception. Use\n' +
        '   "sslmode=require" (or verify-ca with "sslrootcert=...") instead.'
    )
  }
  process.exit(1)
}

if (!isLocalHost && (sslMode === 'prefer' || sslMode === 'allow')) {
  console.warn(
    `⚠️  sslmode=${sslMode} is not a verified mode. It is treated as\n` +
      '   "require" by this pg version, but "require" should be used\n' +
      '   explicitly so the behaviour does not depend on the driver version.'
  )
}

const finalConnectionString = normalizeConnectionString(connectionString, sslMode)
const ALLOW_POOLED = process.argv.includes('--allow-pooled')

if (isPooledUrl(connectionString) && !ALLOW_POOLED) {
  console.error(
    '❌ The selected connection string points at a connection POOLER.\n' +
      `   Target: ${target.host}/${target.database}\n` +
      '   Schema migrations should use the DIRECT (non-pooled) endpoint:\n' +
      '   transaction pooling loses session state between transactions, which\n' +
      '   breaks DDL such as CREATE EXTENSION and session level settings.\n\n' +
      '   Set DATABASE_URL_DIRECT to the direct connection string and retry.\n' +
      '   To use the pooled endpoint anyway, re-run with --allow-pooled.\n'
  )
  process.exit(1)
}

if (isPooledUrl(connectionString) && ALLOW_POOLED) {
  console.warn(
    '⚠️  --allow-pooled was supplied: continuing with a POOLED connection.\n' +
      '   Migrations may fail or behave unexpectedly behind a transaction pooler.\n'
  )
}

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

/**
 * Read the set of already applied migrations.
 *
 * When `createTable` is false the tracking table is NOT created: --status and
 * --dry-run are read-only operations and must not write to the database. If
 * the table does not exist yet, nothing has been applied.
 */
async function readAppliedMigrations(client, { createTable }) {
  if (createTable) {
    await ensureTrackingTable(client)
  } else {
    const exists = await client.query(
      "SELECT to_regclass('schema_migrations') AS table_name"
    )
    if (!exists.rows[0].table_name) return new Set()
  }

  const appliedResult = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  )
  return new Set(appliedResult.rows.map((r) => r.filename))
}

async function main() {
  const statusOnly = process.argv.includes('--status')
  const dryRun = process.argv.includes('--dry-run')
  const baseline = process.argv.includes('--baseline')
  const allowPooled = ALLOW_POOLED

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migration directory not found: ${MIGRATIONS_DIR}`)
    process.exit(1)
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const pool = new Pool({ connectionString: finalConnectionString })
  const client = await pool.connect()

  try {
    // Read-only modes must not create the tracking table.
    const applied = await readAppliedMigrations(client, {
      createTable: !statusOnly && !dryRun,
    })

    const pending = files.filter((f) => !applied.has(f))

    console.log(`\n🎯 Target: host=${target.host} port=${target.port} database=${target.database}`)
    console.log(`   TLS: ${sslMode || 'disabled (local host)'}${allowPooled ? ' | pooled connection allowed by --allow-pooled' : ''}`)
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
        console.log('Status only. No migrations applied and nothing was written.\n')
      } else {
        console.log('Dry run. No migrations applied and nothing was written.\n')
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

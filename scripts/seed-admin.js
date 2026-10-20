#!/usr/bin/env node
/**
 * Create the first administrator account.
 *
 * Security rules enforced by this script:
 *   - The database target must be supplied explicitly. There is no fallback
 *     and no built-in default, so the script can never silently write to a
 *     local development database.
 *   - The target must be a DIRECT (non-pooled) connection, and its redacted
 *     host, port and database name are printed before anything is written.
 *   - The email, phone, ID number and the initial password must come from
 *     the environment or from a prompt. The password is read with echo
 *     disabled, is never logged and is never written to disk.
 *   - A weak password is refused rather than silently accepted.
 *   - Nothing is created when an account with that email already exists.
 *
 * The password is hashed with bcrypt, using the same cost factor as
 * src/lib/auth.ts.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_PHONE=... ADMIN_ID_NUMBER=... \
 *     node scripts/seed-admin.js
 *
 *   Every variable may be omitted; the script then asks for the missing
 *   value on the terminal. The password prompt never echoes.
 *
 *   ADMIN_FULL_NAME is optional and defaults to "System Administrator".
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const ROOT = path.join(__dirname, '..')

// Matches the cost factor in src/lib/auth.ts.
const BCRYPT_ROUNDS = 10

// The application requires 8 characters in src/lib/auth.ts. An administrator
// account gets a stricter minimum.
const PASSWORD_MIN_LENGTH = 12

// Passwords that are too common to be accepted for a privileged account.
// The old default of this script is in the list on purpose.
const WEAK_PASSWORDS = new Set([
  'admin123',
  'admin1234',
  'admin12345',
  'password',
  'password1',
  'password123',
  'changeme',
  'letmein',
  'welcome1',
  '12345678',
  '123456789',
  'qwerty123',
])

/**
 * Load .env into process.env.
 *
 * Values already present in the environment win, so a shell export always
 * overrides the file. This is the same loader the other scripts use.
 */
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

/**
 * Resolve the connection string.
 *
 * The same order the migration runner and the other scripts use, so the
 * direct endpoint is preferred. There is deliberately NO fallback: a missing
 * connection string must fail loudly rather than retarget a different
 * database.
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

/**
 * Detect a connection pooler.
 *
 * Neon:       ep-xxx-pooler.<region>.aws.neon.tech
 * Supabase:   aws-0-<region>.pooler.supabase.com
 *
 * The host must contain "pooler" as a dot or dash separated word followed by
 * a dot, so a project that happens to be named "pooler-demo" is not mistaken
 * for a pooler endpoint.
 */
function isPooledUrl(connectionString) {
  const { host } = describeTarget(connectionString) || { host: '' }
  const lowerHost = host.toLowerCase()

  if (/(^|[.\-])pooler[.]/.test(lowerHost)) return true
  if (/[?&](pgbouncer|pooled)=true/i.test(connectionString)) return true

  return false
}

/**
 * The terminal interface is shared by every prompt.
 *
 * Creating one interface per prompt is unreliable: each one puts the
 * terminal into raw mode and restores it on close, which can leave buffered
 * input behind. A single interface is created on first use and closed when
 * the script is done, so the process can exit.
 */
let rl = null
let muted = false

function getInterface() {
  if (rl) return rl

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  // Suppress the echo of what the user types while a secret is being read.
  const originalWrite = rl._writeToOutput
  if (typeof originalWrite === 'function') {
    rl._writeToOutput = function (chunk) {
      if (muted) return
      originalWrite.call(this, chunk)
    }
  }

  return rl
}

function closePrompts() {
  if (!rl) return
  try {
    rl.close()
  } catch {
    // The interface is already closed.
  }
  rl = null
}

/** Read a line from the terminal, echoing it. */
function promptVisible(question) {
  return new Promise((resolve) => {
    muted = false
    getInterface().question(question, (answer) => resolve((answer || '').trim()))
  })
}

/**
 * Read a line from the terminal without echoing it.
 *
 * The characters are consumed and discarded, so the password never appears
 * on screen, in the scrollback, or in a terminal recording.
 */
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('A hidden prompt needs a terminal'))
      return
    }

    const iface = getInterface()
    muted = false

    // The question writes the prompt synchronously, so the echo is only
    // suppressed afterwards.
    iface.question(question, (answer) => {
      muted = false
      process.stdout.write('\n')
      resolve(answer)
    })

    muted = true
  })
}

/**
 * Resolve one value from the environment or from a prompt.
 *
 * The environment always wins. A prompt is only offered on a terminal; in a
 * non-interactive run the missing variable is reported by name instead.
 */
async function resolveValue(name, options) {
  const { label, hidden = false, required = true, fallback = null } = options

  const fromEnv = process.env[name]
  if (fromEnv && fromEnv.trim()) {
    if (hidden) {
      console.log(`   Using ${name} from the environment.`)
    }
    return fromEnv.trim()
  }

  if (!process.stdin.isTTY) {
    if (!required) return fallback
    throw new Error(
      `${name} is not set and there is no terminal to prompt on. ` +
        `Set ${name} in the environment and run the script again.`
    )
  }

  const answer = hidden
    ? await promptHidden(`   ${label}: `)
    : await promptVisible(`   ${label}: `)

  const value = (answer || '').trim()

  if (!value) {
    if (!required) return fallback
    throw new Error(`${name} must not be empty.`)
  }

  return value
}

/**
 * Check the password against the policy and return the list of problems.
 */
function passwordProblems(password) {
  const problems = []

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`at least ${PASSWORD_MIN_LENGTH} characters`)
  }
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter')
  if (!/[a-z]/.test(password)) problems.push('a lowercase letter')
  if (!/[0-9]/.test(password)) problems.push('a digit')
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('a symbol')

  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    problems.push('it is not a commonly used password')
  }

  return problems
}

async function seedAdmin() {
  console.log('\n🔐 Creating Admin User...\n')

  const connectionString = resolveConnectionString()

  if (!connectionString) {
    console.error(
      '\n❌ No database connection string found.\n' +
        '   Set DATABASE_URL_DIRECT (or DATABASE_URL) in the environment.\n' +
        '   There is no default target on purpose, so this script can never\n' +
        '   write to a database you did not choose.\n'
    )
    process.exitCode = 1
    return
  }

  const target = describeTarget(connectionString)

  if (!target) {
    console.error(
      '\n❌ The connection string could not be parsed, so the target database\n' +
        '   cannot be verified. Refusing to continue.\n'
    )
    process.exitCode = 1
    return
  }

  if (isPooledUrl(connectionString)) {
    console.error(
      '\n❌ The selected connection string points at a connection POOLER.\n' +
        `   Target: ${target.host}/${target.database}\n` +
        '   Creating an administrator is a one-off setup operation and must\n' +
        '   use the DIRECT (non-pooled) endpoint.\n\n' +
        '   Set DATABASE_URL_DIRECT to the direct connection string and retry.\n'
    )
    process.exitCode = 1
    return
  }

  // The target is shown before anything is read or written.
  console.log(`🎯 Target: host=${target.host} port=${target.port} database=${target.database}\n`)

  let adminEmail
  let adminPhone
  let adminIdNumber
  let adminName
  let adminPassword

  try {
    console.log('📋 Administrator details')
    adminEmail = await resolveValue('ADMIN_EMAIL', { label: 'Email' })
    adminPhone = await resolveValue('ADMIN_PHONE', { label: 'Phone' })
    adminIdNumber = await resolveValue('ADMIN_ID_NUMBER', { label: 'ID number' })
    adminName = await resolveValue('ADMIN_FULL_NAME', {
      label: 'Full name',
      required: false,
      fallback: 'System Administrator',
    })

    console.log('🔑 Initial password')
    adminPassword = await resolveValue('ADMIN_PASSWORD', {
      label: 'Password',
      hidden: true,
    })

    if (!process.env.ADMIN_PASSWORD && process.stdin.isTTY) {
      // Ask for it a second time so a typo cannot lock the account out.
      const confirmation = await promptHidden('   Confirm password: ')
      if (confirmation !== adminPassword) {
        console.error('\n❌ The passwords do not match. Nothing was created.\n')
        process.exitCode = 1
        return
      }
    }
  } finally {
    // The terminal has to be released, otherwise the process never exits.
    closePrompts()
  }

  const problems = passwordProblems(adminPassword)
  if (problems.length > 0) {
    console.error(
      '\n❌ The password does not meet the policy. It needs ' +
        problems.join(', ') + '.\n' +
        '   Nothing was created.\n'
    )
    process.exitCode = 1
    return
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    console.error('\n❌ The email address is not valid. Nothing was created.\n')
    process.exitCode = 1
    return
  }

  if (adminPhone.length > 20) {
    console.error('\n❌ The phone number is too long (max 20 characters).\n')
    process.exitCode = 1
    return
  }

  if (adminIdNumber.length > 50) {
    console.error('\n❌ The ID number is too long (max 50 characters).\n')
    process.exitCode = 1
    return
  }

  const pool = new Pool({ connectionString })

  try {
    // Check if admin already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    )

    if (existing.rows.length > 0) {
      console.log('⚠️  Admin user already exists!')
      console.log('   Email:', adminEmail)
      console.log('   The password was not changed.')
      return
    }

    // Hash password
    const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS)

    // Create admin user
    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
       VALUES ($1, $2, $3, $4, 'admin', $5, true, true)
       RETURNING id, email, full_name, role`,
      [adminEmail, adminPhone, passwordHash, adminName, adminIdNumber]
    )

    console.log('\n✅ Admin user created successfully!\n')
    console.log('📧 Admin account:')
    console.log('   Email:', result.rows[0].email)
    console.log('   Name: ', result.rows[0].full_name)
    console.log('   Role: ', result.rows[0].role)
    console.log('\n🔒 The password was not printed. Change it after the first login.')
  } catch (error) {
    // 23505 is a unique violation. The email check above already covers the
    // email column, so this is the phone number or the ID number.
    if (error && error.code === '23505') {
      console.error(
        '\n❌ A user with that phone number or ID number already exists.\n' +
          '   Nothing was created.\n'
      )
      process.exitCode = 1
      return
    }

    console.error('Error creating admin:', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

seedAdmin()
  .then(() => {
    if (!process.exitCode) {
      console.log('\n✅ Done!\n')
    }
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exitCode = 1
  })

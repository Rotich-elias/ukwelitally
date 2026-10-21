/**
 * Mint a session token for a local development user.
 *
 * The login endpoint is rate limited, which makes it awkward to run a
 * verification script that signs in repeatedly.
 */
const jwt = require('jsonwebtoken')
const fs = require('fs')
const { Pool } = require('pg')

function loadDotEnv() {
  const envPath = __dirname + '/../.env'
  if (!fs.existsSync(envPath)) return
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
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

async function main() {
  const emails = process.argv.slice(2)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const result = await pool.query(
    'SELECT id, email, role FROM users WHERE email = ANY($1::text[])',
    [emails]
  )
  for (const user of result.rows) {
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    )
    console.log(`${user.email} ${token}`)
  }
  await pool.end()
}

main()

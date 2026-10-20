#!/usr/bin/env node

/**
 * Set up a Neon database and wire it into the Vercel project.
 *
 * Uses the Neon CLI (neonctl) to create or find a project, then prints the
 * connection strings and optionally pushes them to Vercel.
 *
 * Prerequisites:
 *   npm install -g neonctl
 *   neonctl auth            # sign in, or export NEON_API_KEY
 *
 * Usage:
 *   node scripts/neon-setup.js                       # create the project, print the URLs
 *   node scripts/neon-setup.js --project my-project  # use an existing project
 *   node scripts/neon-setup.js --push               # also set the Vercel env vars
 *   node scripts/neon-setup.js --region aws-eu-west-1
 */

const { spawnSync } = require('child_process')

const args = process.argv.slice(2)
const flagValue = (name, fallback) => {
  const index = args.indexOf(name)
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback
}
const hasFlag = (name) => args.includes(name)

const PROJECT_NAME = flagValue('--project', 'ukwelitally')
const REGION = flagValue('--region', 'aws-eu-west-1')
const PUSH = hasFlag('--push')

/**
 * Run neonctl. Uses a globally installed binary when present and falls back
 * to npx so the CLI does not have to be installed globally.
 */
function runNeonctl(argsList, { allowFailure = false, input } = {}) {
  const attempts = [
    { cmd: 'neonctl', cmdArgs: argsList },
    { cmd: 'npx', cmdArgs: ['--yes', 'neonctl@8', ...argsList] },
  ]

  let lastResult = null

  for (const attempt of attempts) {
    const result = spawnSync(attempt.cmd, attempt.cmdArgs, {
      encoding: 'utf8',
      stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'],
      input,
    })

    if (result.error && result.error.code === 'ENOENT') {
      lastResult = result
      continue
    }

    if (result.status !== 0 && !allowFailure) {
      console.error(`\n❌ neonctl ${argsList.join(' ')} failed:\n`)
      console.error(result.stderr || result.stdout)
      process.exit(result.status || 1)
    }

    return result
  }

  if (!allowFailure) {
    console.error(
      '\n❌ neonctl could not be run.\n' +
        '   Install it with: npm install -g neonctl\n'
    )
    process.exit(1)
  }

  return lastResult
}

function neonctl(argsList, options = {}) {
  const result = runNeonctl(argsList, options)
  return (result?.stdout || '').trim()
}

function ensureAuth() {
  console.log('🔐 Checking Neon authentication...')
  const result = runNeonctl(['whoami'], { allowFailure: true })

  if (!result || result.status !== 0) {
    console.error(
      '\n❌ Not signed in to Neon.\n' +
        '   Run: neonctl auth\n' +
        '   Or export NEON_API_KEY with a key from https://console.neon.tech/app/settings/api-keys\n'
    )
    process.exit(1)
  }

  console.log(`   ✅ Signed in as ${(result.stdout || '').trim()}`)
}

function findProject() {
  console.log(`🔎 Looking for an existing project named "${PROJECT_NAME}"...`)
  const output = neonctl(
    ['projects', 'list', '--name', PROJECT_NAME, '--output', 'json'],
    { allowFailure: true }
  )

  if (output) {
    try {
      const projects = JSON.parse(output)
      if (Array.isArray(projects) && projects.length > 0) {
        console.log(`   ✅ Found: ${projects[0].name} (${projects[0].id})`)
        return projects[0].id
      }
    } catch {
      // fall through to creation
    }
  }

  console.log('   No existing project found.')
  return null
}

function createProject() {
  console.log(`\n📦 Creating Neon project "${PROJECT_NAME}" in ${REGION}...`)
  const output = neonctl([
    'projects',
    'create',
    '--name',
    PROJECT_NAME,
    '--region',
    REGION,
    '--output',
    'json',
  ])

  try {
    const project = JSON.parse(output)
    console.log(`   ✅ Created: ${project.name} (${project.id})`)
    return project.id
  } catch {
    console.error('   Could not parse the neonctl response.')
    process.exit(1)
  }
}

function connectionStrings(projectId) {
  console.log('\n🔗 Fetching connection strings...')

  const pooled = neonctl([
    'connection-string',
    projectId,
    '--pooled',
    '--output',
    'json',
  ])
  const direct = neonctl(['connection-string', projectId, '--output', 'json'])

  const parse = (raw) => {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed[0]?.connection_string : parsed?.connection_string
    } catch {
      return raw
    }
  }

  return { pooled: parse(pooled), direct: parse(direct) }
}

function pushToVercel(pooled, direct) {
  console.log('\n☁️  Setting Vercel environment variables...')

  const vars = [
    ['DATABASE_URL', pooled],
    ['DATABASE_URL_DIRECT', direct],
  ]

  for (const [key, value] of vars) {
    console.log(`   Setting ${key}...`)
    const result = spawnSync(
      'vercel',
      ['env', 'add', key, 'production', '--force'],
      { input: value, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] }
    )

    if (result.error) {
      if (result.error.code === 'ENOENT') {
        console.error(
          '\n   ⚠️  vercel CLI not found. Install it with: npm install -g vercel\n' +
            '      then run: vercel link\n'
        )
        return false
      }
      throw result.error
    }

    if (result.status !== 0) {
      console.error(`   ❌ Failed to set ${key}`)
      return false
    }
  }

  console.log('   ✅ Done')
  return true
}

function main() {
  console.log('\n🔮 UkweliTally Neon setup\n')
  console.log('============================\n')

  ensureAuth()

  let projectId = findProject()
  if (!projectId) {
    projectId = createProject()
  }

  const { pooled, direct } = connectionStrings(projectId)

  if (!pooled || !direct) {
    console.error('\n❌ Could not obtain the connection strings.')
    process.exit(1)
  }

  console.log('\n📋 Connection strings:\n')
  console.log('   Pooled (use this as DATABASE_URL):')
  console.log(`     ${pooled}\n`)
  console.log('   Direct (use this as DATABASE_URL_DIRECT for migrations):')
  console.log(`     ${direct}\n`)

  console.log('📝 Next steps:\n')
  console.log('   1. Add these to Vercel -> Settings -> Environment Variables')
  console.log('      (Production, Preview and Development):')
  console.log('        DATABASE_URL           = <pooled>')
  console.log('        DATABASE_URL_DIRECT    = <direct>')
  console.log('        JWT_SECRET             = <openssl rand -base64 32>')
  console.log('        NEXT_PUBLIC_APP_URL    = https://ukwelitally.vercel.app')
  console.log('')
  console.log('   2. Bootstrap the database:')
  console.log(`        DATABASE_URL='${pooled}' \\`)
  console.log(`        DATABASE_URL_DIRECT='${direct}' \\`)
  console.log('        npm run db:bootstrap')
  console.log('')

  if (PUSH) {
    pushToVercel(pooled, direct)
  }

  console.log('✅ Done.\n')
}

main()

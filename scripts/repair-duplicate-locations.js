#!/usr/bin/env node
/**
 * Repair duplicate wards created when a polling-station file spelled a place
 * differently from the seeded list.
 *
 * The problem this fixes
 * ----------------------
 * The electoral geography was seeded with old constituency names ("Mbita",
 * "Suba", "Maragwa", "Ol Jorok") and proper-case ward names with numeric IEBC
 * codes ("Gwassi South", code 1257). A later upload used the official names
 * ("Suba North", "Suba South", "Maragua", "Ol Joro Orok") and uppercase ward
 * names. The importer matches a ward *inside its constituency*, so it could
 * not see the old ward under the old constituency: it created a second ward
 * with a generated code ("GWASSISOUTH") and put every station there. The
 * original ward stayed empty.
 *
 * The same thing happened inside a single constituency when the upload spelled
 * a ward slightly differently ("Alungo gof" / "ALANGO GOF", "Kapckok" /
 * "KAPCHOK").
 *
 * What the repair does
 * --------------------
 * For every duplicate pair it keeps the original ward (the one with the
 * numeric IEBC code) and moves the stations, candidates and volunteer
 * registrations from the duplicate onto it. The duplicate is deleted. If the
 * original ward belongs to a stale constituency that has no stations at all
 * (Mbita, Suba, Maragwa, Ol Jorok), the ward is moved into the official
 * constituency and the stale constituency is deleted once it is empty.
 *
 * Nothing is written unless --apply is passed. The script refuses a pair when
 * it cannot prove which side is the original, when both wards have stations,
 * or when a station would collide.
 *
 * Usage
 * -----
 *   # Review the plan first. Reads only.
 *   node scripts/repair-duplicate-locations.js --county "Homa Bay"
 *
 *   # Apply it, after taking a database backup.
 *   node scripts/repair-duplicate-locations.js --county "Homa Bay" --apply
 *
 *   # All counties with detectable duplicates.
 *   node scripts/repair-duplicate-locations.js --all
 *
 *   # Only one pair, when the automatic plan is ambiguous.
 *   node scripts/repair-duplicate-locations.js \
 *     --keep 4710 --remove 4927 --apply
 *
 * Environment
 * -----------
 *   DATABASE_URL (or DATABASE_URL_DIRECT). A DIRECT connection is preferred,
 *   because the repair runs inside one transaction. A pooled (PgBouncer) URL is
 *   refused unless --allow-pooled is passed.
 */

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']
const DIRECTION_WORDS = new Set(['NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'UPPER', 'LOWER'])

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

function describeTarget(connectionString) {
  let url
  try {
    url = new URL(connectionString)
  } catch {
    return { host: '(unparseable)', database: '(unparseable)', parseable: false }
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return { host: '(unparseable)', database: '(unparseable)', parseable: false }
  }
  let database = ''
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  } catch {
    database = url.pathname.replace(/^\//, '')
  }
  return { host: url.hostname || '', database: database || '(default)', parseable: true }
}

function isPooledUrl(connectionString) {
  const { host } = describeTarget(connectionString)
  const lower = host.toLowerCase()
  if (/(^|[.\-])pooler[.]/.test(lower)) return true
  if (/[?&](pgbouncer|pooled)=true/i.test(connectionString)) return true
  return false
}

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

function resolveSslMode(connectionString) {
  const explicit = (process.env.DATABASE_SSL || '').trim().toLowerCase()
  if (explicit) {
    if (['false', '0', 'disable'].includes(explicit)) return 'disable'
    if (['true', '1', 'require'].includes(explicit)) return 'require'
    if (explicit === 'verify-ca' || explicit === 'verify-full') return explicit
    if (explicit === 'no-verify') return 'no-verify'
  }
  const existing = /[?&]sslmode=([^&]*)/i.exec(connectionString)
  if (existing) return existing[1].toLowerCase()
  const { host } = describeTarget(connectionString)
  if (!host || LOCAL_HOSTS.includes(host.toLowerCase())) return null
  return 'require'
}

function normalizeConnectionString(connectionString, sslmode) {
  if (!sslmode) return connectionString
  const [base, query] = connectionString.split('?')
  const params = query ? query.split('&').filter((p) => !/^sslmode=/i.test(p)) : []
  params.push(`sslmode=${sslmode}`)
  return `${base}?${params.join('&')}`
}

// ---------------------------------------------------------------------------
// Name matching. This mirrors src/lib/locationAdmin.ts:
//   - case, punctuation and word order are ignored (sorted key)
//   - spaces and punctuation are ignored too (compact key)
// On top of that this script allows a small spelling difference (one or two
// letters) and a directional suffix ("Ruma Kaksingri" / "Ruma Kaksingri East"),
// because names typed from different IEBC files differ that way.
// ---------------------------------------------------------------------------

function normalizeName(value) {
  return (value || '')
    .normalize('NFKD')
    .replace(/['\u2019`]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function sortedKey(value) {
  return normalizeName(value).split(' ').filter(Boolean).sort().join(' ')
}

function compactKey(value) {
  return normalizeName(value).replace(/ /g, '')
}

function tokens(value) {
  return normalizeName(value).split(' ').filter(Boolean)
}

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let previous = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const current = [i]
    for (let j = 1; j <= n; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[n]
}

function similarity(a, b) {
  const A = compactKey(a)
  const B = compactKey(b)
  if (!A || !B) return 0
  if (A === B) return 1

  let score = 1 - levenshtein(A, B) / Math.max(A.length, B.length)

  // "Ruma Kaksingri East" vs "Ruma Kaksingri": the only extra word is a
  // direction. Both sides must not carry a direction, otherwise Gwassi North
  // and Gwassi South would look alike.
  const ta = tokens(a)
  const tb = tokens(b)
  const hasDirection = (list) => list.some((token) => DIRECTION_WORDS.has(token))
  const baseA = ta.filter((token) => !DIRECTION_WORDS.has(token)).sort().join(' ')
  const baseB = tb.filter((token) => !DIRECTION_WORDS.has(token)).sort().join(' ')
  if (baseA && baseA === baseB && (!hasDirection(ta) || !hasDirection(tb))) {
    score = Math.max(score, 0.93)
  }

  // "Basi Central" vs "Bobasi Central" and "Majoge" vs "Majoge Basi".
  if (
    (A.includes(B) || B.includes(A)) &&
    Math.min(A.length, B.length) >= 5
  ) {
    score = Math.max(score, 0.9)
  }

  return score
}

function isNumericCode(code) {
  return /^[0-9]+$/.test((code || '').trim())
}

// ---------------------------------------------------------------------------
// Loading and planning
// ---------------------------------------------------------------------------

async function loadCounty(client, countyName) {
  const { rows } = await client.query(
    `SELECT id, name FROM counties WHERE lower(name) = lower($1)`,
    [countyName]
  )
  if (rows.length !== 1) {
    throw new Error(
      rows.length === 0
        ? `County "${countyName}" not found`
        : `County "${countyName}" is ambiguous (${rows.length} rows)`
    )
  }
  return rows[0]
}

async function loadGeography(client, countyId) {
  const { rows } = await client.query(
    `SELECT w.id, w.name, w.code, w.constituency_id, w.county_id,
            c.name AS constituency_name, c.code AS constituency_code,
            (SELECT COUNT(*) FROM polling_stations ps WHERE ps.ward_id = w.id)::int
              AS stations,
            (SELECT COUNT(*) FROM polling_stations ps WHERE ps.constituency_id = w.constituency_id)::int
              AS constituency_stations,
            (SELECT COUNT(*) FROM wards x WHERE x.constituency_id = w.constituency_id)::int
              AS constituency_wards
       FROM wards w
       JOIN constituencies c ON c.id = w.constituency_id
      WHERE w.county_id = $1
      ORDER BY w.id`,
    [countyId]
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    constituencyId: row.constituency_id,
    constituencyName: row.constituency_name,
    constituencyCode: row.constituency_code,
    stations: row.stations,
    constituencyStations: row.constituency_stations,
    constituencyWards: row.constituency_wards,
    numeric: isNumericCode(row.code),
  }))
}

function groupByName(wards) {
  const groups = []
  const used = new Set()

  for (const ward of wards) {
    if (used.has(ward.id)) continue
    const group = [ward]
    used.add(ward.id)

    for (const other of wards) {
      if (used.has(other.id)) continue
      const matches =
        sortedKey(ward.name) === sortedKey(other.name) ||
        compactKey(ward.name) === compactKey(other.name)
      if (matches) {
        group.push(other)
        used.add(other.id)
      }
    }

    groups.push(group)
  }

  return groups
}

function planGroup(group, wardsById) {
  const empty = group.filter((ward) => ward.stations === 0)
  const populated = group.filter((ward) => ward.stations > 0)
  if (!empty.length || !populated.length) return { pairs: [], notes: [] }

  const pairs = []
  const notes = []
  const constituencies = new Set(group.map((ward) => ward.constituencyId))

  if (constituencies.size === 1) {
    // Same constituency: the original is the empty ward with the numeric code.
    const keepers = empty.filter((ward) => ward.numeric)
    if (keepers.length !== 1 || populated.length !== 1) {
      notes.push(
        `Skipped "${group[0].name}" in ${group[0].constituencyName}: ` +
          `${keepers.length} numeric-code empty ward(s), ${populated.length} populated ward(s)`
      )
      return { pairs, notes }
    }
    pairs.push({ keeper: keepers[0], duplicate: populated[0], reason: 'same constituency' })
    return { pairs, notes }
  }

  // Different constituencies. Two safe cases are handled here.
  if (populated.length === 1) {
    const duplicate = populated[0]
    const stale = empty.filter((ward) => ward.constituencyStations === 0)
    const other = empty.filter((ward) => ward.constituencyStations > 0)

    if (stale.length === empty.length) {
      // Every original ward belongs to a constituency that has no stations at
      // all: the constituency itself was renamed by the upload (Mbita ->
      // Suba North, Maragwa -> Maragua).
      for (const keeper of empty) {
        if (!keeper.numeric) {
          notes.push(`Skipped "${keeper.name}" (${keeper.constituencyName}): its code "${keeper.code}" is not numeric`)
          continue
        }
        pairs.push({ keeper, duplicate, reason: 'stale constituency' })
      }
      return { pairs, notes }
    }

    if (empty.length === 1 && other.length === 1) {
      const keeper = other[0]
      if (keeper.numeric && !duplicate.numeric && compactKey(keeper.name) === compactKey(duplicate.name)) {
        // The ward was uploaded into the wrong constituency ("Libehia" was put
        // in Mandera East while the original sits in Lafey). Keep the original
        // where it is and bring the stations back.
        pairs.push({ keeper, duplicate, reason: 'wrong constituency' })
        return { pairs, notes }
      }
    }

    notes.push(
      `Skipped "${group[0].name}": spans ${constituencies.size} constituencies and cannot be paired safely`
    )
    return { pairs, notes }
  }

  notes.push(
    `Skipped "${group[0].name}": more than one populated ward in different constituencies`
  )
  return { pairs, notes }
}

/**
 * Second pass for spelling differences that the exact keys do not catch.
 * Only an empty numeric-code ward can be the original, and only a populated
 * generated-code ward can be the duplicate. When two candidates score almost
 * the same the pair is reported instead of guessed.
 */
function planFuzzyPairs(wards, alreadyPaired) {
  const pairs = []
  const notes = []
  const pairedKeepers = new Set(alreadyPaired.map((pair) => pair.keeper.id))

  for (const keeper of wards) {
    if (keeper.stations !== 0 || !keeper.numeric || pairedKeepers.has(keeper.id)) continue

    const candidates = wards
      .filter((ward) => {
        if (ward.stations <= 0 || ward.numeric) return false
        if (ward.id === keeper.id) return false
        return true
      })
      .map((ward) => ({ ward, score: similarity(keeper.name, ward.name) }))
      .filter((entry) => entry.score >= 0.84)
      .sort((a, b) => b.score - a.score)

    if (!candidates.length) continue

    const best = candidates[0]
    const runnerUp = candidates[1]
    if (runnerUp && best.score - runnerUp.score < 0.03) {
      notes.push(
        `Skipped "${keeper.name}" (${keeper.constituencyName}): ` +
          `"${best.ward.name}" and "${runnerUp.ward.name}" both match`
      )
      continue
    }

    const sameConstituency = best.ward.constituencyId === keeper.constituencyId
    const keeperConstituencyIsStale = keeper.constituencyStations === 0

    if (!sameConstituency && !keeperConstituencyIsStale) {
      // Only an exact compact match may cross a healthy constituency, and only
      // when the duplicate has a generated code (the "Libehia" case).
      if (compactKey(keeper.name) !== compactKey(best.ward.name)) continue
    }

    pairs.push({
      keeper,
      duplicate: best.ward,
      reason: sameConstituency ? 'same constituency (spelling)' : 'stale constituency (spelling)',
    })
    pairedKeepers.add(keeper.id)
  }

  return { pairs, notes }
}

function buildPlan(wards) {
  const byId = new Map(wards.map((ward) => [ward.id, ward]))
  const groups = groupByName(wards)
  const pairs = []
  const notes = []

  for (const group of groups) {
    const result = planGroup(group, byId)
    pairs.push(...result.pairs)
    notes.push(...result.notes)
  }

  const fuzzy = planFuzzyPairs(wards, pairs)
  pairs.push(...fuzzy.pairs)
  notes.push(...fuzzy.notes)

  // A keeper must never be reused, and a duplicate must never be removed twice.
  const seenKeepers = new Set()
  const seenDuplicates = new Set()
  const unique = []
  for (const pair of pairs) {
    if (seenKeepers.has(pair.keeper.id) || seenDuplicates.has(pair.duplicate.id)) {
      notes.push(
        `Skipped "${pair.keeper.name}" -> "${pair.duplicate.name}": pair overlaps another pair`
      )
      continue
    }
    seenKeepers.add(pair.keeper.id)
    seenDuplicates.add(pair.duplicate.id)
    unique.push(pair)
  }

  return { pairs: unique, notes }
}

/**
 * A stale constituency is one that has no stations at all. After its wards
 * have been moved out, it is empty and can be deleted. Every pair that leaves
 * such a constituency must point at the same destination.
 */
function planStaleConstituencies(pairs, wards) {
  const byCon = new Map()
  for (const ward of wards) {
    if (!byCon.has(ward.constituencyId)) {
      byCon.set(ward.constituencyId, {
        id: ward.constituencyId,
        name: ward.constituencyName,
        code: ward.constituencyCode,
        stations: ward.constituencyStations,
        wards: 0,
      })
    }
    byCon.get(ward.constituencyId).wards += 1
  }

  const moved = new Map()
  for (const pair of pairs) {
    if (pair.keeper.constituencyId === pair.duplicate.constituencyId) continue
    const destination = pair.duplicate.constituencyId
    const source = pair.keeper.constituencyId
    if (!moved.has(source)) moved.set(source, new Set())
    moved.get(source).add(destination)
  }

  const deletions = []
  for (const [sourceId, destinations] of moved) {
    const source = byCon.get(sourceId)
    if (!source || source.stations > 0) continue
    if (destinations.size !== 1) continue
    const destinationId = [...destinations][0]
    const destination = byCon.get(destinationId)
    deletions.push({
      id: source.id,
      name: source.name,
      code: source.code,
      destinationId,
      destinationName: destination ? destination.name : String(destinationId),
    })
  }

  return deletions
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

async function backup(client, plan, countyName) {
  const wardIds = plan.pairs.flatMap((pair) => [pair.keeper.id, pair.duplicate.id])
  const duplicateIds = plan.pairs.map((pair) => pair.duplicate.id)
  const conIds = [
    ...new Set([
      ...plan.pairs.flatMap((pair) => [pair.keeper.constituencyId, pair.duplicate.constituencyId]),
      ...plan.staleConstituencies.map((row) => row.id),
      ...plan.staleConstituencies.map((row) => row.destinationId),
    ]),
  ]

  const wards = await client.query(
    `SELECT id, name, code, constituency_id, county_id, registered_voters
       FROM wards WHERE id = ANY($1::int[]) ORDER BY id`,
    [wardIds]
  )
  const constituencies = await client.query(
    `SELECT id, name, code, county_id, registered_voters
       FROM constituencies WHERE id = ANY($1::int[]) ORDER BY id`,
    [conIds]
  )
  const stations = await client.query(
    `SELECT id, name, code, stream, ward_id, constituency_id, county_id, registered_voters
       FROM polling_stations WHERE ward_id = ANY($1::int[]) ORDER BY id`,
    [duplicateIds]
  )
  const counts = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM candidates WHERE ward_id = ANY($1::int[]))::int AS candidate_wards,
       (SELECT COUNT(*) FROM candidates WHERE constituency_id = ANY($2::int[]))::int AS candidate_constituencies,
       (SELECT COUNT(*) FROM volunteer_registrations WHERE ward_id = ANY($1::int[]))::int AS volunteer_wards,
       (SELECT COUNT(*) FROM volunteer_registrations WHERE constituency_id = ANY($2::int[]))::int AS volunteer_constituencies`,
    [wardIds, conIds]
  )

  const payload = {
    created_at: new Date().toISOString(),
    county: countyName,
    plan,
    wards: wards.rows,
    constituencies: constituencies.rows,
    stations: stations.rows,
    counts: counts.rows[0],
  }

  const dir = path.join(__dirname, '..', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(
    dir,
    `repair-${countyName.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`
  )
  fs.writeFileSync(file, JSON.stringify(payload, null, 2))
  return { file, counts: counts.rows[0], stations: stations.rows.length, wards: wards.rows.length }
}

async function applyPlan(client, plan, countyName) {
  const before = await backup(client, plan, countyName)
  console.log(
    `\nBackup written to ${before.file} ` +
      `(${before.wards} wards, ${before.stations} stations, ` +
      `${before.counts.candidate_wards} candidate ward links, ` +
      `${before.counts.volunteer_wards} volunteer ward links)`
  )

  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('ukwelitally.bulk_import', 'on', true)`)
    let stationsMoved = 0

    for (const pair of plan.pairs) {
      const keeper = pair.keeper
      const duplicate = pair.duplicate
      const destination =
        keeper.constituencyId === duplicate.constituencyId
          ? keeper.constituencyId
          : keeper.constituencyStations === 0
            ? duplicate.constituencyId
            : keeper.constituencyId

      // Re-check the pair inside the transaction. The dry run may be minutes
      // old and another operator may have changed the rows.
      const check = await client.query(
        `SELECT w.id, w.constituency_id,
                (SELECT COUNT(*) FROM polling_stations ps WHERE ps.ward_id = w.id)::int AS stations
           FROM wards w WHERE w.id = ANY($1::int[]) ORDER BY w.id`,
        [[keeper.id, duplicate.id]]
      )
      const keeperRow = check.rows.find((row) => row.id === keeper.id)
      const duplicateRow = check.rows.find((row) => row.id === duplicate.id)
      if (!keeperRow || !duplicateRow) {
        throw new Error(`Ward ${!keeperRow ? keeper.id : duplicate.id} no longer exists`)
      }
      if (keeperRow.stations !== 0) {
        throw new Error(`Ward ${keeper.id} (${keeper.name}) now has ${keeperRow.stations} stations; refusing to merge`)
      }
      if (duplicateRow.stations === 0) {
        throw new Error(`Ward ${duplicate.id} (${duplicate.name}) no longer has stations; refusing to merge`)
      }

      const collision = await client.query(
        `SELECT name, COALESCE(stream, '') AS stream
           FROM polling_stations
          WHERE ward_id = ANY($1::int[])
          GROUP BY name, COALESCE(stream, '')
         HAVING COUNT(*) > 1
          LIMIT 1`,
        [[keeper.id, duplicate.id]]
      )
      if (collision.rows.length) {
        throw new Error(
          `Station "${collision.rows[0].name}" would collide in ward ${keeper.id}; refusing to merge`
        )
      }

      const moved = await client.query(
        `UPDATE polling_stations
            SET ward_id = $1, constituency_id = $3
          WHERE ward_id = $2`,
        [keeper.id, duplicate.id, destination]
      )
      stationsMoved += moved.rowCount

      await client.query('UPDATE candidates SET ward_id = $1 WHERE ward_id = $2', [
        keeper.id,
        duplicate.id,
      ])
      await client.query(
        'UPDATE volunteer_registrations SET ward_id = $1 WHERE ward_id = $2',
        [keeper.id, duplicate.id]
      )

      if (keeper.constituencyId !== destination) {
        await client.query(
          `UPDATE wards
              SET constituency_id = $1,
                  county_id = (SELECT county_id FROM constituencies WHERE id = $1)
            WHERE id = $2`,
          [destination, keeper.id]
        )
      }

      await client.query('DELETE FROM wards WHERE id = $1', [duplicate.id])
      console.log(
        `  merged ${duplicate.stations} station(s) from "${duplicate.name}" (${duplicate.code}) ` +
          `into "${keeper.name}" (${keeper.code})`
      )
    }

    for (const stale of plan.staleConstituencies) {
      const remaining = await client.query(
        `SELECT
           (SELECT COUNT(*) FROM wards WHERE constituency_id = $1)::int AS wards,
           (SELECT COUNT(*) FROM polling_stations WHERE constituency_id = $1)::int AS stations`,
        [stale.id]
      )
      const left = remaining.rows[0]
      if (left.wards !== 0 || left.stations !== 0) {
        throw new Error(
          `Constituency ${stale.id} (${stale.name}) still has ${left.wards} ward(s) and ` +
            `${left.stations} station(s); refusing to delete it`
        )
      }

      await client.query(
        'UPDATE candidates SET constituency_id = $1 WHERE constituency_id = $2',
        [stale.destinationId, stale.id]
      )
      await client.query(
        'UPDATE volunteer_registrations SET constituency_id = $1 WHERE constituency_id = $2',
        [stale.destinationId, stale.id]
      )
      await client.query('DELETE FROM constituencies WHERE id = $1', [stale.id])
      console.log(
        `  removed stale constituency "${stale.name}" (${stale.code}); ` +
          `its rows now belong to "${stale.destinationName}"`
      )
    }

    const rolled = await client.query('SELECT * FROM sync_registered_voters_from_stations()')
    await client.query('COMMIT')
    console.log(
      `\nApplied: ${plan.pairs.length} pair(s), ${stationsMoved} station(s) moved, ` +
        `${plan.staleConstituencies.length} stale constituency(ies) removed.`
    )
    if (rolled.rows[0]) {
      console.log(
        `Voter totals rolled up: ${rolled.rows[0].counties_updated} counties, ` +
          `${rolled.rows[0].constituencies_updated} constituencies, ` +
          `${rolled.rows[0].wards_updated} wards.`
      )
    }
  } catch (error) {
    // A dropped connection has already rolled the transaction back on the
    // server. ROLLBACK would only fail again and hide the real error.
    try {
      await client.query('ROLLBACK')
    } catch {}
    throw error
  }
}

// ---------------------------------------------------------------------------
// Manual pair mode
// ---------------------------------------------------------------------------

async function loadPair(client, keepId, removeId) {
  const { rows } = await client.query(
    `SELECT w.id, w.name, w.code, w.constituency_id, w.county_id,
            c.name AS constituency_name, c.code AS constituency_code,
            (SELECT COUNT(*) FROM polling_stations ps WHERE ps.ward_id = w.id)::int AS stations,
            (SELECT COUNT(*) FROM polling_stations ps WHERE ps.constituency_id = w.constituency_id)::int AS constituency_stations,
            (SELECT COUNT(*) FROM wards x WHERE x.constituency_id = w.constituency_id)::int AS constituency_wards
       FROM wards w JOIN constituencies c ON c.id = w.constituency_id
      WHERE w.id = ANY($1::int[])`,
    [[keepId, removeId]]
  )
  const toWard = (row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    constituencyId: row.constituency_id,
    constituencyName: row.constituency_name,
    constituencyCode: row.constituency_code,
    stations: row.stations,
    constituencyStations: row.constituency_stations,
    constituencyWards: row.constituency_wards,
    numeric: isNumericCode(row.code),
  })
  const keeper = rows.find((row) => row.id === keepId)
  const duplicate = rows.find((row) => row.id === removeId)
  if (!keeper || !duplicate) throw new Error('Both --keep and --remove must be existing ward ids')
  return { keeper: toWard(keeper), duplicate: toWard(duplicate), reason: 'manual' }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { apply: false, all: false, allowPooled: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    else if (arg === '--all') args.all = true
    else if (arg === '--allow-pooled') args.allowPooled = true
    else if (arg === '--county') args.county = argv[++i]
    else if (arg.startsWith('--county=')) args.county = arg.slice('--county='.length)
    else if (arg === '--keep') args.keep = Number(argv[++i])
    else if (arg.startsWith('--keep=')) args.keep = Number(arg.slice('--keep='.length))
    else if (arg === '--remove') args.remove = Number(argv[++i])
    else if (arg.startsWith('--remove=')) args.remove = Number(arg.slice('--remove='.length))
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function printHelp() {
  console.log(`
Repair duplicate wards left by a polling-station upload.

  node scripts/repair-duplicate-locations.js --county "Homa Bay"
  node scripts/repair-duplicate-locations.js --county "Homa Bay" --apply
  node scripts/repair-duplicate-locations.js --all
  node scripts/repair-duplicate-locations.js --keep 4710 --remove 4927 --apply

Without --apply the script only reads and prints the plan.
Set DATABASE_URL (a direct, non-pooled connection is preferred).
`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Neon suspends an idle compute and the first connection can take longer than
 * the socket timeout. Those failures are safe to retry: the repair is either
 * not started or was rolled back by the server.
 */
function isTransientError(error) {
  const code = error && error.code
  const message = String((error && error.message) || '')
  return (
    [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EPIPE',
      'EHOSTUNREACH',
      'ENETUNREACH',
      '57P01',
      '57P02',
      '57P03',
    ].includes(code) ||
    /timeout|connection terminated|connection error|server closed the connection/i.test(message)
  )
}

async function runOnce(args, connectionString, sslmode, attempt) {
  const target = describeTarget(connectionString)
  console.log(
    `Target: ${target.host}/${target.database}` +
      `${args.apply ? '  [WRITE MODE]' : '  [dry run]'}` +
      `${attempt > 1 ? `  (attempt ${attempt})` : ''}`
  )

  const pool = new Pool({
    connectionString: normalizeConnectionString(connectionString, sslmode),
    max: 1,
    connectionTimeoutMillis: 30000,
  })

  let client
  try {
    client = await pool.connect()
    const plans = []

    if (args.keep && args.remove) {
      const pair = await loadPair(client, args.keep, args.remove)
      plans.push({
        county: {
          id: (
            await client.query('SELECT county_id FROM wards WHERE id = $1', [pair.keeper.id])
          ).rows[0].county_id,
          name: 'manual',
        },
        pairs: [pair],
        notes: [],
        staleConstituencies: [],
      })
    } else if (args.all) {
      const { rows: counties } = await client.query('SELECT id, name FROM counties ORDER BY name')
      for (const county of counties) {
        const wards = await loadGeography(client, county.id)
        const plan = buildPlan(wards)
        if (!plan.pairs.length) continue
        plans.push({
          county,
          pairs: plan.pairs,
          notes: plan.notes,
          staleConstituencies: planStaleConstituencies(plan.pairs, wards),
        })
      }
    } else {
      if (!args.county) {
        console.error('Pass --county "<name>", --all, or --keep/--remove. See --help.')
        process.exit(1)
      }
      const county = await loadCounty(client, args.county)
      const wards = await loadGeography(client, county.id)
      const plan = buildPlan(wards)
      plans.push({
        county,
        pairs: plan.pairs,
        notes: plan.notes,
        staleConstituencies: planStaleConstituencies(plan.pairs, wards),
      })
    }

    let totalPairs = 0
    for (const plan of plans) {
      totalPairs += plan.pairs.length
      console.log(`\n=== ${plan.county.name} ===`)
      if (!plan.pairs.length) console.log('  No duplicate pairs detected.')
      for (const pair of plan.pairs) {
        console.log(
          `  keep  ${pair.keeper.id}  ${JSON.stringify(pair.keeper.name)} ` +
            `(${pair.keeper.code}) in ${pair.keeper.constituencyName}` +
            `  [${pair.keeper.stations} stations]`
        )
        console.log(
          `  merge ${pair.duplicate.id}  ${JSON.stringify(pair.duplicate.name)} ` +
            `(${pair.duplicate.code}) in ${pair.duplicate.constituencyName}` +
            `  [${pair.duplicate.stations} stations]  <- ${pair.reason}`
        )
      }
      for (const stale of plan.staleConstituencies) {
        console.log(
          `  delete constituency ${stale.id} ${JSON.stringify(stale.name)} (${stale.code}); ` +
            `keeps its rows in ${JSON.stringify(stale.destinationName)}`
        )
      }
      for (const note of plan.notes) console.log(`  note: ${note}`)
    }

    if (!totalPairs) {
      console.log('\nNothing to do.')
      return
    }

    if (!args.apply) {
      console.log(
        `\nDry run: ${totalPairs} pair(s) would be merged. ` +
          'Take a database backup, then re-run with --apply.'
      )
      return
    }

    for (const plan of plans) {
      await applyPlan(client, plan, plan.county.name)
    }
  } finally {
    if (client) {
      try {
        client.release()
      } catch {}
    }
    try {
      await pool.end()
    } catch {}
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  loadDotEnv()
  const connectionString = resolveConnectionString()
  if (!connectionString) {
    console.error('No database connection string. Set DATABASE_URL and try again.')
    process.exit(1)
  }

  if (isPooledUrl(connectionString) && !args.allowPooled) {
    console.error(
      'The connection string points at a pooler. Use the direct URL ' +
        '(DATABASE_URL_DIRECT) or pass --allow-pooled deliberately.'
    )
    process.exit(1)
  }

  const sslmode = resolveSslMode(connectionString)
  if (
    sslmode === 'no-verify' &&
    !LOCAL_HOSTS.includes(describeTarget(connectionString).host.toLowerCase())
  ) {
    console.error('Refusing a remote connection with certificate verification disabled (sslmode=no-verify).')
    process.exit(1)
  }

  const maxAttempts = 4
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runOnce(args, connectionString, sslmode, attempt)
      return
    } catch (error) {
      if (!isTransientError(error) || attempt === maxAttempts) throw error
      const wait = 3000 * attempt
      console.error(
        `Transient database error (${error.code || error.message || 'timeout'}). ` +
          `Retrying in ${Math.round(wait / 1000)}s...`
      )
      await sleep(wait)
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\nRepair failed: ${error.message}`)
    process.exit(1)
  })
}

module.exports = {
  buildPlan,
  planStaleConstituencies,
  similarity,
  normalizeName,
  sortedKey,
  compactKey,
  isNumericCode,
}

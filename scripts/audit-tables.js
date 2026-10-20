#!/usr/bin/env node
/**
 * Static table audit (read-only).
 *
 * Lists every table the application references in SQL and reports any that
 * the migrations do not create.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MIGRATIONS = path.join(ROOT, 'src', 'db', 'migrations')

const created = new Set()
for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql'))) {
  const sql = fs
    .readFileSync(path.join(MIGRATIONS, f), 'utf8')
    .replace(/--.*$/gm, '')
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi
  let m
  while ((m = re.exec(sql)) !== null) created.add(m[1].toLowerCase())
}

const KEYWORDS = new Set(
  `select where and or set values on from join into update table not exists coalesce count sum max min now current_timestamp case when then else end left inner outer group order by limit offset having union all distinct as using returning insert delete with lateral nulls first last asc desc over partition filter within cast array true false null in is between like ilike similar greatest least`.split(
    /\s+/
  )
)

const refs = new Map()

/** Extract only SQL string literals so prose in comments is not scanned. */
function extractSqlStrings(content) {
  const chunks = []
  const isSql = (s) =>
    /\bSELECT\b[\s\S]*\bFROM\b/i.test(s) ||
    /\bINSERT\s+INTO\b/i.test(s) ||
    /\bUPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+SET\b/i.test(s) ||
    /\bDELETE\s+FROM\b/i.test(s)

  const templateRe = /`([\s\S]*?)`/g
  let m
  while ((m = templateRe.exec(content)) !== null) {
    if (isSql(m[1])) chunks.push(m[1])
  }
  const quoteRe = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g
  while ((m = quoteRe.exec(content)) !== null) {
    if (isSql(m[2])) chunks.push(m[2])
  }
  return chunks
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(full)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8')
      for (const sql of extractSqlStrings(content)) {
        const re = /\b(?:FROM|JOIN|INTO|UPDATE)\s+([A-Za-z_][A-Za-z0-9_]*)/gi
        let m
        while ((m = re.exec(sql)) !== null) {
          const table = m[1].toLowerCase()
          if (KEYWORDS.has(table)) continue
          if (!refs.has(table)) refs.set(table, new Set())
          refs.get(table).add(path.relative(ROOT, full))
        }
      }
    }
  }
}
walk(path.join(ROOT, 'src'))

console.log('\n=== Tables/views created by migrations ===')
console.log('  ' + [...created].sort().join(', '))

console.log('\n=== Tables referenced by app SQL but NOT created by migrations ===')
let missing = 0
for (const [table, files] of [...refs.entries()].sort()) {
  if (created.has(table)) continue
  console.log(`  ❌ ${table}`)
  for (const f of files) console.log(`       ${f}`)
  missing++
}
if (missing === 0) console.log('  (none)')
console.log('')

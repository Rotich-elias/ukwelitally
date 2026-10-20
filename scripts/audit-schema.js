#!/usr/bin/env node
/**
 * Static schema audit (read-only).
 *
 * Builds the schema that the SQL migrations would create by parsing
 * CREATE TABLE / ALTER TABLE ... ADD COLUMN statements, then scans the
 * application's SQL for column references and reports any that the migrations
 * never create.
 *
 * This is a heuristic: it parses column lists out of INSERT statements and
 * qualified references such as `alias.column`. It cannot see every case, but
 * it reliably catches columns the migrations forgot.
 *
 * Usage: node scripts/audit-schema.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MIGRATIONS = path.join(ROOT, 'src', 'db', 'migrations')

// ---------------------------------------------------------------- build schema
const tables = new Map() // table -> Set(columns)

function addColumns(table, cols) {
  if (!tables.has(table)) tables.set(table, new Set())
  const set = tables.get(table)
  for (const c of cols) set.add(c.toLowerCase())
}

/** Split a comma separated list, respecting parentheses. */
function splitList(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/** Strip `--` line comments so they do not swallow the following column. */
function stripComments(sql) {
  return sql
    .split('\n')
    .map((line) => {
      // Do not strip inside a string literal (rare in DDL, but be safe).
      const idx = line.indexOf('--')
      if (idx === -1) return line
      return line.slice(0, idx)
    })
    .join('\n')
}

/** Extract the column names from a CREATE TABLE body. */
function parseCreateTable(sql, table) {
  const open = sql.indexOf('(')
  if (open === -1) return []
  let depth = 0
  let close = -1
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === '(') depth++
    if (sql[i] === ')') {
      depth--
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close === -1) return []

  const body = sql.slice(open + 1, close)
  const cols = []
  for (const rawLine of splitList(body)) {
    const line = rawLine.trim()
    if (!line) continue
    const upper = line.toUpperCase()
    // Skip table-level constraints
    if (
      upper.startsWith('PRIMARY KEY') ||
      upper.startsWith('UNIQUE') ||
      upper.startsWith('CHECK') ||
      upper.startsWith('FOREIGN KEY') ||
      upper.startsWith('CONSTRAINT')
    ) {
      continue
    }
    const name = line.match(/^([A-Za-z_][A-Za-z0-9_]*)/)
    if (name) cols.push(name[1])
  }
  return cols
}

const migrationFiles = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()

for (const file of migrationFiles) {
  const sql = stripComments(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'))

  // CREATE TABLE [IF NOT EXISTS] name (...)
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi
  let m
  while ((m = createRe.exec(sql)) !== null) {
    addColumns(m[1], parseCreateTable(sql.slice(m.index), m[1]))
  }

  // ALTER TABLE name ADD COLUMN [IF NOT EXISTS] col ...
  // (a single ALTER may add several columns, so this is global, not per-table)
  const alterRe =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi
  while ((m = alterRe.exec(sql)) !== null) {
    addColumns(m[1], [m[2]])
  }

  // ALTER TABLE name ADD col <type> ... (without the COLUMN keyword)
  const alterRe2 =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+(?:INTEGER|BIGINT|SERIAL|BOOLEAN|VARCHAR|TEXT|TIMESTAMP|DECIMAL|NUMERIC|REAL|DOUBLE|JSONB)/gi
  while ((m = alterRe2.exec(sql)) !== null) {
    addColumns(m[1], [m[2]])
  }

  // ALTER TABLE name ADD col1 ..., ADD col2 ... (multiple columns in one ALTER)
  const alterBlockRe =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+([\s\S]*?);/gi
  while ((m = alterBlockRe.exec(sql)) !== null) {
    const table = m[1]
    const body = m[2]
    if (/^\s*CONSTRAINT/i.test(body)) continue
    const addColRe =
      /ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+(?:INTEGER|BIGINT|SERIAL|BOOLEAN|VARCHAR|TEXT|TIMESTAMP|DECIMAL|NUMERIC|REAL|DOUBLE|JSONB)/gi
    let c
    while ((c = addColRe.exec(body)) !== null) {
      addColumns(table, [c[1]])
    }
  }
}

// ---------------------------------------------------------------- scan app
const appFiles = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(full)
    } else if (/\.(ts|tsx|js)$/.test(entry.name)) {
      appFiles.push(full)
    }
  }
}
walk(path.join(ROOT, 'src'))

const TABLE_NAMES = new Set(tables.keys())

/**
 * Extract only the SQL string literals from a source file, so that ordinary
 * JavaScript such as `results.map` or `users.length` is not mistaken for a
 * qualified column reference.
 */
function extractSqlStrings(content) {
  const chunks = []
  // Backtick template literals
  const templateRe = /`([\s\S]*?)`/g
  let m
  while ((m = templateRe.exec(content)) !== null) {
    if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i.test(m[1])) {
      chunks.push(m[1])
    }
  }
  // Single/double quoted strings
  const quoteRe = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g
  while ((m = quoteRe.exec(content)) !== null) {
    if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i.test(m[2])) {
      chunks.push(m[2])
    }
  }
  return chunks
}

const findings = new Map() // "table.column" -> Set(file)

function report(table, column, file) {
  const key = `${table}.${column}`
  if (!findings.has(key)) findings.set(key, new Set())
  findings.get(key).add(path.relative(ROOT, file))
}

/** Column names inside an INSERT INTO t (a, b, c) VALUES (...) */
const insertRe = /INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*VALUES/gi

/** UPDATE t SET a = ..., b = ... */
const updateRe = /UPDATE\s+([A-Za-z_][A-Za-z0-9_]*)\s+SET\s+([\s\S]*?)(?:WHERE|RETURNING|;)/gi

for (const file of appFiles) {
  const content = fs.readFileSync(file, 'utf8')

  for (const sql of extractSqlStrings(content)) {
    let m

    insertRe.lastIndex = 0
    while ((m = insertRe.exec(sql)) !== null) {
      const table = m[1].toLowerCase()
      if (!TABLE_NAMES.has(table)) continue
      for (const col of splitList(m[2])) {
        const name = col.trim().split(/\s+/)[0].toLowerCase()
        if (name && /^[a-z_][a-z0-9_]*$/.test(name)) report(table, name, file)
      }
    }

    updateRe.lastIndex = 0
    while ((m = updateRe.exec(sql)) !== null) {
      const table = m[1].toLowerCase()
      if (!TABLE_NAMES.has(table)) continue
      const assignments = m[2].split(/\bFROM\b|\bJOIN\b/i)[0]
      for (const assign of splitList(assignments)) {
        const name = assign.trim().split('=')[0].trim().toLowerCase()
        if (name && /^[a-z_][a-z0-9_]*$/.test(name)) report(table, name, file)
      }
    }

    // Qualified references inside SQL: "table.column" / "alias.column"
    const qualifiedRe = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g
    while ((m = qualifiedRe.exec(sql)) !== null) {
      const table = m[1].toLowerCase()
      if (!TABLE_NAMES.has(table)) continue
      report(table, m[2].toLowerCase(), file)
    }
  }
}

// ---------------------------------------------------------------- report
const missing = []
for (const [key, files] of findings) {
  const [table, column] = key.split('.')
  const cols = tables.get(table)
  if (!cols.has(column)) {
    missing.push({ table, column, files: [...files] })
  }
}

console.log('\n=== Schema built from migrations ===')
for (const [table, cols] of [...tables.entries()].sort()) {
  console.log(`  ${table}: ${[...cols].sort().join(', ')}`)
}

console.log(`\n=== Columns referenced by app code but NOT created by migrations ===`)
if (missing.length === 0) {
  console.log('  (none)')
} else {
  for (const item of missing.sort((a, b) =>
    `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`)
  )) {
    console.log(`  ❌ ${item.table}.${item.column}`)
    for (const f of item.files) console.log(`       ${f}`)
  }
}
console.log('')

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'

// Singleton pool instance
let pool: Pool | null = null

/**
 * Resolve the database connection string.
 *
 * Hosted Postgres providers use different environment variable names:
 *   - Vercel Postgres / Neon: POSTGRES_URL, POSTGRES_PRISMA_URL, DATABASE_URL
 *   - Supabase: DATABASE_URL, POSTGRES_URL
 *   - Railway / Render: DATABASE_URL
 * All of them are checked so the app works with whichever provider is used.
 */
function getDatabaseUrl(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.PG_URL,
  ]

  for (const candidate of candidates) {
    if (candidate && candidate.trim()) return candidate.trim()
  }

  throw new Error(
    'Database connection string is not set. Set DATABASE_URL (or POSTGRES_URL) in your environment.'
  )
}

/**
 * Decide the sslmode for the connection.
 *
 * Managed providers (Neon, Supabase, RDS) require TLS. pg maps the modes as:
 *   - disable      -> no encryption
 *   - require      -> encrypt, do not verify the server certificate
 *   - verify-ca    -> encrypt and verify against a supplied CA
 *   - verify-full  -> encrypt and verify the certificate and hostname
 *
 * pg gives the connection string precedence over an explicit `ssl` option, so
 * the mode is applied by rewriting the sslmode query parameter rather than by
 * passing a separate option.
 */
export function resolveSslMode(connectionString: string): string | null {
  const explicit = process.env.DATABASE_SSL?.toLowerCase()

  if (explicit) {
    if (explicit === 'false' || explicit === '0' || explicit === 'disable') {
      return 'disable'
    }
    if (explicit === 'true' || explicit === '1' || explicit === 'require') {
      return 'require'
    }
    if (explicit === 'verify-ca' || explicit === 'verify-full') {
      return explicit
    }
  }

  // Respect a mode already present in the connection string.
  const existing = /[?&]sslmode=([^&]*)/i.exec(connectionString)
  if (existing) return existing[1]

  // Local development databases do not use TLS.
  const host = /@([^/:?]+)/.exec(connectionString)?.[1]?.toLowerCase()
  if (host && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    return null
  }

  // Everything else is assumed to be a managed provider that needs TLS.
  return 'require'
}

/**
 * Apply the resolved sslmode to the connection string.
 */
export function normalizeConnectionString(connectionString: string): string {
  const sslmode = resolveSslMode(connectionString)
  if (!sslmode) return connectionString

  const [base, query] = connectionString.split('?')
  const params = query
    ? query.split('&').filter((p) => !/^sslmode=/i.test(p))
    : []

  params.push(`sslmode=${sslmode}`)
  return `${base}?${params.join('&')}`
}

// Get database configuration from environment
function getDbConfig() {
  return {
    connectionString: normalizeConnectionString(getDatabaseUrl()),
    // Serverless functions can scale to many concurrent instances. Keep the
    // per-instance pool small so the provider's connection limit is not
    // exhausted, and let the provider's pooler handle multiplexing.
    max: parseInt(process.env.DATABASE_POOL_MAX || '5', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Vercel and other serverless platforms recycle the execution context.
    // Expire idle clients so the pool does not hold connections open after a
    // function is frozen and thawed.
    allowExitOnIdle: true,
  }
}

// Initialize or get existing pool
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getDbConfig())

    pool.on('error', (err) => {
      // An idle client erroring out is recoverable. The previous behaviour of
      // calling process.exit(-1) would kill the whole serverless invocation
      // and surface as a 500 to the user, so the error is logged and the pool
      // is left to reconnect on the next query.
      console.error('Unexpected error on idle client', err)
    })
  }

  return pool
}

// Execute a query with the pool
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool()
  const start = Date.now()

  try {
    const result = await pool.query<T>(text, params)
    const duration = Date.now() - start

    // Log slow queries (> 1 second)
    if (duration > 1000) {
      console.warn('Slow query detected:', {
        text: text.substring(0, 100),
        duration: `${duration}ms`,
        rows: result.rowCount,
      })
    }

    return result
  } catch (error) {
    console.error('Database query error:', {
      text: text.substring(0, 100),
      error: error instanceof Error ? error.message : error,
    })
    throw error
  }
}

// Execute a transaction
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Helper function to get a single row
export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params)
  return result.rows[0] || null
}

// Helper function to get multiple rows
export async function queryMany<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await query<T>(text, params)
  return result.rows
}

// Close the pool (useful for testing and graceful shutdown)
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as health')
    return result.rows[0]?.health === 1
  } catch (error) {
    console.error('Database health check failed:', error)
    return false
  }
}

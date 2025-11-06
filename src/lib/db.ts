import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'

// Singleton pool instance
let pool: Pool | null = null

// Get database configuration from environment
function getDbConfig() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  return {
    connectionString: databaseUrl,
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
}

// Initialize or get existing pool
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getDbConfig())

    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err)
      process.exit(-1)
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

// Close the pool (useful for testing)
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

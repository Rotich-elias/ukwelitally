import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { normalizeConnectionString, resolveSslMode } from '@/lib/db'

describe('resolveSslMode', () => {
  beforeEach(() => {
    delete process.env.DATABASE_SSL
  })

  afterEach(() => {
    delete process.env.DATABASE_SSL
  })

  it('defaults to require for managed providers', () => {
    expect(
      resolveSslMode('postgresql://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/neondb')
    ).toBe('require')
  })

  it('defaults to require for Supabase style hosts', () => {
    expect(
      resolveSslMode('postgresql://postgres:pass@db.abcdefg.supabase.co:5432/postgres')
    ).toBe('require')
  })

  it('does not use TLS for local development hosts', () => {
    expect(resolveSslMode('postgresql://user:pass@localhost:5432/ukwelitally')).toBeNull()
    expect(resolveSslMode('postgresql://user:pass@127.0.0.1:5432/ukwelitally')).toBeNull()
  })

  it('keeps an sslmode already present in the connection string', () => {
    expect(
      resolveSslMode('postgresql://u:p@host/db?sslmode=verify-full')
    ).toBe('verify-full')
    expect(resolveSslMode('postgresql://u:p@host/db?sslmode=disable')).toBe('disable')
  })

  it('lets DATABASE_SSL override the connection string', () => {
    process.env.DATABASE_SSL = 'disable'
    expect(resolveSslMode('postgresql://u:p@host/db?sslmode=require')).toBe('disable')

    process.env.DATABASE_SSL = 'require'
    expect(resolveSslMode('postgresql://u:p@host/db?sslmode=disable')).toBe('require')
  })

  it('supports verify-ca and verify-full overrides', () => {
    process.env.DATABASE_SSL = 'verify-full'
    expect(resolveSslMode('postgresql://u:p@host/db')).toBe('verify-full')
  })
})

describe('normalizeConnectionString', () => {
  beforeEach(() => {
    delete process.env.DATABASE_SSL
  })

  afterEach(() => {
    delete process.env.DATABASE_SSL
  })

  it('adds sslmode=require to a Neon pooled connection string', () => {
    const result = normalizeConnectionString(
      'postgresql://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/neondb'
    )
    expect(result).toBe(
      'postgresql://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
    )
  })

  it('keeps an existing sslmode and does not duplicate it', () => {
    const result = normalizeConnectionString(
      'postgresql://u:p@host/db?sslmode=disable&application_name=ukwelitally'
    )
    expect(result).toBe(
      'postgresql://u:p@host/db?application_name=ukwelitally&sslmode=disable'
    )
    expect(result.match(/sslmode=/g)).toHaveLength(1)
  })

  it('lets DATABASE_SSL replace an existing sslmode', () => {
    process.env.DATABASE_SSL = 'require'
    const result = normalizeConnectionString(
      'postgresql://u:p@host/db?sslmode=disable&application_name=ukwelitally'
    )
    expect(result).toBe(
      'postgresql://u:p@host/db?application_name=ukwelitally&sslmode=require'
    )
  })

  it('preserves other query parameters', () => {
    const result = normalizeConnectionString(
      'postgresql://u:p@host/db?application_name=ukwelitally&channel_binding=require'
    )
    expect(result).toContain('application_name=ukwelitally')
    expect(result).toContain('channel_binding=require')
    expect(result).toContain('sslmode=require')
  })

  it('leaves local development connection strings untouched', () => {
    const url = 'postgresql://ukwelitally:pass@localhost:5432/ukwelitally'
    expect(normalizeConnectionString(url)).toBe(url)
  })

  it('does not alter the credentials', () => {
    const result = normalizeConnectionString(
      'postgresql://my%40user:p%40ss%3Aword@host/db'
    )
    expect(result).toContain('my%40user:p%40ss%3Aword')
  })
})

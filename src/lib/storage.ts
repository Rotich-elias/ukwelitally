import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { existsSync } from 'fs'

/**
 * File storage abstraction.
 *
 * Local disk works in development but NOT on serverless platforms: Vercel
 * function instances have an ephemeral, read-only-ish filesystem where files
 * written by one invocation are not visible to the next. Uploaded election
 * evidence would silently vanish.
 *
 * This module resolves a storage backend at runtime:
 *   - Vercel Blob  (BLOB_READ_WRITE_TOKEN)          -> production on Vercel
 *   - S3 compatible (S3_BUCKET + S3_* credentials)    -> AWS / R2 / Supabase
 *   - Local disk                                      -> development
 *
 * The returned object always exposes the same interface, so the rest of the
 * app does not care which backend is in use.
 */

export interface StoredFile {
  /** Key used to retrieve the file later. */
  key: string
  /** Publicly reachable URL, when the backend provides one. */
  url: string | null
}

export interface StorageBackend {
  readonly name: 'vercel-blob' | 's3' | 'local'
  /** Persist a buffer under the given key. */
  put(key: string, data: Buffer, contentType: string): Promise<StoredFile>
  /** Read a file back. Returns null when it does not exist. */
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/ukwelitally-uploads'

/**
 * Resolve the public base URL for locally stored files.
 * Local storage is served through the /api/uploads route.
 */
function localPublicUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || ''
  return `${base}/api/uploads/${key}`
}

/**
 * Local disk backend. Files are stored under UPLOAD_DIR.
 */
const localStorage: StorageBackend = {
  name: 'local',

  async put(key: string, data: Buffer): Promise<StoredFile> {
    const fullPath = join(UPLOAD_DIR, key)
    const dir = dirname(fullPath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    await writeFile(fullPath, data)
    return { key, url: localPublicUrl(key) }
  },

  async get(key: string) {
    const fullPath = join(UPLOAD_DIR, key)
    if (!existsSync(fullPath)) return null

    const data = await readFile(fullPath)
    return { data, contentType: contentTypeFromKey(key) }
  },
}

/**
 * Vercel Blob backend. Requires the BLOB_READ_WRITE_TOKEN environment
 * variable, which is available when the Vercel Blob store is connected to
 * the project.
 */
function createVercelBlobBackend(): StorageBackend | null {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null

  // Imported lazily so the dependency is only required when it is used.
  const { put, get } = require('@vercel/blob')

  return {
    name: 'vercel-blob',

    async put(key: string, data: Buffer): Promise<StoredFile> {
      const result = await put(key, data, {
        access: 'public',
        contentType: contentTypeFromKey(key),
        // Allow overwriting so a retried upload does not fail.
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      return { key, url: result.url }
    },

    async get(key: string) {
      const result = await get(key, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      if (!result) return null

      const data = Buffer.from(await result.arrayBuffer())
      return { data, contentType: result.contentType || contentTypeFromKey(key) }
    },
  }
}

/**
 * S3 compatible backend (AWS S3, Cloudflare R2, Supabase Storage).
 */
function createS3Backend(): StorageBackend | null {
  const bucket = process.env.S3_BUCKET
  const region = process.env.S3_REGION || process.env.AWS_REGION
  if (!bucket || !region) return null

  const hasCredentials =
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    process.env.S3_ACCESS_KEY_ID ||
    process.env.S3_ENDPOINT

  if (!hasCredentials) return null

  // Imported lazily so the dependency is only required when it is used.
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
  } = require('@aws-sdk/client-s3')

  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY

  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials:
      accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  })

  const publicBase = process.env.S3_PUBLIC_URL

  return {
    name: 's3',

    async put(key: string, data: Buffer, contentType: string): Promise<StoredFile> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        })
      )
      const url = publicBase
        ? `${publicBase.replace(/\/$/, '')}/${key}`
        : `https://${bucket}.s3.${region}.amazonaws.com/${key}`
      return { key, url }
    },

    async get(key: string) {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key })
        )
        if (!result.Body) return null

        const bytes = await result.Body.transformToByteArray()
        return {
          data: Buffer.from(bytes),
          contentType: result.ContentType || contentTypeFromKey(key),
        }
      } catch (error: any) {
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
          return null
        }
        throw error
      }
    },
  }
}

/**
 * Guess the content type from a file key.
 */
export function contentTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
  }
  return types[ext || ''] || 'application/octet-stream'
}

let backend: StorageBackend | null = null

/**
 * Get the active storage backend.
 */
export function getStorage(): StorageBackend {
  if (backend) return backend

  // Vercel Blob takes priority because it is the native option when running
  // on Vercel and needs no extra configuration.
  backend =
    createVercelBlobBackend() ||
    createS3Backend() ||
    localStorage

  console.log(`[storage] Using ${backend.name} backend`)

  return backend
}

/**
 * Reset the cached backend. Used by tests.
 */
export function resetStorage(): void {
  backend = null
}

/**
 * Build a publicly reachable URL for a stored file.
 *
 * Object storage backends expose files directly, so their own URL is used.
 * The local backend is served through the /api/uploads route.
 */
export function getFileUrl(key: string): string {
  const normalized = key.replace(/^\/+/, '')

  // A stored file may already be an absolute URL (e.g. migrated records).
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized
  }

  const storage = getStorage()

  if (storage.name === 'vercel-blob') {
    const base = process.env.BLOB_PUBLIC_BASE_URL
    if (base) return `${base.replace(/\/$/, '')}/${normalized}`
  }

  if (storage.name === 's3') {
    const base = process.env.S3_PUBLIC_URL
    if (base) return `${base.replace(/\/$/, '')}/${normalized}`
  }

  return `/api/uploads/${normalized}`
}

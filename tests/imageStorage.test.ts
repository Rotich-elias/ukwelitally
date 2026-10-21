import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  contentTypeFromKey,
  getEvidenceUrl,
  getFileUrl,
  getStorage,
  isPublicKey,
  isServerlessRuntime,
  resetStorage,
} from '@/lib/storage'

/**
 * The file storage layer.
 *
 * The platform stores candidate photos and submission evidence. Candidate
 * photos are public, submission evidence is not, and a file that is not in
 * storage any more has to be reported instead of breaking the page.
 */

const TEST_DIR = path.join('/tmp', 'ukwelitally-storage-test')

describe('isPublicKey', () => {
  it('treats candidate photos as public', () => {
    expect(isPublicKey('candidate-photos/1234-photo.jpg')).toBe(true)
    expect(isPublicKey('/candidate-photos/1234-photo.jpg')).toBe(true)
  })

  it('treats submission evidence as private', () => {
    expect(isPublicKey('submission-42/1234-photo.jpg')).toBe(false)
    expect(isPublicKey('anything-else/photo.jpg')).toBe(false)
  })
})

describe('getFileUrl and getEvidenceUrl', () => {
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.S3_BUCKET
    delete process.env.S3_REGION
    delete process.env.S3_ACCESS_KEY_ID
    delete process.env.S3_SECRET_ACCESS_KEY
    delete process.env.S3_ENDPOINT
    resetStorage()
  })

  afterEach(() => {
    resetStorage()
  })

  it('serves a local file through the upload route', () => {
    expect(getFileUrl('candidate-photos/photo.jpg')).toBe('/api/uploads/candidate-photos/photo.jpg')
  })

  it('normalises a leading slash', () => {
    expect(getFileUrl('/candidate-photos/photo.jpg')).toBe('/api/uploads/candidate-photos/photo.jpg')
  })

  it('keeps an absolute url unchanged', () => {
    expect(getFileUrl('https://cdn.example.com/photo.jpg')).toBe('https://cdn.example.com/photo.jpg')
  })

  it('serves evidence through the authorized route', () => {
    expect(getEvidenceUrl(42)).toBe('/api/submission-photos/42')
  })
})

describe('the local backend', () => {
  const previousUploadDir = process.env.UPLOAD_DIR

  beforeEach(() => {
    process.env.UPLOAD_DIR = TEST_DIR
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.S3_BUCKET
    delete process.env.S3_REGION
    resetStorage()
  })

  afterEach(() => {
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR
    else process.env.UPLOAD_DIR = previousUploadDir
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
    resetStorage()
  })

  it('stores a file and reads it back', async () => {
    const storage = getStorage()
    const data = Buffer.from('hello world')

    const stored = await storage.put('candidate-photos/test.txt', data, 'text/plain')

    expect(stored.key).toBe('candidate-photos/test.txt')
    expect(fs.existsSync(path.join(TEST_DIR, 'candidate-photos/test.txt'))).toBe(true)

    const read = await storage.get('candidate-photos/test.txt')
    expect(read?.data.toString()).toBe('hello world')
  })

  it('reports a missing file instead of throwing', async () => {
    const storage = getStorage()

    const read = await storage.get('candidate-photos/missing.txt')

    expect(read).toBeNull()
  })

  it('is not durable, so a serverless upload is refused', async () => {
    const storage = getStorage()
    expect(storage.durable).toBe(false)
  })
})

describe('isServerlessRuntime', () => {
  const previousVercel = process.env.VERCEL

  afterEach(() => {
    if (previousVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = previousVercel
  })

  it('detects a serverless platform', () => {
    process.env.VERCEL = '1'
    expect(isServerlessRuntime()).toBe(true)
  })

  it('is false on a normal machine', () => {
    delete process.env.VERCEL
    expect(isServerlessRuntime()).toBe(false)
  })
})

describe('contentTypeFromKey', () => {
  it('maps the image types the platform accepts', () => {
    expect(contentTypeFromKey('photo.jpg')).toBe('image/jpeg')
    expect(contentTypeFromKey('photo.PNG')).toBe('image/png')
    expect(contentTypeFromKey('photo.webp')).toBe('image/webp')
  })

  it('falls back to a generic type', () => {
    expect(contentTypeFromKey('data.bin')).toBe('application/octet-stream')
  })
})

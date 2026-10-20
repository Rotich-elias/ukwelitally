import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { contentTypeFromKey, getFileUrl, getStorage, resetStorage } from '@/lib/storage'

describe('contentTypeFromKey', () => {
  it('maps known image extensions', () => {
    expect(contentTypeFromKey('photo.jpg')).toBe('image/jpeg')
    expect(contentTypeFromKey('photo.JPEG')).toBe('image/jpeg')
    expect(contentTypeFromKey('photo.png')).toBe('image/png')
    expect(contentTypeFromKey('photo.webp')).toBe('image/webp')
  })

  it('falls back to a generic type', () => {
    expect(contentTypeFromKey('data.bin')).toBe('application/octet-stream')
    expect(contentTypeFromKey('noextension')).toBe('application/octet-stream')
  })
})

describe('getStorage', () => {
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

  it('falls back to local disk when no cloud storage is configured', () => {
    expect(getStorage().name).toBe('local')
  })
})

describe('getFileUrl', () => {
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    delete process.env.S3_BUCKET
    delete process.env.S3_REGION
    delete process.env.S3_PUBLIC_URL
    resetStorage()
  })

  afterEach(() => {
    resetStorage()
  })

  it('serves local files through the uploads route', () => {
    expect(getFileUrl('/submissions/photo.jpg')).toBe('/api/uploads/submissions/photo.jpg')
  })

  it('handles keys without a leading slash', () => {
    expect(getFileUrl('candidate-photos/pic.png')).toBe('/api/uploads/candidate-photos/pic.png')
  })

  it('passes absolute URLs through unchanged', () => {
    const url = 'https://cdn.example.com/photo.jpg'
    expect(getFileUrl(url)).toBe(url)
  })

  it('uses the S3 public base URL when configured', () => {
    process.env.S3_BUCKET = 'bucket'
    process.env.S3_REGION = 'auto'
    process.env.S3_ACCESS_KEY_ID = 'key'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    process.env.S3_PUBLIC_URL = 'https://cdn.example.com/'
    resetStorage()

    expect(getFileUrl('/candidate-photos/pic.png')).toBe(
      'https://cdn.example.com/candidate-photos/pic.png'
    )
  })
})

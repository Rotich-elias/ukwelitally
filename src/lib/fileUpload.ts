import { writeFile, mkdir } from 'fs/promises'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import crypto from 'crypto'
import sharp from 'sharp'
import { getStorage, getUploadDir, isServerlessRuntime } from '@/lib/storage'

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB default

/**
 * Refuse to store a file on a platform that cannot keep it.
 *
 * On a serverless platform the local filesystem is ephemeral: a file written
 * by one invocation is gone by the next. Storing election evidence there
 * would look like it worked and then disappear, so the upload is rejected
 * with an explanation instead.
 */
function assertDurableBackend(): void {
  const storage = getStorage()
  if (storage.durable) return
  if (!isServerlessRuntime()) return

  throw new Error(
    'No durable file storage is configured, so uploaded files would be lost. ' +
      'Set BLOB_READ_WRITE_TOKEN (Vercel Blob) or S3_BUCKET with S3_REGION and ' +
      'S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY, then try again.'
  )
}

// Ensure upload directory exists
export async function ensureUploadDir() {
  const dir = getUploadDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

// Generate unique filename with hash
export function generateFilename(originalName: string): string {
  const ext = originalName.split('.').pop()
  const timestamp = Date.now()
  const random = crypto.randomBytes(8).toString('hex')
  return `${timestamp}-${random}.${ext}`
}

// Calculate file hash (SHA-256)
export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// Validate file type (only images allowed)
export function isValidImageType(mimeType: string): boolean {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  return allowedTypes.includes(mimeType.toLowerCase())
}

// Validate file size
export function isValidFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE
}

// Extract EXIF data from image
export async function extractExifData(buffer: Buffer): Promise<Record<string, any> | null> {
  try {
    const metadata = await sharp(buffer).metadata()
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      exif: metadata.exif,
      orientation: metadata.orientation,
    }
  } catch (error) {
    console.error('Error extracting EXIF:', error)
    return null
  }
}

// Compress and optimize image
export async function compressImage(
  buffer: Buffer,
  maxWidth: number = 1920,
  quality: number = 85
): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize(maxWidth, null, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality })
      .toBuffer()
  } catch (error) {
    console.error('Error compressing image:', error)
    throw error
  }
}

// Save uploaded file
export async function saveUploadedFile(
  file: File,
  subdir: string = 'submissions'
): Promise<{
  filePath: string
  fileSize: number
  mimeType: string
  hash: string
  width: number | null
  height: number | null
  exifData: Record<string, any> | null
}> {
  await ensureUploadDir()

  // Validate file type
  if (!isValidImageType(file.type)) {
    throw new Error('Invalid file type. Only images are allowed.')
  }

  // Get file buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Validate file size
  if (!isValidFileSize(buffer.length)) {
    throw new Error(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`)
  }

  // Calculate hash (for deduplication)
  const hash = calculateFileHash(buffer)

  // Extract EXIF data
  const exifData = await extractExifData(buffer)
  const width = exifData?.width || null
  const height = exifData?.height || null

  // Compress image
  const compressedBuffer = await compressImage(buffer)

  // Generate filename and store via the configured storage backend. On
  // serverless platforms the local filesystem is ephemeral, so writing to
  // disk would lose the evidence.
  const filename = generateFilename(file.name)
  const storageKey = `${subdir}/${filename}`
  const storage = getStorage()
  assertDurableBackend()
  await storage.put(storageKey, compressedBuffer, 'image/jpeg')

  return {
    filePath: `/${storageKey}`, // Store relative path
    fileSize: compressedBuffer.length,
    mimeType: file.type,
    hash,
    width,
    height,
    exifData,
  }
}

// Parse FormData and extract files
export async function parseFormData(request: Request): Promise<{
  fields: Record<string, string>
  files: Record<string, File[]>
}> {
  const formData = await request.formData()
  const fields: Record<string, string> = {}
  const files: Record<string, File[]> = {}

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      if (!files[key]) files[key] = []
      files[key].push(value)
    } else {
      fields[key] = value
    }
  }

  return { fields, files }
}

// Save candidate profile photo (smaller size, optimized for profiles)
export async function saveCandidatePhoto(file: File): Promise<string> {
  await ensureUploadDir()

  // Validate file type
  if (!isValidImageType(file.type)) {
    throw new Error('Invalid file type. Only images (JPEG, PNG, WebP) are allowed.')
  }

  // Get file buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Validate file size (max 5MB for profile photos)
  const maxProfilePhotoSize = 5 * 1024 * 1024
  if (buffer.length > maxProfilePhotoSize) {
    throw new Error('Photo size exceeds 5MB limit')
  }

  // Compress and resize for profile (300x300 max, high quality)
  const compressedBuffer = await sharp(buffer)
    .resize(300, 300, {
      fit: 'cover',
      position: 'center',
    })
    .jpeg({ quality: 90 })
    .toBuffer()

  // Generate filename and store via the configured storage backend
  const filename = generateFilename(file.name)
  const storageKey = `candidate-photos/${filename}`
  const storage = getStorage()
  assertDurableBackend()
  await storage.put(storageKey, compressedBuffer, 'image/jpeg')

  // Return relative path for database storage (consistent with submission photos)
  return `/${storageKey}`
}

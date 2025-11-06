import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import crypto from 'crypto'
import sharp from 'sharp'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/ukwelitally-uploads'
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB default

// Ensure upload directory exists
export async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true })
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

  // Generate filename and full path
  const filename = generateFilename(file.name)
  const subdirPath = join(UPLOAD_DIR, subdir)
  if (!existsSync(subdirPath)) {
    await mkdir(subdirPath, { recursive: true })
  }
  const filePath = join(subdirPath, filename)

  // Save file
  await writeFile(filePath, compressedBuffer)

  return {
    filePath: filePath.replace(UPLOAD_DIR, ''), // Store relative path
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

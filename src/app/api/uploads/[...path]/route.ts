import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/ukwelitally-uploads'

// GET /api/uploads/[...path] - Serve uploaded files
export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Join the path segments
    const filePath = params.path.join('/')

    // Security check: prevent directory traversal
    if (filePath.includes('..') || filePath.includes('~')) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      )
    }

    // Construct full path
    const fullPath = join(UPLOAD_DIR, filePath)

    // Check if file exists
    if (!existsSync(fullPath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    // Read file
    const fileBuffer = await readFile(fullPath)

    // Determine content type based on file extension
    const ext = filePath.split('.').pop()?.toLowerCase()
    const contentType = getContentType(ext || '')

    // Return file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
  }
  return types[ext] || 'application/octet-stream'
}

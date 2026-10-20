import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'

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

    const storage = getStorage()
    const file = await storage.get(filePath)

    // Check if file exists
    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    // Return file with appropriate headers. The buffer is passed through a
    // Uint8Array so it satisfies the Response body type.
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.contentType,
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

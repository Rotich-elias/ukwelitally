import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractTokenFromHeader } from '@/lib/auth'
import { UserRole } from '@/types/database'

// Extend NextRequest to include user info
export interface AuthenticatedRequest extends NextRequest {
  user?: {
    userId: number
    email: string
    role: UserRole
  }
}

// Authentication middleware
export function withAuth(
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    // Extract token from Authorization header
    const authHeader = req.headers.get('authorization')
    const token = extractTokenFromHeader(authHeader)

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Verify token
    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      )
    }

    // Add user info to request
    const authReq = req as AuthenticatedRequest
    authReq.user = payload

    // Call the handler
    return handler(authReq)
  }
}

// Role-based authorization middleware
export function withRole(
  requiredRoles: UserRole[],
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
) {
  return withAuth(async (req: AuthenticatedRequest) => {
    if (!req.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user has required role
    if (!requiredRoles.includes(req.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    return handler(req)
  })
}

// Admin-only middleware
export function withAdmin(
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
) {
  return withRole(['admin'], handler)
}

// Candidate or admin middleware
export function withCandidateOrAdmin(
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
) {
  return withRole(['candidate', 'admin'], handler)
}

// Agent, candidate, or admin middleware
export function withAgentAccess(
  handler: (req: AuthenticatedRequest) => Promise<NextResponse>
) {
  return withRole(['agent', 'candidate', 'admin'], handler)
}

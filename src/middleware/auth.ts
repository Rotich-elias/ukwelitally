import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/authenticate'
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
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any) => {
    // Verify the signature, then re-check the account in the database. The
    // second check rejects deactivated users, changed roles, and tokens that
    // were issued before a password reset.
    const user = await authenticateRequest(req)

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      )
    }

    // Add user info to request
    const authReq = req as AuthenticatedRequest
    authReq.user = {
      userId: user.userId,
      email: user.email,
      role: user.role,
    }

    // Call the handler with context (for route params)
    return handler(authReq, context)
  }
}

// Role-based authorization middleware
export function withRole(
  requiredRoles: UserRole[],
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>
) {
  return withAuth(async (req: AuthenticatedRequest, context?: any) => {
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

    return handler(req, context)
  })
}

// Admin-only middleware
export function withAdmin(
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>
) {
  return withRole(['admin'], handler)
}

// Candidate or admin middleware
export function withCandidateOrAdmin(
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>
) {
  return withRole(['candidate', 'admin'], handler)
}

// Agent, candidate, or admin middleware
export function withAgentAccess(
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>
) {
  return withRole(['agent', 'candidate', 'admin'], handler)
}

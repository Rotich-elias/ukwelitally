import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/middleware/auth'
import { resolveAssignableStations } from '@/lib/agentScope'
import { getClientIp, checkRateLimit, RATE_LIMITS, rateLimitKey } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/candidates/stations
 *
 * The polling stations the signed in candidate may assign an agent to.
 *
 * The scope comes from the candidate's own race and electoral area, so the
 * candidate never has to pick the county, constituency and ward they
 * already belong to. The scope is applied on the server: the response can
 * never contain a station outside the candidate's area.
 *
 * Query parameters:
 *   search          free text over the station name and code
 *   county_id       optional filter (a presidential candidate)
 *   constituency_id optional filter (a presidential candidate)
 *   ward_id         optional filter (a presidential candidate)
 */
async function handleGet(req: NextRequest) {
  try {
    const user = (req as any).user

    if (user.role !== 'candidate') {
      return NextResponse.json(
        { error: 'Only candidates can list the stations they may assign' },
        { status: 403 }
      )
    }

    const limit = checkRateLimit(
      rateLimitKey('candidate-stations', `${user.userId}:${getClientIp(req)}`),
      120,
      60 * 1000
    )
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { searchParams } = new URL(req.url)
    const result = await resolveAssignableStations(user.userId, {
      search: searchParams.get('search'),
      countyId: searchParams.get('county_id') ? parseInt(searchParams.get('county_id')!) : null,
      constituencyId: searchParams.get('constituency_id')
        ? parseInt(searchParams.get('constituency_id')!)
        : null,
      wardId: searchParams.get('ward_id') ? parseInt(searchParams.get('ward_id')!) : null,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
    })

    if (!result) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      scope: {
        position: result.scope.position,
        level: result.scope.level,
        label: result.scope.label,
        national: result.scope.national,
        county_id: result.scope.county_id,
        constituency_id: result.scope.constituency_id,
        ward_id: result.scope.ward_id,
      },
      stations: result.stations,
      count: result.stations.length,
    })
  } catch (error) {
    console.error('Error listing assignable polling stations:', error)
    return NextResponse.json(
      { error: 'Failed to list the polling stations' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet as any)

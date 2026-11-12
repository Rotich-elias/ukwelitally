import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, transaction } from '@/lib/db'
import {
  hashPassword,
  isPublishedPassword,
  isStrongPassword,
  normalizeEmail,
  normalizePhoneNumber,
} from '@/lib/auth'
import { authenticateRequest } from '@/lib/authenticate'
import { validateCandidateLocation } from '@/lib/candidateLocation'

export const dynamic = 'force-dynamic'

// Roles an administrator can create directly. Anything else (a typo, or a
// made-up role) is refused instead of producing an account no route expects.
const CREATABLE_ROLES = ['admin', 'candidate', 'agent', 'observer']

// GET - List all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const decoded = await authenticateRequest(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const role = searchParams.get('role')

    let queryText = `
      SELECT u.id, u.email, u.phone, u.full_name, u.role, u.verified, u.active, u.created_at,
             CASE
               WHEN u.role = 'candidate' THEN c.id
               WHEN u.role = 'agent' THEN a.id
               ELSE NULL
             END as profile_id,
             c.position,
             c.access_status,
             c.payment_status,
             c.payment_amount,
             c.payment_date
      FROM users u
      LEFT JOIN candidates c ON u.id = c.user_id
      LEFT JOIN agents a ON u.id = a.user_id
      WHERE 1=1
    `
    const params: any[] = []

    if (role) {
      queryText += ` AND u.role = $${params.length + 1}`
      params.push(role)
    }

    queryText += ` ORDER BY u.created_at DESC`

    const result = await query(queryText, params)

    return NextResponse.json({
      success: true,
      data: result.rows,
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

// POST - Create new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const decoded = await authenticateRequest(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const body = await request.json()
    const { email, phone, full_name, role, id_number, password } = body

    // Validate required fields
    if (!email || !phone || !full_name || !role || !id_number || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    if (!CREATABLE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `role must be one of ${CREATABLE_ROLES.join(', ')}` },
        { status: 400 }
      )
    }

    // The same password policy as a reset, so an account cannot be created
    // with a guessable password.
    if (typeof password !== 'string' || isPublishedPassword(password)) {
      return NextResponse.json(
        { error: 'This password is a published example and cannot be used' },
        { status: 400 }
      )
    }
    const strength = isStrongPassword(password)
    if (!strength.valid) {
      return NextResponse.json({ error: strength.errors.join('. ') }, { status: 400 })
    }

    // A candidate's race and area are checked before anything is written.
    // Checking them after inserting the user left an active candidate
    // account without a profile, which several routes treat as "no limits".
    const position = body.position || 'president'
    const { county_id, constituency_id, ward_id } = body
    if (role === 'candidate') {
      if (position === 'mca' && !ward_id) {
        return NextResponse.json(
          { error: 'MCA candidates must be assigned to a specific ward' },
          { status: 400 }
        )
      }
      if (position === 'mp' && !constituency_id) {
        return NextResponse.json(
          { error: 'MP candidates must be assigned to a specific constituency' },
          { status: 400 }
        )
      }
      if ((position === 'governor' || position === 'senator' || position === 'women_rep') && !county_id) {
        return NextResponse.json(
          { error: `${position.replace('_', ' ')} candidates must be assigned to a specific county` },
          { status: 400 }
        )
      }

      // The electoral area rows have to exist, otherwise the insert fails
      // with a foreign key violation and the caller gets a 500.
      const locationCheck = await validateCandidateLocation({
        county_id,
        constituency_id,
        ward_id,
      })
      if (!locationCheck.ok) {
        return NextResponse.json({ error: locationCheck.error }, { status: 400 })
      }
    }

    // Normalize email and phone
    const normalizedEmail = normalizeEmail(email)
    const normalizedPhone = normalizePhoneNumber(phone)

    // Check if user exists
    const existingUser = await queryOne(
      'SELECT id FROM users WHERE email = $1 OR phone = $2 OR id_number = $3',
      [normalizedEmail, normalizedPhone, id_number]
    )

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email, phone, or ID number already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // The user and the candidate profile are created together: a failure
    // leaves neither behind.
    const newUser = await transaction(async (client) => {
      const created = (
        await client.query(
          `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
           VALUES ($1, $2, $3, $4, $5, $6, true, true)
           RETURNING id, email, phone, full_name, role, verified, active, created_at`,
          [normalizedEmail, normalizedPhone, passwordHash, full_name, role, id_number]
        )
      ).rows[0]

      if (role === 'candidate') {
        await client.query(
          `INSERT INTO candidates (user_id, party_name, position, county_id, constituency_id, ward_id, is_system_user)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [
            created.id,
            body.party_name || 'Independent',
            position,
            county_id || null,
            constituency_id || null,
            ward_id || null
          ]
        )
      }

      return created
    })

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        decoded.userId,
        'user_created',
        'user',
        newUser.id,
        JSON.stringify({ role, created_by: 'admin' }),
        request.headers.get('x-forwarded-for') || 'unknown',
      ]
    )

    return NextResponse.json(
      {
        success: true,
        message: 'User created successfully',
        data: newUser,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}

// PUT - Update user (admin only)
export async function PUT(request: NextRequest) {
  try {
    const decoded = await authenticateRequest(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const body = await request.json()
    const { user_id, email, phone, full_name, active, access_status, password } = body

    if (!user_id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Get current user data
    const currentUser = await queryOne('SELECT * FROM users WHERE id = $1', [user_id])
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // An admin cannot deactivate their own account here (the bulk routes
    // already refuse it): a sole admin would lock everyone out. Because the
    // caller is always an active admin, this also guarantees at least one
    // active admin remains after any change made through this route.
    if (currentUser.id === decoded.userId && active === false) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account' },
        { status: 400 }
      )
    }

    // Admins can reset the password of any account without knowing the old
    // one, for example when a user has forgotten it. Passwords are stored as
    // bcrypt hashes, so the old password can never be shown; the admin sets a
    // new one and shares it with the user. The plain-text value is never
    // stored or written to the audit log.
    let passwordChanged = false
    let passwordHash: string | null = null
    if (password !== undefined) {
      if (typeof password !== 'string') {
        return NextResponse.json({ error: 'Password must be a string' }, { status: 400 })
      }

      const strength = isStrongPassword(password)
      if (!strength.valid) {
        return NextResponse.json({ error: strength.errors.join('. ') }, { status: 400 })
      }

      passwordHash = await hashPassword(password)
      passwordChanged = true
    }

    // The purchased access of a candidate is a separate concept from the
    // login account: an account can be active while the subscription is
    // suspended, and the platform administrator controls both.
    let candidateAccessChanged = false
    if (access_status !== undefined) {
      if (!['active', 'suspended', 'revoked'].includes(access_status)) {
        return NextResponse.json(
          { error: 'access_status must be one of active, suspended or revoked' },
          { status: 400 }
        )
      }

      if (currentUser.role !== 'candidate') {
        return NextResponse.json(
          { error: 'Only candidate accounts have purchased access' },
          { status: 400 }
        )
      }

      const currentAccess = await queryOne<{ id: number; access_status: string }>(
        'SELECT id, access_status FROM candidates WHERE user_id = $1',
        [user_id]
      )

      if (!currentAccess) {
        return NextResponse.json(
          { error: 'Candidate profile not found' },
          { status: 404 }
        )
      }

      if (currentAccess.access_status !== access_status) {
        await query(
          'UPDATE candidates SET access_status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [access_status, user_id]
        )
        candidateAccessChanged = true

        await query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
           VALUES ($1, 'candidate_access_changed', 'candidate', $2, $3, $4, $5)`,
          [
            decoded.userId,
            currentAccess.id,
            JSON.stringify({ access_status: currentAccess.access_status }),
            JSON.stringify({ access_status }),
            request.headers.get('x-forwarded-for') || 'unknown',
          ]
        )
      }
    }

    // Build update query dynamically
    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (email) {
      const normalizedEmail = normalizeEmail(email)
      if (normalizedEmail !== currentUser.email) {
        updates.push(`email = $${paramIndex}`)
        params.push(normalizedEmail)
        paramIndex++
      }
    }

    if (phone && phone !== currentUser.phone) {
      const normalizedPhone = normalizePhoneNumber(phone)
      updates.push(`phone = $${paramIndex}`)
      params.push(normalizedPhone)
      paramIndex++
    }

    if (full_name && full_name !== currentUser.full_name) {
      updates.push(`full_name = $${paramIndex}`)
      params.push(full_name)
      paramIndex++
    }

    if (typeof active === 'boolean' && active !== currentUser.active) {
      updates.push(`active = $${paramIndex}`)
      params.push(active)
      paramIndex++
      // Invalidate every existing session for this account, including one
      // that is being reactivated later.
      updates.push('token_version = token_version + 1')
    }

    if (passwordHash) {
      updates.push(`password_hash = $${paramIndex}`)
      params.push(passwordHash)
      paramIndex++
      // A password reset must revoke tokens issued with the old password.
      updates.push('token_version = token_version + 1')
    }

    if (updates.length === 0 && !candidateAccessChanged) {
      return NextResponse.json({ error: 'No changes to update' }, { status: 400 })
    }

    let updatedUser = currentUser
    if (updates.length > 0) {
      params.push(user_id)
      const queryText = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING id, email, phone, full_name, role, verified, active, created_at, updated_at`

      updatedUser = (await queryOne(queryText, params)) ?? currentUser
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        decoded.userId,
        'user_updated',
        'user',
        user_id,
        JSON.stringify({ email: currentUser.email, phone: currentUser.phone, full_name: currentUser.full_name, active: currentUser.active }),
        JSON.stringify({ email, phone, full_name, active, password_changed: passwordChanged }),
        request.headers.get('x-forwarded-for') || 'unknown',
      ]
    )

    const responseUser = updatedUser ?? currentUser
    const { password_hash: _passwordHash, ...safeUser } = responseUser

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      data: safeUser,
    })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

// DELETE - Delete user (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const decoded = await authenticateRequest(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Prevent admin from deleting themselves
    if (parseInt(userId) === decoded.userId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    // Get user before deletion for audit log
    const userToDelete = await queryOne('SELECT * FROM users WHERE id = $1', [userId])
    if (!userToDelete) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Delete related records first (due to foreign key constraints)
    // Delete candidate profile if exists
    await query('DELETE FROM candidates WHERE user_id = $1', [userId])

    // Delete agent profile if exists
    await query('DELETE FROM agents WHERE user_id = $1', [userId])

    // Delete the user
    await query('DELETE FROM users WHERE id = $1', [userId])

    // Audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        decoded.userId,
        'user_deleted',
        'user',
        userId,
        JSON.stringify({ email: userToDelete.email, role: userToDelete.role, full_name: userToDelete.full_name }),
        request.headers.get('x-forwarded-for') || 'unknown',
      ]
    )

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}

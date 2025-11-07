import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { hashPassword, normalizePhoneNumber, generateToken } from '@/lib/auth'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export const dynamic = 'force-dynamic'

// GET - List all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

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
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const body = await request.json()
    const { email, phone, full_name, role, id_number, password } = body

    // Validate required fields
    if (!email || !phone || !full_name || !role || !id_number || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    // Normalize phone
    const normalizedPhone = normalizePhoneNumber(phone)

    // Check if user exists
    const existingUser = await queryOne(
      'SELECT id FROM users WHERE email = $1 OR phone = $2 OR id_number = $3',
      [email, normalizedPhone, id_number]
    )

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email, phone, or ID number already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const newUser = await queryOne(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
       VALUES ($1, $2, $3, $4, $5, $6, true, true)
       RETURNING id, email, phone, full_name, role, verified, active, created_at`,
      [email, normalizedPhone, passwordHash, full_name, role, id_number]
    )

    if (!newUser) {
      throw new Error('Failed to create user')
    }

    // If role is candidate, create candidate profile
    if (role === 'candidate') {
      const position = body.position || 'president'
      const { county_id, constituency_id, ward_id } = body

      // Validate location restrictions based on position
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

      await query(
        `INSERT INTO candidates (user_id, party_name, position, county_id, constituency_id, ward_id, is_system_user)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [
          newUser.id,
          body.party_name || 'Independent',
          position,
          county_id || null,
          constituency_id || null,
          ward_id || null
        ]
      )
    }

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
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const body = await request.json()
    const { user_id, email, phone, full_name, active } = body

    if (!user_id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Get current user data
    const currentUser = await queryOne('SELECT * FROM users WHERE id = $1', [user_id])
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build update query dynamically
    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (email && email !== currentUser.email) {
      updates.push(`email = $${paramIndex}`)
      params.push(email)
      paramIndex++
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
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No changes to update' }, { status: 400 })
    }

    params.push(user_id)
    const queryText = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`

    const updatedUser = await queryOne(queryText, params)

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
        JSON.stringify({ email, phone, full_name, active }),
        request.headers.get('x-forwarded-for') || 'unknown',
      ]
    )

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
    })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

// DELETE - Delete user (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

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

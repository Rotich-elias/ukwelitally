import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    // Verify admin role
    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const userId = parseInt(params.id)
    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Invalid user ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      expected_payment_amount,
      payment_amount,
      payment_method,
      payment_reference,
      payment_notes,
      payment_date,
    } = body

    // Check if user exists and is a candidate
    const userResult = await query(
      'SELECT id, role FROM users WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (userResult.rows[0].role !== 'candidate') {
      return NextResponse.json(
        { error: 'Payment tracking is only available for system user candidates' },
        { status: 400 }
      )
    }

    // Get candidate record (system user candidates only)
    const candidateResult = await query(
      'SELECT id FROM candidates WHERE user_id = $1',
      [userId]
    )

    if (candidateResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Payment tracking is only available for system user candidates, not ballot candidates. This user does not have a candidate profile in the system.' },
        { status: 404 }
      )
    }

    const candidateId = candidateResult.rows[0].id

    // Update expected payment amount if provided
    if (expected_payment_amount !== undefined) {
      await query(
        `UPDATE candidates SET expected_payment_amount = $1 WHERE id = $2`,
        [expected_payment_amount, candidateId]
      )
    }

    // Add individual payment if amount provided
    if (payment_amount && payment_amount > 0) {
      await query(
        `INSERT INTO candidate_payments
         (candidate_id, amount, payment_method, payment_reference, payment_date, recorded_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          candidateId,
          payment_amount,
          payment_method || null,
          payment_reference || null,
          payment_date || new Date().toISOString(),
          decoded.userId,
          payment_notes || null,
        ]
      )
    }

    // Calculate total payments and update status
    const paymentsResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid
       FROM candidate_payments
       WHERE candidate_id = $1`,
      [candidateId]
    )

    const totalPaid = parseFloat(paymentsResult.rows[0].total_paid || 0)

    // Get expected amount
    const candidateInfo = await query(
      `SELECT expected_payment_amount FROM candidates WHERE id = $1`,
      [candidateId]
    )

    const expectedAmount = parseFloat(candidateInfo.rows[0].expected_payment_amount || 0)

    // Auto-calculate payment status
    let newStatus = 'pending'
    if (expectedAmount === 0) {
      newStatus = 'waived'
    } else if (totalPaid >= expectedAmount) {
      newStatus = 'paid'
    } else if (totalPaid > 0) {
      newStatus = 'partial'
    }

    // Update candidate with calculated status and latest payment info
    const updateResult = await query(
      `UPDATE candidates
       SET payment_status = $1,
           payment_amount = $2,
           payment_date = $3
       WHERE id = $4
       RETURNING *`,
      [
        newStatus,
        totalPaid,
        payment_amount > 0 ? new Date().toISOString() : null,
        candidateId,
      ]
    )

    // Get payment history
    const historyResult = await query(
      `SELECT
        cp.*,
        u.full_name as recorded_by_name
       FROM candidate_payments cp
       LEFT JOIN users u ON cp.recorded_by = u.id
       WHERE cp.candidate_id = $1
       ORDER BY cp.created_at DESC`,
      [candidateId]
    )

    return NextResponse.json({
      success: true,
      candidate: updateResult.rows[0],
      total_paid: totalPaid,
      expected_amount: expectedAmount,
      payment_history: historyResult.rows,
    })
  } catch (error) {
    console.error('Payment update error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to update payment information'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string }

    // Verify admin role
    if (decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access only' }, { status: 403 })
    }

    const userId = parseInt(params.id)
    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Invalid user ID' },
        { status: 400 }
      )
    }

    // Get candidate info
    const candidateResult = await query(
      'SELECT id, payment_status, payment_amount, expected_payment_amount FROM candidates WHERE user_id = $1',
      [userId]
    )

    if (candidateResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        payment_history: [],
        total_paid: 0,
        expected_amount: 0,
      })
    }

    const candidateId = candidateResult.rows[0].id

    // Get payment history
    const historyResult = await query(
      `SELECT
        cp.*,
        u.full_name as recorded_by_name
       FROM candidate_payments cp
       LEFT JOIN users u ON cp.recorded_by = u.id
       WHERE cp.candidate_id = $1
       ORDER BY cp.created_at DESC`,
      [candidateId]
    )

    // Calculate total paid
    const totalResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_paid
       FROM candidate_payments
       WHERE candidate_id = $1`,
      [candidateId]
    )

    return NextResponse.json({
      success: true,
      payment_status: candidateResult.rows[0].payment_status,
      total_paid: parseFloat(totalResult.rows[0].total_paid || 0),
      expected_amount: parseFloat(candidateResult.rows[0].expected_payment_amount || 0),
      payment_history: historyResult.rows,
    })
  } catch (error) {
    console.error('Payment history fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500 }
    )
  }
}

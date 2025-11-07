const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ukwelitally:dev_password_123@localhost:5432/ukwelitally',
})

async function seedAdmin() {
  console.log('🔐 Creating Admin User...\n')

  try {
    // Admin credentials
    const adminEmail = 'admin@ukwelitally.com'
    const adminPassword = 'Admin123'
    const adminName = 'System Administrator'
    const adminPhone = '+254700000000'
    const adminIdNumber = '10000000'

    // Check if admin already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    )

    if (existing.rows.length > 0) {
      console.log('⚠️  Admin user already exists!')
      console.log('\n📧 Admin Credentials:')
      console.log('   Email:', adminEmail)
      console.log('   Password: (already set)')
      return
    }

    // Hash password
    const passwordHash = await bcrypt.hash(adminPassword, 10)

    // Create admin user
    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, full_name, role, id_number, verified, active)
       VALUES ($1, $2, $3, $4, 'admin', $5, true, true)
       RETURNING id, email, full_name, role`,
      [adminEmail, adminPhone, passwordHash, adminName, adminIdNumber]
    )

    console.log('✅ Admin user created successfully!\n')
    console.log('📧 Admin Credentials:')
    console.log('   Email:', adminEmail)
    console.log('   Password:', adminPassword)
    console.log('\n🔒 Please change the password after first login!')
    console.log('\n🌐 Login at: http://localhost:3000/login')
    console.log('📊 Admin Dashboard: http://localhost:3000/dashboard/admin')

  } catch (error) {
    console.error('Error creating admin:', error)
    throw error
  } finally {
    await pool.end()
  }
}

seedAdmin()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

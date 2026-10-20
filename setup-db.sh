#!/bin/bash

# UkweliTally - Local Database Setup Script
# Run this script to set up PostgreSQL for local testing

echo "🚀 UkweliTally Database Setup"
echo "================================"
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed."
    echo ""
    echo "Install it with:"
    echo "  sudo apt update"
    echo "  sudo apt install -y postgresql postgresql-contrib"
    echo "  sudo systemctl start postgresql"
    echo ""
    exit 1
fi

echo "✅ PostgreSQL is installed"
echo ""

# Create database and user
echo "📦 Creating database and user..."
sudo -u postgres psql << EOF
-- Drop existing if any
DROP DATABASE IF EXISTS ukwelitally;
DROP USER IF EXISTS ukwelitally;

-- Create user and database
CREATE USER ukwelitally WITH PASSWORD 'dev_password_123';
CREATE DATABASE ukwelitally OWNER ukwelitally;
GRANT ALL PRIVILEGES ON DATABASE ukwelitally TO ukwelitally;

\c ukwelitally
GRANT ALL ON SCHEMA public TO ukwelitally;

-- Show databases
\l ukwelitally
EOF

echo ""
echo "✅ Database created"
echo ""

# Run migrations
echo "🔧 Running database migrations..."
npm run db:migrate

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migrations completed successfully"
    echo ""

    # Show tables
    echo "📊 Database tables created:"
    PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "\dt"

    echo ""
    echo "✨ Setup Complete!"
    echo ""
    echo "You can now:"
    echo "  1. Start dev server: npm run dev"
    echo "  2. Visit: http://localhost:3000"
    echo "  3. Test API endpoints"
    echo ""
else
    echo ""
    echo "❌ Migration failed. Check errors above."
    exit 1
fi

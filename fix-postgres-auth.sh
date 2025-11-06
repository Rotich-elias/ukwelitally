#!/bin/bash

# UkweliTally - PostgreSQL Authentication Fix Script
# This script configures PostgreSQL to use password authentication for ukwelitally user

echo "🔧 Fixing PostgreSQL Authentication"
echo "===================================="
echo ""

# Find the pg_hba.conf file
PG_HBA=$(sudo -u postgres psql -t -P format=unaligned -c 'SHOW hba_file')

if [ -z "$PG_HBA" ]; then
    echo "❌ Could not locate pg_hba.conf file"
    exit 1
fi

echo "📁 Found pg_hba.conf at: $PG_HBA"
echo ""

# Backup the original file
BACKUP="${PG_HBA}.backup.$(date +%Y%m%d_%H%M%S)"
echo "💾 Creating backup: $BACKUP"
sudo cp "$PG_HBA" "$BACKUP"

if [ $? -ne 0 ]; then
    echo "❌ Failed to create backup"
    exit 1
fi

echo "✅ Backup created"
echo ""

# Check if the rule already exists
if sudo grep -q "^local.*ukwelitally.*ukwelitally.*md5" "$PG_HBA"; then
    echo "✅ Authentication rule already exists"
else
    echo "📝 Adding authentication rule..."

    # Create a temporary file with the new configuration
    TMP_FILE=$(mktemp)

    # Add the new rule after the postgres peer line
    sudo awk '
        /^local.*all.*postgres.*peer/ {
            print
            print ""
            print "# UkweliTally database with password authentication"
            print "local   ukwelitally     ukwelitally                     md5"
            next
        }
        {print}
    ' "$PG_HBA" > "$TMP_FILE"

    # Replace the original file
    sudo cp "$TMP_FILE" "$PG_HBA"
    rm "$TMP_FILE"

    echo "✅ Authentication rule added"
fi

echo ""
echo "🔄 Reloading PostgreSQL..."
sudo systemctl reload postgresql

if [ $? -eq 0 ]; then
    echo "✅ PostgreSQL reloaded successfully"
    echo ""
    echo "✨ Fix Complete!"
    echo ""
    echo "You can now run: ./setup-db.sh"
    echo ""
else
    echo "❌ Failed to reload PostgreSQL"
    echo ""
    echo "To restore backup:"
    echo "  sudo cp $BACKUP $PG_HBA"
    echo "  sudo systemctl reload postgresql"
    exit 1
fi

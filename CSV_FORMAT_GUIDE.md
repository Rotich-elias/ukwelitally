# IEBC Data Import - CSV Format Guide

This guide explains the CSV formats required to import official IEBC data into UkweliTally.

---

## 📋 Overview

The import script accepts three types of CSV files:
1. **Polling Stations** - Complete polling station data with GPS coordinates
2. **Wards** - Ward voter registration data
3. **Constituencies** - Constituency voter registration data

---

## 📊 CSV Format Specifications

### 1. Polling Stations CSV

**File Name:** `polling_stations.csv` (or any name)

**Required Columns:**

| Column Name | Type | Description | Example |
|------------|------|-------------|---------|
| `station_name` | Text | Full polling station name | "Karura Primary School" |
| `station_code` | Text | Unique IEBC station code | "PS001234" |
| `ward_name` | Text | Ward name (must match database) | "Karura Ward" |
| `constituency_name` | Text | Constituency name | "Westlands" |
| `county_name` | Text | County name | "Nairobi" |
| `latitude` | Number | GPS latitude coordinate | -1.2345678 |
| `longitude` | Number | GPS longitude coordinate | 36.8765432 |
| `registered_voters` | Integer | Number of registered voters | 850 |

**Example CSV:**
```csv
station_name,station_code,ward_name,constituency_name,county_name,latitude,longitude,registered_voters
Karura Primary School,PS001234,Karura Ward,Westlands,Nairobi,-1.2345678,36.8765432,850
Muthaiga Primary School,PS001235,Parklands Ward,Westlands,Nairobi,-1.2456789,36.8876543,920
Kangemi Social Hall,PS001236,Kangemi Ward,Westlands,Nairobi,-1.2567890,36.8987654,780
```

**Alternative Column Names Supported:**
- `polling_station` or `name` instead of `station_name`
- `code` instead of `station_code`
- `ward` instead of `ward_name`
- `constituency` instead of `constituency_name`
- `county` instead of `county_name`
- `lat` instead of `latitude`
- `lng` or `lon` instead of `longitude`
- `voters` instead of `registered_voters`

---

### 2. Wards CSV

**File Name:** `wards.csv` (or any name)

**Required Columns:**

| Column Name | Type | Description | Example |
|------------|------|-------------|---------|
| `ward_name` | Text | Ward name | "Karura Ward" |
| `constituency_name` | Text | Parent constituency | "Westlands" |
| `county_name` | Text | Parent county | "Nairobi" |
| `registered_voters` | Integer | Total registered voters in ward | 25000 |

**Example CSV:**
```csv
ward_name,constituency_name,county_name,registered_voters
Karura Ward,Westlands,Nairobi,25000
Parklands Ward,Westlands,Nairobi,28000
Kangemi Ward,Westlands,Nairobi,22000
```

**Alternative Column Names Supported:**
- `ward` or `name` instead of `ward_name`
- `constituency` instead of `constituency_name`
- `county` instead of `county_name`
- `voters` instead of `registered_voters`

---

### 3. Constituencies CSV

**File Name:** `constituencies.csv` (or any name)

**Required Columns:**

| Column Name | Type | Description | Example |
|------------|------|-------------|---------|
| `constituency_name` | Text | Constituency name | "Westlands" |
| `county_name` | Text | Parent county | "Nairobi" |
| `code` | Text | Official IEBC constituency code | "001" |
| `registered_voters` | Integer | Total registered voters | 180000 |

**Example CSV:**
```csv
constituency_name,county_name,code,registered_voters
Westlands,Nairobi,001,180000
Dagoretti North,Nairobi,002,165000
Langata,Nairobi,003,175000
```

**Alternative Column Names Supported:**
- `constituency` or `name` instead of `constituency_name`
- `county` instead of `county_name`
- `constituency_code` instead of `code`
- `voters` instead of `registered_voters`

---

## 🚀 How to Use

### Step 1: Prepare Your CSV File

1. Get data from IEBC (www.iebc.or.ke) or Kenya Open Data Portal
2. Save as CSV file with proper column names (see formats above)
3. Ensure data is clean:
   - No empty rows
   - Consistent naming (e.g., "NAIROBI" vs "Nairobi")
   - Valid GPS coordinates (Kenya bounds: Lat -4° to 4°, Lng 34° to 42°)
   - Realistic voter numbers

### Step 2: Run the Import Script

**Import Polling Stations:**
```bash
cd /home/smith/Desktop/New\ Folder/ukwelitally
node scripts/import-iebc-data.js ./data/polling_stations.csv polling_stations
```

**Import Wards:**
```bash
node scripts/import-iebc-data.js ./data/wards.csv wards
```

**Import Constituencies:**
```bash
node scripts/import-iebc-data.js ./data/constituencies.csv constituencies
```

### Step 3: Verify Import

The script will automatically:
- ✅ Create a backup of existing data (in `./backups/` folder)
- ✅ Import/update records
- ✅ Report statistics
- ✅ Validate data quality
- ✅ Show warnings for missing data

---

## 📝 Important Notes

### Data Matching

The script matches locations by name using **case-insensitive** comparison:
- "NAIROBI" = "Nairobi" = "nairobi" ✅
- Names must match exactly (ignoring case)
- Extra spaces are NOT trimmed automatically

### Backup Safety

Before every import, the script creates a backup:
```
./backups/
  polling_stations_2025-01-07T12-30-00-000Z.json
  wards_2025-01-07T12-30-00-000Z.json
  constituencies_2025-01-07T12-30-00-000Z.json
```

You can restore from these backups if something goes wrong.

### GPS Coordinates

**Kenya Bounds:**
- Latitude: -4.5° to 5.0° (South to North)
- Longitude: 33.5° to 42.0° (West to East)

**Format:**
- Decimal degrees (not DMS)
- Negative for South/West
- Example: -1.286389, 36.817223

### Voter Numbers

**Typical Ranges:**
- Polling Station: 300 - 1,500 voters
- Ward: 5,000 - 40,000 voters
- Constituency: 30,000 - 200,000 voters

The script will accept any numbers but may warn if they're unusual.

---

## 🔧 Troubleshooting

### "Ward not found"
**Problem:** CSV has ward name that doesn't exist in database

**Solution:**
1. Check spelling in CSV
2. Verify ward exists: `SELECT * FROM wards WHERE name ILIKE '%ward_name%';`
3. Import wards first before polling stations

### "Constituency not found"
**Problem:** CSV has constituency that doesn't match database

**Solution:**
1. Check CSV spelling matches: `SELECT name FROM constituencies;`
2. Verify county name is also correct

### "Stations without GPS"
**Problem:** Some stations imported with latitude/longitude = 0

**Solution:**
1. Get GPS coordinates from IEBC
2. Re-import with correct coordinates
3. Or manually update: `UPDATE polling_stations SET latitude = X, longitude = Y WHERE code = 'PS001234';`

### Import Errors
**Problem:** Script fails during import

**Solution:**
1. Check CSV format is correct
2. Look at error messages for specific issues
3. Restore from backup if needed:
   ```bash
   # Example restore (you'd need to write restore script)
   psql -U ukwelitally -d ukwelitally -c "DELETE FROM polling_stations;"
   # Then re-import from backup JSON
   ```

---

## 📞 Getting IEBC Data

### Option 1: IEBC Website
```
Website: www.iebc.or.ke
Email: info@iebc.or.ke
Phone: +254-20-2762000

Request:
- Polling station register
- GPS coordinates
- Voter registration statistics
- Format: CSV or Excel
```

### Option 2: Kenya Open Data Portal
```
Website: www.opendata.go.ke

Search Terms:
- "IEBC Polling Stations"
- "Electoral Boundaries"
- "Voter Registration"

Download: CSV format
```

### Option 3: County Electoral Offices
Contact your county IEBC office for county-specific data.

---

## ✅ Example Workflow

### Complete Import Process:

```bash
# 1. Create data directory
mkdir -p data

# 2. Download/save IEBC CSV files to data directory
# (Get from IEBC or Kenya Open Data Portal)

# 3. Import constituencies first
node scripts/import-iebc-data.js ./data/constituencies.csv constituencies

# 4. Import wards
node scripts/import-iebc-data.js ./data/wards.csv wards

# 5. Import polling stations (requires wards to exist)
node scripts/import-iebc-data.js ./data/polling_stations.csv polling_stations

# 6. Verify in database
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "
  SELECT COUNT(*) FROM polling_stations WHERE latitude != 0;
"

# 7. Test in application
npm run dev
# Login → Create agent → Assign to polling station
```

---

## 🎯 Expected Results

After successful import:
- ✅ All polling stations have GPS coordinates
- ✅ All locations have accurate voter counts
- ✅ All station codes match IEBC official codes
- ✅ Location selector shows real IEBC data
- ✅ Agents can be assigned to actual polling stations
- ✅ Results can be verified against IEBC official results

---

## 📚 Additional Resources

- IEBC Official Website: www.iebc.or.ke
- Kenya Open Data: www.opendata.go.ke
- IEBC Twitter: @IEBCKenya
- Support Email: info@iebc.or.ke

---

*Last Updated: January 2025*
*UkweliTally Version: 1.0*

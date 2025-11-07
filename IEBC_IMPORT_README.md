# IEBC Data Import - Complete Guide

## 🎯 Purpose

This guide helps you replace the sample location data with **official IEBC (Independent Electoral and Boundaries Commission)** data for production use.

---

## 📦 What's Included

### 1. Import Script
**File:** `scripts/import-iebc-data.js`

Features:
- ✅ Automatic backup before import
- ✅ CSV file parsing
- ✅ Data validation
- ✅ Progress reporting
- ✅ Error handling
- ✅ Supports multiple CSV formats

### 2. Format Guide
**File:** `CSV_FORMAT_GUIDE.md`

Contains:
- CSV column specifications
- Example files
- Alternative column names
- Troubleshooting tips

### 3. Sample CSV
**File:** `data/sample_polling_stations.csv`

A sample CSV showing the correct format.

---

## 🚀 Quick Start

### Step 1: Install Dependencies
```bash
cd "/home/smith/Desktop/New Folder/ukwelitally"
npm install csv-parser
```

### Step 2: Get IEBC Data

**Option A: Contact IEBC Directly**
```
Email: info@iebc.or.ke
Phone: +254-20-2762000
Website: www.iebc.or.ke

Request:
- Complete polling station register
- GPS coordinates for all stations
- Ward and constituency voter data
- Format: CSV or Excel (convert to CSV)
```

**Option B: Kenya Open Data Portal**
```
Website: www.opendata.go.ke
Search: "IEBC Polling Stations" or "Electoral Data"
Download: CSV format
```

### Step 3: Prepare Your CSV

Save your IEBC data as CSV with these columns:

**For Polling Stations:**
```csv
station_name,station_code,ward_name,constituency_name,county_name,latitude,longitude,registered_voters
```

**For Wards:**
```csv
ward_name,constituency_name,county_name,registered_voters
```

**For Constituencies:**
```csv
constituency_name,county_name,code,registered_voters
```

See `CSV_FORMAT_GUIDE.md` for detailed specifications.

### Step 4: Run Import

**Import Polling Stations:**
```bash
node scripts/import-iebc-data.js ./path/to/your/stations.csv polling_stations
```

**Import Wards:**
```bash
node scripts/import-iebc-data.js ./path/to/your/wards.csv wards
```

**Import Constituencies:**
```bash
node scripts/import-iebc-data.js ./path/to/your/constituencies.csv constituencies
```

---

## 📋 Example Usage

### Complete Import Workflow:

```bash
# 1. Create data directory
mkdir -p data

# 2. Download IEBC files (or use sample)
# Save files to data/ directory

# 3. Import in order (constituencies → wards → stations)
node scripts/import-iebc-data.js ./data/constituencies.csv constituencies
node scripts/import-iebc-data.js ./data/wards.csv wards
node scripts/import-iebc-data.js ./data/polling_stations.csv polling_stations

# 4. Verify import
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "
  SELECT
    COUNT(*) as total_stations,
    COUNT(CASE WHEN latitude != 0 THEN 1 END) as with_gps,
    COUNT(CASE WHEN registered_voters > 0 THEN 1 END) as with_voters
  FROM polling_stations;
"
```

### Test Sample Import:

```bash
# Test with the included sample file
node scripts/import-iebc-data.js ./data/sample_polling_stations.csv polling_stations

# Output will show:
# - Backup created
# - 5 stations processed
# - Import statistics
# - Validation results
```

---

## 🔍 What the Script Does

### 1. Creates Backup
Before any import, creates JSON backups:
```
./backups/
  polling_stations_2025-01-07T12-30-00.json
  wards_2025-01-07T12-30-00.json
  constituencies_2025-01-07T12-30-00.json
```

### 2. Parses CSV
- Reads your CSV file
- Supports multiple column name formats
- Handles different encodings

### 3. Matches Locations
- Finds existing counties, constituencies, wards in database
- Uses case-insensitive name matching
- Reports missing/unmatched records

### 4. Imports/Updates Data
- **New stations:** Inserts into database
- **Existing stations:** Updates with new data
- Maintains referential integrity

### 5. Validates Results
- Checks for missing GPS coordinates
- Verifies voter registration numbers
- Shows summary statistics

---

## 📊 Output Example

```
📦 Creating backup of current data...

   ✓ Backed up polling_stations: 4414 records → ./backups/polling_stations_2025-01-07.json
   ✓ Backed up wards: 1474 records → ./backups/wards_2025-01-07.json
   ✓ Backed up constituencies: 290 records → ./backups/constituencies_2025-01-07.json

✅ Backup complete!

📥 Importing Polling Stations from IEBC data...

File: ./data/polling_stations.csv

✓ Parsed 46000 polling stations from CSV

Processing records...

   Processing... 100 stations
   Processing... 200 stations
   ...
   Processing... 46000 stations

✅ Import Complete!
   New stations imported: 41586
   Existing stations updated: 4414
   Errors: 0

🔍 Validating imported data...

   Stations without GPS: 0
   Stations without voter data: 0

   Top 10 Counties by Stations:
      NAIROBI: 2854 stations, 2,850,000 voters
      KIAMBU: 2134 stations, 1,450,000 voters
      ...

✅ All done!
```

---

## ⚠️ Important Notes

### Data Quality

**Before Import:**
- ✅ Verify CSV column names match (case doesn't matter)
- ✅ Check for duplicate station codes
- ✅ Validate GPS coordinates (Kenya: Lat -4° to 5°, Lng 34° to 42°)
- ✅ Ensure voter numbers are realistic (300-1500 per station)

**After Import:**
- ✅ Check validation output
- ✅ Verify in application (login → create agent → check location selector)
- ✅ Compare totals with IEBC official numbers

### Name Matching

The script matches by name (case-insensitive):
```
CSV: "NAIROBI" → Database: "Nairobi" ✅
CSV: "Nairobi County" → Database: "Nairobi" ❌ (must match exactly)
```

Ensure your CSV names match the existing county/constituency/ward names in the database.

### Backup & Restore

Backups are in JSON format. To restore:

1. **Manual restore:**
```bash
# Example for polling_stations (you'd need to write restore logic)
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "
  DELETE FROM polling_stations;
"
# Then re-insert from JSON backup
```

2. **Keep backups safe:**
```bash
# Copy backups to safe location
cp -r ./backups /path/to/safe/location/
```

---

## 🎯 Expected Kenya Data

### Full IEBC Dataset:

| Level | Count | Avg Voters |
|-------|-------|------------|
| Counties | 47 | ~500,000 |
| Constituencies | 290 | ~80,000 |
| Wards | ~1,450 | ~16,000 |
| Polling Stations | ~46,000 | ~500 |

**Total Registered Voters:** ~22-24 million (as of 2022 elections)

### After Import:

Your system will have:
- ✅ Real IEBC station codes
- ✅ Accurate GPS coordinates
- ✅ Official voter registration numbers
- ✅ All ~46,000 polling stations
- ✅ Production-ready data

---

## 🔧 Troubleshooting

### "csv-parser not found"
```bash
npm install csv-parser
```

### "Ward not found"
1. Check ward name spelling in CSV
2. Verify ward exists: `SELECT * FROM wards WHERE name ILIKE '%ward_name%';`
3. Import wards CSV first

### "File not found"
```bash
# Check file path
ls -la ./data/your_file.csv

# Use absolute path if needed
node scripts/import-iebc-data.js /full/path/to/file.csv polling_stations
```

### Import Fails Midway
1. Don't worry - backup exists in `./backups/`
2. Fix the CSV issue
3. Re-run import (script handles updates)

---

## 📞 Support

### Get IEBC Data:
- **IEBC:** info@iebc.or.ke | +254-20-2762000
- **Open Data:** www.opendata.go.ke
- **Twitter:** @IEBCKenya

### Technical Issues:
- Check `CSV_FORMAT_GUIDE.md` for format specs
- Review error messages in console output
- Verify database connection
- Check CSV encoding (should be UTF-8)

---

## ✅ Verification Checklist

After import, verify:

- [ ] Import completed without errors
- [ ] All stations have GPS coordinates
- [ ] Voter numbers look realistic
- [ ] Station codes match IEBC format
- [ ] Location selector shows all data
- [ ] Can assign agents to real stations
- [ ] Total voters matches IEBC ~22M

### Quick Verification:

```bash
# Check totals
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "
  SELECT
    (SELECT COUNT(*) FROM polling_stations) as stations,
    (SELECT SUM(registered_voters) FROM polling_stations) as total_voters;
"

# Should show:
# stations: ~46000
# total_voters: ~22000000
```

---

## 🎉 Success!

Once import is complete:
- ✅ Your system has official IEBC data
- ✅ Ready for production use
- ✅ Accurate location-based results
- ✅ Verifiable against IEBC official tallies
- ✅ Professional, credible system

---

*UkweliTally - Truth in Every Tally*
*Version 1.0 - January 2025*

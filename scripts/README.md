# Data Import Scripts

Scripts for importing Kenya polling station data into the database.

## Available Scripts

### 1. `seed-sample-data.js`
Seeds the database with sample data for testing (47 counties, 23 constituencies, 10 wards, 8 polling stations)

**Usage:**
```bash
node scripts/seed-sample-data.js
```

**What it does:**
- Clears existing sample data
- Imports all 47 Kenya counties
- Imports sample constituencies (Nairobi and Mombasa)
- Imports sample wards
- Imports sample polling stations with GPS coordinates

### 2. `import-locations.js`
Import data from CSV files (use this when you have official IEBC data)

**Usage:**
```bash
# Import counties
node scripts/import-locations.js path/to/counties.csv counties

# Import constituencies
node scripts/import-locations.js path/to/constituencies.csv constituencies

# Import wards
node scripts/import-locations.js path/to/wards.csv wards

# Import polling stations
node scripts/import-locations.js path/to/stations.csv polling_stations
```

**CSV Formats:**

**Counties:** `code,name`
```csv
code,name
001,Mombasa
002,Kwale
047,Nairobi
```

**Constituencies:** `code,name,county_id`
```csv
code,name,county_id
001,Westlands,1
002,Langata,1
```

**Wards:** `code,name,constituency_id`
```csv
code,name,constituency_id
W001,Kitisuru,1
W002,Karen,2
```

**Polling Stations:** `code,name,ward_id,latitude,longitude`
```csv
code,name,ward_id,latitude,longitude
PS001,Muthaiga Primary School,1,-1.2456,36.8155
PS002,Karen C Primary,2,-1.3179,36.7055
```

## Getting Official Data

See [DATA_SOURCES.md](../DATA_SOURCES.md) for information on where to obtain official IEBC polling station data.

**Recommended sources:**
1. IEBC official website: https://www.iebc.or.ke/
2. Kenya Open Data: https://www.opendata.go.ke/
3. HDX: https://data.humdata.org/dataset/kenya-elections

## Verify Import

After importing, verify the data:

```bash
# Check counts
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "
  SELECT COUNT(*) FROM counties;
  SELECT COUNT(*) FROM constituencies;
  SELECT COUNT(*) FROM wards;
  SELECT COUNT(*) FROM polling_stations;
"

# View sample data
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "
  SELECT
    c.name as county,
    co.name as constituency,
    w.name as ward,
    ps.name as polling_station
  FROM polling_stations ps
  JOIN wards w ON ps.ward_id = w.id
  JOIN constituencies co ON w.constituency_id = co.id
  JOIN counties c ON co.county_id = c.id
  LIMIT 10;
"
```

## Import Order

**Important:** Import in this order due to foreign key relationships:
1. Counties (no dependencies)
2. Constituencies (depends on counties)
3. Wards (depends on constituencies)
4. Polling Stations (depends on wards)

## Full Kenya Data

To import complete Kenya data (~50,000 polling stations):

1. Obtain CSV files from IEBC
2. Place them in a `data/` directory
3. Run imports in order:

```bash
node scripts/import-locations.js data/counties.csv counties
node scripts/import-locations.js data/constituencies.csv constituencies
node scripts/import-locations.js data/wards.csv wards
node scripts/import-locations.js data/polling_stations.csv polling_stations
```

## Troubleshooting

**Error: "File not found"**
- Check the file path is correct
- Use absolute or relative paths from project root

**Error: "Foreign key violation"**
- Import in correct order (counties → constituencies → wards → stations)
- Ensure parent records exist before importing children

**Error: "Connection refused"**
- Check PostgreSQL is running: `sudo systemctl status postgresql`
- Verify database credentials in script

**Error: "Duplicate key"**
- Script uses `ON CONFLICT DO NOTHING` for counties/constituencies/wards
- Re-running is safe and will skip duplicates

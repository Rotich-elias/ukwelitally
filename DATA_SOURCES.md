# Kenya Polling Stations Data Sources

This document lists sources where you can obtain official polling station data for Kenya.

## Official Sources

### 1. IEBC (Independent Electoral and Boundaries Commission)
**Website:** https://www.iebc.or.ke/

**Available Data:**
- Registered voters statistics
- Polling station lists
- Constituency and ward boundaries
- Election results

**How to Get Data:**
1. Visit https://www.iebc.or.ke/registration/
2. Look for "Downloads" or "Resources" section
3. Download voter statistics or polling station lists
4. Contact: info@iebc.or.ke or call (254) 020-2877000

### 2. Kenya Open Data Portal
**Website:** https://www.opendata.go.ke/

**Features:**
- Government datasets in CSV, JSON, GeoJSON formats
- Search for "polling stations", "IEBC", or "elections"
- Free downloads

### 3. Humanitarian Data Exchange (HDX)
**Website:** https://data.humdata.org/dataset/kenya-elections

**Available Downloads:**
- Counties boundaries (Shapefile)
- Constituencies boundaries (Shapefile)
- Wards boundaries (Shapefile)

### 4. GitHub - Kenya Election Data
**Repository:** https://github.com/mikelmaron/kenya-election-data

**Contents:**
- Historical election data
- Shapefiles for boundaries
- Scripts to process IEBC API data

## Data Format Expected

### Counties CSV
```csv
code,name
001,Mombasa
002,Kwale
...
```

### Constituencies CSV
```csv
code,name,county_id
001,Westlands,47
002,Dagoretti North,47
...
```

### Wards CSV
```csv
code,name,constituency_id
W001,Kitisuru,1
W002,Parklands,1
...
```

### Polling Stations CSV
```csv
code,name,ward_id,latitude,longitude
PS001,Muthaiga Primary School,1,-1.2456,36.8155
PS002,Kitisuru Community Hall,1,-1.2389,36.8234
...
```

## Import Instructions

### Option 1: Use Sample Data (For Testing)
```bash
node scripts/seed-sample-data.js
```

### Option 2: Import from CSV Files
```bash
# Import counties
node scripts/import-locations.js data/counties.csv counties

# Import constituencies
node scripts/import-locations.js data/constituencies.csv constituencies

# Import wards
node scripts/import-locations.js data/wards.csv wards

# Import polling stations
node scripts/import-locations.js data/polling_stations.csv polling_stations
```

## Notes

- **2027 Elections**: Full polling station data for 2027 elections may not be finalized yet
- **2022 Data**: Previous election data is available and can be used as a base
- **Updates**: IEBC typically releases final polling station lists 3-6 months before elections
- **Verification**: Always verify data with official IEBC sources

## Contact IEBC for Official Data

If you need official, up-to-date polling station data:

**Email:** info@iebc.or.ke
**Phone:** (254) 020-2877000
**Address:** Anniversary Towers, University Way, Nairobi

Request specifically:
- Complete list of polling stations with GPS coordinates
- Ward, constituency, and county mappings
- CSV or structured data format (preferred over PDF)

# IEBC Data Import - CSV Format Guide

This guide explains the polling-station CSV file the administration import
accepts, and what the import does with it.

The **Admin → Locations → Import** tab is the supported way to load official
IEBC data. There is no separate ward import: a polling-station file carries the
whole hierarchy, and the import creates any county, constituency or ward it does
not find.

---

## Required columns

The file must have these eight columns, in any order:

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `County` | Text | County name | `Nairobi` |
| `Constituency` | Text | Constituency name | `Westlands` |
| `Ward` | Text | Ward name | `Karura Ward` |
| `IEBC Code` | Text | IEBC polling-station code (up to 50 characters) | `28149074100101` |
| `Polling Station` | Text | Polling-station name | `Karura Primary School` |
| `Stream` | Text | Stream number of a station split into streams | `1` |
| `Registration Centre` | Text | Registration centre of the station | `Karura Primary` |
| `Registered Voters` | Integer | Registered voters for this stream | `850` |

Header names are matched without regard to case, and runs of spaces become
underscores. `IEBC Code` is therefore read exactly like `iebc_code`, and
`Registration Centre` like `registration_centre`.

The official IEBC export is tab separated. The importer also accepts a comma
separated file.

### Tab separated example

```text
County	Constituency	Ward	IEBC Code	Polling Station	Stream	Registration Centre	Registered Voters
Nairobi	Westlands	Karura Ward	28149074100101	Karura Primary School	1	Karura Primary	850
Nairobi	Westlands	Karura Ward	28149074100101	Karura Primary School	2	Karura Primary	812
Nairobi	Westlands	Parklands Ward	28149074100201	Muthaiga Primary School	1	Muthaiga Primary	920
```

### Comma separated example

```csv
County,Constituency,Ward,IEBC Code,Polling Station,Stream,Registration Centre,Registered Voters
Nairobi,Westlands,Karura Ward,28149074100101,Karura Primary School,1,Karura Primary,850
Nairobi,Westlands,Karura Ward,28149074100101,Karura Primary School,2,Karura Primary,812
Nairobi,Westlands,Parklands Ward,28149074100201,Muthaiga Primary School,1,Muthaiga Primary,920
```

A station split into streams is one row per stream. The same `IEBC Code` may
repeat when the `Stream` differs; the code and the stream together identify the
row.

---

## What the import does

### Matching

- A polling station is matched by its **IEBC code and stream**.
- When the file carries no code, it is matched by its **name inside its ward**.
- A ward is matched by its **name inside its constituency**.
- A constituency is matched by its **name inside its county**.
- A county is matched by its **name**.

An existing record is updated in place and keeps its codes. Only the columns
the file carries are written.

### Creating a fresh hierarchy

When a row names a county, constituency or ward the platform does not have, the
import creates the missing levels from the county down:

1. the county is created (or matched by name),
2. the constituency is created under that county (or matched by name),
3. the ward is created under that constituency (or matched by name),
4. the polling station is created under that ward.

This means a completely empty database can be loaded with one polling-station
file. Auto-created counties, constituencies and wards receive a generated code;
the code of an existing record is never changed. Re-importing the same file is
safe: the second run matches every level and updates the stations instead of
creating duplicates.

### Validation and preview

The **Preview** button runs the same planner as the import without writing
anything. It reports how many rows would be created, updated or skipped, and
the reason for every skipped row.

The import is refused with a 400 response when any of the eight required
columns is missing. The response names the missing columns and repeats the
required header.

---

## Common messages

### "The polling station file is missing the column(s) …"

The file does not carry all eight required columns. Add the missing columns
using the exact names from the table above. A spreadsheet sometimes writes a
byte order mark before the first header; the importer strips it, so `County`
and `﻿County` both work.

### "The code … is already used by row …"

The same `IEBC Code` and `Stream` appear twice in the file. Remove the
duplicate, or give the second row a different stream.

### "A new polling station needs a ward" / "needs a constituency"

A station matched only by code has no ward to attach to. Include the `Ward` and
`Constituency` columns (and `County` when that constituency is also new).

### "No polling station named … exists in …"

A row without an `IEBC Code` can only update a station that already exists in
the named ward. Add the code for a new station.

---

## Notes on voter numbers

- Registered voters are stored per station and stream.
- After a successful import the ward, constituency and county totals are
  recomputed from the stations.
- Typical ranges: a polling station has 300–1,500 voters; a ward 5,000–40,000.

---

## Additional resources

- IEBC Official Website: www.iebc.or.ke
- Kenya Open Data: www.opendata.go.ke
- Support Email: info@iebc.or.ke

---

*Last Updated: October 2026*
*UkweliTally Version: 2.0*

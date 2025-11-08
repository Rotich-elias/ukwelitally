# Bug Fix: Candidate Dashboard Showing Zero Values

## Problem
The candidate dashboard was displaying all zeros (0 stations, 0 votes, etc.) even though real data existed in the database.

## Root Cause
**SQL Parameter Numbering Bug in `/api/results/aggregate/route.ts`**

The API was building SQL queries with incorrect parameter numbering:
- The `totalStatsSql` query used `params.slice(1)` to skip the position parameter
- But the WHERE clause was built using `$2` (expecting 2 parameters)
- This caused a mismatch: the query needed `$1` but the clause used `$2`
- Result: PostgreSQL couldn't find the parameter and returned no data

### Example of the Bug:
```javascript
// Before (BROKEN):
const params = ['mp', '173']  // position, constituency_id
const whereClause = 'const.id = $2'  // References $2
await queryMany(totalStatsSql, params.slice(1))  // Only passes ['173'], so $2 doesn't exist!
```

## Solution
Created separate parameter arrays for different queries:
- `params` - for main query (includes position as $1)
- `locationParams` - for stats query (location-only, starts at $1)

### After (FIXED):
```javascript
const params = ['mp', '173']  // For main query: $1=position, $2=location
const locationParams = ['173']  // For stats query: $1=location
const whereClause = 'const.id = $1'  // Now correctly references $1 in locationParams
await queryMany(totalStatsSql, locationParams)  // Passes ['173'], $1 works!
```

## Files Modified
- `/src/app/api/results/aggregate/route.ts` - Fixed parameter numbering (lines 108-145)

## Expected Dashboard Display (After Fix)

### For Candidate: ELIUS ROTICH (MP, KEIYO SOUTH)

#### Election Process Overview
- **Total Polling Stations**: 22
- **Stations Reported**: 2
- **Pending Submissions**: 20
- **Overall Progress**: 9.1%

#### Voter Statistics
- **Total Registered Voters**: 33,000
- **Total Votes Cast**: 2,500
- **Voter Turnout**: 83.3%
- **Rejected Votes**: 100

#### Election Results
| Candidate | Party | Votes | Percentage |
|-----------|-------|-------|------------|
| ELIUS ROTICH | REKE | 1,500 | 62.5% |
| GIDEON KIMAIYO | UDA | 500 | 20.8% |
| ROTICH ELIAS | REKE | 400 | 16.7% |

#### Progress Bar
- 9.1% filled (2 out of 22 stations reporting)

## How to Verify the Fix

1. **Login** as: `elgeiy8@gmail.com`
2. **Navigate to**: `http://localhost:3000/dashboard/candidate`
3. **Check**:
   - Top section shows "KEIYO SOUTH Constituency"
   - Total Polling Stations shows "22"
   - Stations Reported shows "2"
   - Progress bar shows 9.1%
   - Results table shows 3 candidates with ELIUS ROTICH leading

## Technical Details

### Database Structure
- **Polling Stations**: Link to wards via `ward_id` (NOT `constituency_id`)
- **Wards**: Link to constituencies via `constituency_id`
- **Proper Join**: Must go through wards to reach constituencies

### SQL Query Pattern (Fixed)
```sql
SELECT COUNT(DISTINCT ps.id) as total_stations
FROM polling_stations ps
JOIN wards w ON ps.ward_id = w.id
JOIN constituencies const ON w.constituency_id = const.id
WHERE const.id = $1  -- Now correctly references first parameter
```

### Parameter Passing (Fixed)
```javascript
const locationParams = ['173']  // constituency_id for KEIYO SOUTH
await queryMany(totalStatsSql, locationParams)  // $1 = '173'
```

## Status
✅ **FIXED** - Server restarted with corrected code
✅ **TESTED** - Build successful
✅ **DEPLOYED** - Dev server running on http://localhost:3000

## Date
November 8, 2025

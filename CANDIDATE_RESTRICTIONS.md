# Candidate Location-Based Restrictions

## Overview

The UkweliTally system now implements strict location-based access control for candidates. When an admin creates a candidate account, they must assign the candidate to their specific electoral area based on their position. This ensures candidates can only:

- View results from their electoral area
- Create agents within their electoral area
- Access polling stations within their electoral area

This prevents misuse and ensures data integrity.

---

## Position-to-Location Mapping

| Position | Restriction Level | Electoral Area Required | Can Access |
|----------|------------------|-------------------------|------------|
| **President** | None (National) | No restriction | All polling stations nationwide |
| **Governor** | County | Specific county | Only stations in assigned county |
| **Senator** | County | Specific county | Only stations in assigned county |
| **MP** | Constituency | Specific constituency | Only stations in assigned constituency |
| **MCA** | Ward | Specific ward | Only stations in assigned ward |

---

## How It Works

### 1. Admin Creates Candidate

**Location:** `/src/app/dashboard/admin/page.tsx`

When an admin creates a candidate account:

1. Admin selects the candidate's position (President, Governor, Senator, MP, or MCA)
2. Based on the position, the system shows a location selector:
   - **MCA**: Must select County → Constituency → Ward
   - **MP**: Must select County → Constituency
   - **Governor/Senator**: Must select County
   - **President**: No location selector shown

3. The electoral area is saved to the `candidates` table with these fields:
   - `county_id` - For Governor/Senator positions
   - `constituency_id` - For MP positions
   - `ward_id` - For MCA positions

**Example:**
```
Position: MCA
Electoral Area: Dagoretti North Ward 1, Dagoretti North Constituency, Nairobi County
→ Stored: ward_id = 123
```

### 2. Database Schema

**Migration:** `/migrations/add_candidate_restrictions.sql`

```sql
-- Location columns added to candidates table
ALTER TABLE candidates
ADD COLUMN county_id INTEGER REFERENCES counties(id),
ADD COLUMN constituency_id INTEGER REFERENCES constituencies(id),
ADD COLUMN ward_id INTEGER REFERENCES wards(id);

-- Check constraint ensures position matches location
ALTER TABLE candidates
ADD CONSTRAINT candidate_position_location_check CHECK (
  (position = 'president') OR
  (position = 'governor' AND county_id IS NOT NULL) OR
  (position = 'senator' AND county_id IS NOT NULL) OR
  (position = 'mp' AND constituency_id IS NOT NULL) OR
  (position = 'mca' AND ward_id IS NOT NULL)
);
```

### 3. API Validation

**Admin User Creation:** `/src/app/api/admin/users/route.ts`

When creating a candidate, the API validates:
```typescript
if (position === 'mca' && !ward_id) {
  return error('MCA candidates must be assigned to a specific ward')
}
if (position === 'mp' && !constituency_id) {
  return error('MP candidates must be assigned to a specific constituency')
}
if ((position === 'governor' || position === 'senator') && !county_id) {
  return error('Governor/Senator candidates must be assigned to a specific county')
}
```

### 4. Results Filtering

**Results API:** `/src/app/api/results/aggregate/route.ts`

When candidates request results:

1. API checks if the user is a candidate (via JWT token)
2. Retrieves candidate's location restrictions from database
3. Automatically applies location filter:

```typescript
// Example: MCA in Dagoretti North Ward 1
// Automatically filters to only show results from that ward
if (candidateRestrictions.position === 'mca') {
  actualWardId = candidateRestrictions.ward_id
  // Ignore any other location filters from query params
}
```

**What Candidates See:**
- **President Candidate**: All results nationwide
- **Governor Candidate**: Only results from their county
- **Senator Candidate**: Only results from their county
- **MP Candidate**: Only results from their constituency
- **MCA Candidate**: Only results from their ward

### 5. Agent Creation Restrictions

**Agent Creation API:** `/src/app/api/candidates/agents/route.ts`

When a candidate creates an agent and assigns them to a polling station:

1. API retrieves the polling station's location (county, constituency, ward)
2. Checks if the station is within the candidate's electoral area
3. Rejects the request if the station is outside their area

```typescript
// Example: MCA trying to assign agent to station outside their ward
const canAccess = canAccessLocation(restrictions, {
  county_id: station.county_id,
  constituency_id: station.constituency_id,
  ward_id: station.ward_id,
})

if (!canAccess) {
  return error('You can only assign agents to polling stations within your ward')
}
```

### 6. Polling Stations List Filtering

**Polling Stations API:** `/src/app/api/locations/polling-stations/route.ts`

When candidates request the list of polling stations (e.g., when creating an agent):

- The API automatically filters stations to only show those within their electoral area
- A Presidential candidate sees all ~46,000 stations
- An MCA candidate only sees stations in their specific ward (~3-5 stations)

---

## Candidate Dashboard

**Dashboard:** `/src/app/dashboard/candidate/page.tsx`

The candidate dashboard displays:

### Electoral Area Badge
Shows the candidate's assigned electoral area prominently at the top:
```
Electoral Area: Dagoretti North Ward 1
Position: MCA
Party: ODM
```

### Results Table
Shows only candidates competing in their electoral area with:
- Candidate name and party
- Total votes received
- Percentage of votes
- Visual progress bar

### Stats Cards
- **Total Stations**: Number of polling stations in their area
- **Reporting**: How many stations have submitted results
- **Turnout**: Voter turnout percentage
- **Registered Voters**: Total voters in their area

---

## Helper Functions

**Location:** `/src/lib/candidate-restrictions.ts`

### getCandidateRestrictions()
Retrieves a candidate's location restrictions from the database.

```typescript
const restrictions = await getCandidateRestrictions(userId)
// Returns: { position: 'mca', ward_id: 123, ... }
```

### canAccessLocation()
Checks if a candidate can access a specific location.

```typescript
const canAccess = canAccessLocation(restrictions, {
  county_id: 1,
  constituency_id: 5,
  ward_id: 25
})
// Returns: true or false
```

### buildLocationFilter()
Builds SQL WHERE clause for location filtering in queries.

```typescript
const { clause, params } = buildLocationFilter(restrictions)
// Returns: { clause: "w.id = $1", params: [25], ... }
```

---

## Security Benefits

1. **Data Isolation**: Candidates can't access data outside their electoral area
2. **Agent Control**: Candidates can only deploy agents where they're vying
3. **Audit Trail**: All location assignments are logged in audit_logs table
4. **Database Constraints**: CHECK constraints prevent invalid data at DB level
5. **API Validation**: Multiple layers of validation in backend APIs
6. **Frontend Restrictions**: UI only shows relevant options

---

## Testing Scenarios

### Scenario 1: Create MCA Candidate
1. Admin logs in → Dashboard → Create Candidate
2. Fill details: Position = "MCA"
3. Location selector appears
4. Select: Nairobi County → Dagoretti North → Ward 1
5. Submit → Candidate created with `ward_id = 123`

### Scenario 2: MCA Views Results
1. MCA candidate logs in
2. Dashboard shows: "Electoral Area: Dagoretti North Ward 1"
3. Results table shows only candidates competing in Ward 1
4. Stats show only data from Ward 1 stations

### Scenario 3: MCA Creates Agent (Success)
1. MCA candidate → Manage Agents → Create Agent
2. Assigns agent to station in Ward 1
3. API validates station is in Ward 1 ✅
4. Agent created successfully

### Scenario 4: MCA Creates Agent (Failure)
1. MCA candidate tries to assign agent to Ward 2 station
2. API checks location restrictions
3. API returns error: "You can only assign agents to polling stations within your ward"
4. Agent creation blocked ❌

---

## Database Queries

### Find Candidates by Electoral Area
```sql
-- All MCA candidates in Nairobi County
SELECT c.*, u.full_name, w.name as ward_name
FROM candidates c
JOIN users u ON c.user_id = u.id
JOIN wards w ON c.ward_id = w.id
JOIN constituencies con ON w.constituency_id = con.id
JOIN counties cou ON con.county_id = cou.id
WHERE c.position = 'mca' AND cou.name = 'NAIROBI';
```

### Get Candidate's Polling Stations
```sql
-- All stations accessible to an MCA candidate
SELECT ps.*
FROM polling_stations ps
JOIN candidates c ON ps.ward_id = c.ward_id
WHERE c.user_id = $1 AND c.position = 'mca';
```

### Verify Agent Assignment
```sql
-- Check if agent's station is in candidate's electoral area
SELECT
  a.id as agent_id,
  ps.name as station_name,
  c.position,
  CASE
    WHEN c.position = 'mca' AND ps.ward_id = c.ward_id THEN true
    WHEN c.position = 'mp' AND w.constituency_id = c.constituency_id THEN true
    WHEN c.position IN ('governor','senator') AND con.county_id = c.county_id THEN true
    WHEN c.position = 'president' THEN true
    ELSE false
  END as is_valid_assignment
FROM agents a
JOIN candidates c ON a.candidate_id = c.id
JOIN polling_stations ps ON a.polling_station_id = ps.id
JOIN wards w ON ps.ward_id = w.id
JOIN constituencies con ON w.constituency_id = con.id
WHERE a.id = $1;
```

---

## Future Enhancements

Potential improvements to consider:

1. **Multi-Constituency Candidates**: Some candidates may run in multiple constituencies
2. **Restriction Override**: Admin ability to temporarily override restrictions
3. **Location Change**: Handle candidates who change electoral areas
4. **Batch Agent Creation**: Create multiple agents at once with CSV upload
5. **Results Export**: Export results scoped to candidate's electoral area

---

## Troubleshooting

### Issue: "MCA candidates must be assigned to a specific ward"
**Cause**: Admin didn't select a ward when creating MCA candidate
**Solution**: Ensure location selector shows all three levels (County → Constituency → Ward)

### Issue: "You can only assign agents to polling stations within your ward"
**Cause**: Candidate trying to assign agent outside their electoral area
**Solution**: Verify the polling station belongs to the candidate's ward

### Issue: Candidate sees no polling stations in dropdown
**Cause**: Either no stations in their area, or location restrictions not properly saved
**Solution**:
1. Check database: `SELECT * FROM candidates WHERE user_id = X`
2. Verify ward_id/constituency_id/county_id is set
3. Check if polling stations exist in that area

### Issue: Results show data from other areas
**Cause**: Token not being sent with API request, or restrictions not applied
**Solution**:
1. Check browser localStorage has valid token
2. Verify Authorization header is sent: `Bearer <token>`
3. Check API logs for "Invalid token" errors

---

## API Endpoints Summary

| Endpoint | Method | Restrictions Applied | Description |
|----------|--------|---------------------|-------------|
| `/api/candidates/me` | GET | Returns candidate profile | Shows electoral area info |
| `/api/results/aggregate` | GET | Filters by electoral area | Only shows results from candidate's area |
| `/api/locations/polling-stations` | GET | Filters by electoral area | Only shows stations in candidate's area |
| `/api/candidates/agents` | POST | Validates station location | Prevents agents outside electoral area |
| `/api/admin/users` | POST | Validates location required | Ensures position matches location |

---

## Files Modified

1. **Database**:
   - `/migrations/add_candidate_restrictions.sql` - Schema changes

2. **APIs**:
   - `/src/app/api/admin/users/route.ts` - Candidate creation validation
   - `/src/app/api/candidates/me/route.ts` - Candidate profile endpoint (new)
   - `/src/app/api/results/aggregate/route.ts` - Results filtering
   - `/src/app/api/candidates/agents/route.ts` - Agent creation validation
   - `/src/app/api/locations/polling-stations/route.ts` - Station list filtering

3. **UI**:
   - `/src/app/dashboard/admin/page.tsx` - Admin candidate creation form
   - `/src/app/dashboard/candidate/page.tsx` - Candidate dashboard with restrictions

4. **Utilities**:
   - `/src/lib/candidate-restrictions.ts` - Helper functions (new)

---

**Version:** 1.0
**Date:** January 2025
**UkweliTally - Truth in Every Tally**

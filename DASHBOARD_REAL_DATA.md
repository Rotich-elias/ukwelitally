# Candidate Dashboard - Real Data Documentation

## Current Data in Database (as of testing)

### Candidate: ELIUS ROTICH
- **Position**: MP (Member of Parliament)
- **Electoral Area**: KEIYO SOUTH Constituency, ELGEYO/MARAKWET County
- **Party**: REKE
- **User ID**: 10
- **Candidate ID**: 15

---

## Expected Dashboard Display

### Election Process Overview Section

#### Total Polling Stations
- **Value**: 22 stations
- **Description**: All polling stations in KEIYO SOUTH constituency (7 wards)

#### Stations Reported
- **Value**: 2 stations
- **Description**: Polling stations that have submitted verified results
- **Percentage**: 9.1% of total (2/22)

#### Pending Submissions
- **Value**: 20 stations
- **Description**: Calculated as Total - Reported (22 - 2)
- **Status**: Awaiting results

#### Overall Progress
- **Value**: 9.1%
- **Description**: Completion rate (2/22 stations)

---

### Voter Statistics Section

#### Total Registered Voters
- **Value**: 33,000 voters
- **Description**: Sum of registered voters across all 22 polling stations in KEIYO SOUTH

#### Total Votes Cast
- **Value**: 2,500 votes
- **Description**: Cumulative votes from the 2 reporting stations
  - Station 2227 (Ward 1): 1,000 votes
  - Station 2229 (Ward 2): 1,500 votes

#### Voter Turnout
- **Value**: 83.3%
- **Calculation**: (2,500 votes cast) / (3,000 registered at reporting stations) × 100
- **Note**: Calculated from reporting stations only, not total constituency
- **Rejected Votes**: 100 (from station 2227)

---

### Election Results Table

Results for MP position in KEIYO SOUTH constituency:

| Rank | Candidate Name | Party | Total Votes | Percentage |
|------|----------------|-------|-------------|------------|
| 1    | ELIUS ROTICH   | REKE  | 1,500       | 62.5%      |
| 2    | GIDEON KIMAIYO | UDA   | 500         | 20.8%      |
| 3    | ROTICH ELIAS   | REKE  | 400         | 16.7%      |

**Total Valid Votes**: 2,400
**Rejected Votes**: 100
**Total Votes Cast**: 2,500

---

### Submission Progress Bar

- **Completed**: 2 stations (emerald color)
- **Pending**: 20 stations (orange color)
- **Total**: 22 stations (blue color)
- **Progress Bar**: 9.1% filled with gradient (blue → emerald → purple)

---

### Recent Activity Section

Expected activities (from most recent):

1. **Results verified** (emerald dot)
   - keiyo south Ward 2 Polling Station 1 - [time ago]

2. **New submission** (blue dot)
   - keiyo south Ward 2 Polling Station 1 - [time ago]

3. **Results verified** (emerald dot)
   - keiyo south Ward 1 Polling Station 1 - [time ago]

4. **New submission** (blue dot)
   - keiyo south Ward 1 Polling Station 1 - [time ago]

5. **Agent assigned** (blue dot)
   - 2 agents registered for candidate

---

## Database Details

### Constituency Structure
- **County**: ELGEYO/MARAKWET (ID: 122)
- **Constituency**: KEIYO SOUTH (ID: 173)
- **Wards**: 7 wards (IDs: 753-759)
  - keiyo south Ward 1 (ID: 753)
  - keiyo south Ward 2 (ID: 754)
  - keiyo south Ward 3 (ID: 755)
  - keiyo south Ward 4 (ID: 756)
  - keiyo south Ward 5 (ID: 757)
  - keiyo south Ward 6 (ID: 758)
  - keiyo south Ward 7 (ID: 759)

### Submissions
- **Submission 3**: Ward 1, Station 2227 (Verified)
  - Registered: 1,500 | Cast: 1,000 | Valid: 900 | Rejected: 100
  - ELIUS ROTICH: 500, GIDEON KIMAIYO: 300, ROTICH ELIAS: 100

- **Submission 4**: Ward 2, Station 2229 (Verified)
  - Registered: 1,500 | Cast: 1,500 | Valid: 1,500 | Rejected: 0
  - ELIUS ROTICH: 1,000, GIDEON KIMAIYO: 200, ROTICH ELIAS: 300

---

## API Endpoints Being Used

### 1. `/api/candidates/me`
Returns candidate profile with electoral area

### 2. `/api/results/aggregate?position=mp`
Returns aggregated results restricted to KEIYO SOUTH constituency

### 3. `/api/candidates/activity`
Returns recent activity (submissions, agent assignments, discrepancies)

---

## How to Verify

1. **Login as**: elgeiy8@gmail.com (password: contact admin for credentials)
2. **Navigate to**: /dashboard/candidate
3. **Expected Display**: All metrics above should be visible
4. **Check**: Progress bar should show 9.1% (2 out of 22 stations)
5. **Verify**: Results table should show ELIUS ROTICH leading with 1,500 votes (62.5%)

---

## Notes

- The dashboard automatically restricts data based on the candidate's position and electoral area
- For MP candidates, only their constituency data is shown
- Turnout percentage is calculated from reporting stations only
- All calculations are done server-side for security
- Real-time updates occur when new submissions are verified

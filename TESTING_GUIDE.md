# UkweliTally - Local Testing Guide

## 🚀 Quick Start

Your development server is running at: **http://localhost:3000**

---

## 📋 Setup Checklist

### Option A: Without Database (Frontend Only)

✅ **Already Done!**
- Server is running on http://localhost:3000
- You can test:
  - Landing page UI
  - Responsive design
  - Navigation
  - PWA manifest

**What to test:**
1. Open http://localhost:3000 in your browser
2. Check the homepage design
3. Try resizing browser (responsive test)
4. Visit http://localhost:3000/offline

---

### Option B: Full Testing (With Database)

**1. Install PostgreSQL** (if not already installed)
```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
```

**2. Run Setup Script**
```bash
cd "/home/smith/Desktop/New Folder/ukwelitally"
./setup-db.sh
```

This will:
- Create database user `ukwelitally`
- Create database `ukwelitally`
- Run all migrations (15 tables)
- Show you the created tables

**3. Verify Database**
```bash
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "\dt"
```

You should see 15 tables:
- users, candidates, agents
- counties, constituencies, wards, polling_stations
- submissions, submission_photos, results, candidate_votes
- discrepancies, iebc_results, audit_logs, notifications

---

## 🧪 API Testing

### Test 1: User Registration

**Create a test candidate:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "candidate@test.com",
    "phone": "+254712345678",
    "password": "Test1234!",
    "full_name": "Test Candidate",
    "role": "candidate",
    "id_number": "12345678"
  }'
```

**Expected Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "email": "candidate@test.com",
    "phone": "+254712345678",
    "full_name": "Test Candidate",
    "role": "candidate",
    "verified": false
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Save the token for next steps!

---

### Test 2: User Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "candidate@test.com",
    "password": "Test1234!"
  }'
```

**Expected Response:**
```json
{
  "message": "Login successful",
  "user": {...},
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Test 3: Register an Agent

First, create an agent user, then register them:

```bash
# 1. Register agent user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "agent@test.com",
    "phone": "+254712345679",
    "password": "Agent1234!",
    "full_name": "Test Agent",
    "role": "agent",
    "id_number": "12345679"
  }'

# 2. Assign agent to candidate (use candidate token)
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CANDIDATE_TOKEN_HERE" \
  -d '{
    "user_id": 2,
    "polling_station_id": 1,
    "is_primary": true
  }'
```

---

### Test 4: Submit Form Results

**Note:** This requires multipart/form-data. Use this test:

```bash
# Create a test image first
echo "Test image" > /tmp/test_form.jpg

# Submit with images
curl -X POST http://localhost:3000/api/submissions \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN_HERE" \
  -F "polling_station_id=1" \
  -F "candidate_id=1" \
  -F "submission_type=primary" \
  -F "submitted_lat=-1.286389" \
  -F "submitted_lng=36.817223" \
  -F "device_id=test_device" \
  -F "full_form=@/tmp/test_form.jpg" \
  -F "signature=@/tmp/test_form.jpg"
```

---

### Test 5: Enter Results

```bash
curl -X POST http://localhost:3000/api/results \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN_HERE" \
  -d '{
    "submission_id": 1,
    "position": "president",
    "registered_voters": 500,
    "total_votes_cast": 450,
    "valid_votes": 440,
    "rejected_votes": 10,
    "candidate_votes": [
      {
        "candidate_name": "Candidate A",
        "party_name": "Party A",
        "votes": 250
      },
      {
        "candidate_name": "Candidate B",
        "party_name": "Party B",
        "votes": 190
      }
    ],
    "manually_verified": true
  }'
```

---

### Test 6: View Aggregated Results

```bash
curl "http://localhost:3000/api/results/aggregate?level=constituency&location_id=1&position=president"
```

**Expected Response:**
```json
{
  "level": "constituency",
  "location_id": 1,
  "location_name": "Test Constituency",
  "position": "president",
  "candidate_votes": [
    {
      "candidate_name": "Candidate A",
      "party_name": "Party A",
      "total_votes": 250,
      "percentage": 56.82
    },
    {
      "candidate_name": "Candidate B",
      "party_name": "Party B",
      "total_votes": 190,
      "percentage": 43.18
    }
  ],
  "total_registered_voters": 500,
  "total_votes_cast": 450,
  "turnout_percentage": 90.0,
  "stations_reporting": 1,
  "total_stations": 10
}
```

---

## 🌐 Browser Testing

### Pages to Test

1. **Landing Page**: http://localhost:3000
   - Check all sections load
   - Test navigation links
   - Check responsive design

2. **Offline Page**: http://localhost:3000/offline
   - Should show offline message
   - Has retry button

3. **API Routes**: (use curl or Postman)
   - `/api/auth/register`
   - `/api/auth/login`
   - `/api/agents`
   - `/api/submissions`
   - `/api/results`

---

## 🔍 What to Look For

### ✅ Success Indicators
- ✓ Server starts without errors
- ✓ Landing page loads correctly
- ✓ API returns JSON responses
- ✓ Database tables created
- ✓ No TypeScript errors in console

### ❌ Common Issues

**1. Database Connection Error**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Fix**: Make sure PostgreSQL is running:
```bash
sudo systemctl start postgresql
```

**2. Authentication Error**
```
{ "error": "Authentication required" }
```
**Fix**: Include Authorization header with Bearer token

**3. Port Already in Use**
```
Error: Port 3000 is already in use
```
**Fix**: Kill the process or use different port:
```bash
PORT=3001 npm run dev
```

---

## 🧰 Useful Commands

**Check if server is running:**
```bash
curl http://localhost:3000
```

**Check database connection:**
```bash
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "SELECT 1;"
```

**View server logs:**
The dev server shows logs in the terminal where you ran `npm run dev`

**Stop dev server:**
Press `Ctrl+C` in the terminal

**Restart dev server:**
```bash
cd "/home/smith/Desktop/New Folder/ukwelitally"
npm run dev
```

---

## 📊 Sample Test Data

Need to add test geographic data? Run these SQL commands:

```sql
-- Connect to database
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally

-- Add test county
INSERT INTO counties (name, code, registered_voters)
VALUES ('Test County', 'TC001', 100000);

-- Add test constituency
INSERT INTO constituencies (county_id, name, code, registered_voters)
VALUES (1, 'Test Constituency', 'CON001', 50000);

-- Add test ward
INSERT INTO wards (constituency_id, county_id, name, code, registered_voters)
VALUES (1, 1, 'Test Ward', 'WRD001', 10000);

-- Add test polling station
INSERT INTO polling_stations (ward_id, constituency_id, county_id, name, code, registered_voters, latitude, longitude)
VALUES (1, 1, 1, 'Test Primary School', 'PS001', 500, -1.286389, 36.817223);
```

---

## 🐛 Debugging Tips

**View All Users:**
```sql
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "SELECT id, email, role, created_at FROM users;"
```

**View All Submissions:**
```sql
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "SELECT * FROM submissions;"
```

**Check Audit Logs:**
```sql
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;"
```

---

## ✨ Next Steps

Once local testing works:
1. Add real Kenya geographic data (counties, constituencies, etc.)
2. Test with multiple agents
3. Test GPS verification with real coordinates
4. Test image upload with actual Form 34A photos
5. Deploy to production (see SETUP_GUIDE.md)

---

## 📞 Need Help?

Check these files:
- `README.md` - Project overview
- `DATABASE_SCHEMA.md` - Database structure
- `SETUP_GUIDE.md` - Production deployment
- `PROJECT_SUMMARY.md` - Technical details

Happy testing! 🎉

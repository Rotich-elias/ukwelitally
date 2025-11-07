# UkweliTally - SaaS Model Guide

## Overview

UkweliTally is now configured as a **SaaS (Software as a Service)** system where:
- **Admin** (you) creates candidate accounts
- **Candidates** manage their own agents and observers
- No public registration - all accounts created by admin or candidates

---

## User Hierarchy

```
Admin (You)
  └─> Creates Candidates
        └─> Candidates Create Agents
              └─> Agents Submit Results
```

---

## Getting Started

### 1. Login as Admin

**Admin Credentials:**
- Email: `admin@ukwelitally.com`
- Password: `Admin123`

**Login URL:** http://localhost:3000/login

**Admin Dashboard:** http://localhost:3000/dashboard/admin

### 2. Create Candidate Accounts

As admin, you can create candidate accounts when they purchase the system:

1. Click **"+ Create User"** button
2. Fill in candidate details:
   - Full Name
   - Email (they'll use this to login)
   - Phone (+254XXXXXXXXX format)
   - ID Number (7-8 digits)
   - Password (click "Generate" for a secure password)
   - Role: Select **"Candidate"**
   - Party Name (optional)
   - Position (President, Governor, etc.)

3. **IMPORTANT:** Save the email and password - give these credentials to the candidate

---

## Candidate Workflow

### 1. Candidate Login

Candidates login with the credentials you provide:
- Email: (provided by admin)
- Password: (provided by admin)

### 2. Candidate Dashboard

After login, candidates can:
- View election results in real-time
- Manage their agents
- Download reports
- Monitor polling station submissions

### 3. Create Agents

Candidates click **"Manage Agents"** to:

1. Click **"+ Create Agent"**
2. Fill in agent details:
   - Full Name
   - Email
   - Phone
   - ID Number
   - Password (auto-generate recommended)
   - Agent Type (Primary/Backup)
   - Assign to Polling Station (optional)

3. **Location Assignment:**
   - Select County → Constituency → Ward → Polling Station
   - Can assign later if station not yet determined
   - Each polling station can have multiple agents (primary + backups)

4. **Save Credentials:** Give the email and password to the agent

---

## Agent Workflow

### 1. Agent Login

Agents login with credentials provided by their candidate:
- Email: (provided by candidate)
- Password: (provided by candidate)

### 2. Agent Dashboard

After login, agents can:
- View their assigned polling station
- Submit Form 34A results
- Upload photos of forms
- See submission status

### 3. Submit Results

On election day, agents:
1. Take photo of Form 34A
2. Enter vote counts
3. Submit to the system
4. Results automatically aggregate to candidate's dashboard

---

## Key Features

### For Admin (You)
- ✅ Create unlimited candidate accounts
- ✅ View all users in the system
- ✅ Monitor system activity
- ✅ Manage all roles (candidates, agents, observers)

### For Candidates
- ✅ Create and manage agents
- ✅ Assign agents to polling stations
- ✅ View real-time results
- ✅ Filter results by location
- ✅ Download reports
- ✅ Track submission progress

### For Agents
- ✅ Submit results from assigned polling station
- ✅ Upload Form 34A photos
- ✅ GPS verification
- ✅ Offline support (future feature)

---

## Selling the System

### Pricing Model (Suggested)

**Per Candidate License:**
- One-time fee OR Monthly subscription
- Includes:
  - 1 Candidate account
  - Unlimited agents
  - Real-time results dashboard
  - Location-based filtering (47 counties, 290 constituencies)
  - Form 34A photo uploads
  - GPS verification
  - Data export

**Add-ons:**
- Premium analytics
- Historical data comparison
- API access
- White-label branding

### Sales Process

1. **Candidate Purchases:**
   - Candidate contacts you and pays
   - You create their account
   - Send them credentials

2. **Onboarding:**
   - Candidate logs in
   - Reviews dashboard
   - Creates agents
   - Assigns agents to polling stations

3. **Election Day:**
   - Agents submit results
   - Candidate monitors in real-time
   - System aggregates results automatically

---

## Database

### Location Data Included

✅ **47 Counties** - All Kenya counties
✅ **290 Constituencies** - All official constituencies
✅ **1,474 Wards** - Generated from constituencies
✅ **4,414 Polling Stations** - Sample data (placeholder GPS)

**Note:** The 4,414 polling stations are sample data. For real elections, you'll need to import official IEBC data (~50,000 stations).

---

## Important Commands

### Seed Admin User (Already Done)
```bash
node scripts/seed-admin.js
```

### Seed Kenya Location Data (Already Done)
```bash
node scripts/seed-all-kenya-data.js
```

### Start Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
npm start
```

### Database Commands
```bash
# View all users
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "SELECT id, email, full_name, role FROM users;"

# View all candidates
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "SELECT c.id, u.full_name, c.party_name, c.position FROM candidates c JOIN users u ON c.user_id = u.id;"

# View agents for a candidate
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "SELECT a.id, u.full_name, u.email, ps.name as station FROM agents a JOIN users u ON a.user_id = u.id LEFT JOIN polling_stations ps ON a.polling_station_id = ps.id WHERE a.candidate_id = 1;"
```

---

## Security Notes

### Change Default Admin Password

After first login, update the admin password:

```bash
PGPASSWORD=dev_password_123 psql -U ukwelitally -d ukwelitally -c "UPDATE users SET password_hash = crypt('YourNewPassword', gen_salt('bf')) WHERE email = 'admin@ukwelitally.com';"
```

Or use bcrypt in Node.js to generate a new hash.

### Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

### Production Deployment

Before deploying to production:

1. Change `JWT_SECRET` in `.env`
2. Update database credentials
3. Enable HTTPS
4. Set up proper backup system
5. Configure email notifications
6. Add rate limiting
7. Enable audit logging

---

## Support

For technical issues or feature requests:
- Check the error logs
- Review the API endpoints
- Contact the development team

---

## Summary

**You are the Admin** - You sell the system to candidates and create their accounts.

**Candidates** - They buy from you, manage their agents, and view results.

**Agents** - They submit results from polling stations.

**Result:** A complete election tallying system ready to sell! 🎉

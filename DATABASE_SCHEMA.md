# UkweliTally Database Schema

## Overview
PostgreSQL database schema for election results tallying system with single trusted agent per polling station + optional backup submissions.

---

## Tables

### 1. **users**
Core user authentication and profile information.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('candidate', 'agent', 'observer', 'admin')),
  id_number VARCHAR(50) UNIQUE NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
```

### 2. **candidates**
Extended information for users with candidate role.

```sql
CREATE TABLE candidates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  position VARCHAR(100) NOT NULL CHECK (position IN ('president', 'governor', 'senator', 'mp', 'mca')),
  party_name VARCHAR(255),
  party_abbreviation VARCHAR(50),
  constituency_id INTEGER REFERENCES constituencies(id),
  county_id INTEGER REFERENCES counties(id),
  ward_id INTEGER REFERENCES wards(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE INDEX idx_candidates_position ON candidates(position);
CREATE INDEX idx_candidates_constituency ON candidates(constituency_id);
```

### 3. **agents**
Extended information for users with agent role.

```sql
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
  polling_station_id INTEGER REFERENCES polling_stations(id),
  is_primary BOOLEAN DEFAULT TRUE,
  device_id VARCHAR(255),
  last_location_lat DECIMAL(10, 8),
  last_location_lng DECIMAL(11, 8),
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE INDEX idx_agents_candidate ON agents(candidate_id);
CREATE INDEX idx_agents_station ON agents(polling_station_id);
CREATE INDEX idx_agents_primary ON agents(is_primary);
```

### 4. **counties**
Kenya's 47 counties.

```sql
CREATE TABLE counties (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(10) NOT NULL UNIQUE,
  registered_voters INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5. **constituencies**
Parliamentary constituencies within counties.

```sql
CREATE TABLE constituencies (
  id SERIAL PRIMARY KEY,
  county_id INTEGER REFERENCES counties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL UNIQUE,
  registered_voters INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(county_id, name)
);

CREATE INDEX idx_constituencies_county ON constituencies(county_id);
```

### 6. **wards**
Electoral wards within constituencies.

```sql
CREATE TABLE wards (
  id SERIAL PRIMARY KEY,
  constituency_id INTEGER REFERENCES constituencies(id) ON DELETE CASCADE,
  county_id INTEGER REFERENCES counties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL UNIQUE,
  registered_voters INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(constituency_id, name)
);

CREATE INDEX idx_wards_constituency ON wards(constituency_id);
CREATE INDEX idx_wards_county ON wards(county_id);
```

### 7. **polling_stations**
Individual polling stations.

```sql
CREATE TABLE polling_stations (
  id SERIAL PRIMARY KEY,
  ward_id INTEGER REFERENCES wards(id) ON DELETE CASCADE,
  constituency_id INTEGER REFERENCES constituencies(id) ON DELETE CASCADE,
  county_id INTEGER REFERENCES counties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  registered_voters INTEGER DEFAULT 0,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_radius INTEGER DEFAULT 500,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ward_id, name)
);

CREATE INDEX idx_polling_stations_ward ON polling_stations(ward_id);
CREATE INDEX idx_polling_stations_constituency ON polling_stations(constituency_id);
CREATE INDEX idx_polling_stations_county ON polling_stations(county_id);
CREATE INDEX idx_polling_stations_location ON polling_stations(latitude, longitude);
```

### 8. **submissions**
Form submissions from agents (primary) and observers/candidates (backup).

```sql
CREATE TABLE submissions (
  id SERIAL PRIMARY KEY,
  polling_station_id INTEGER REFERENCES polling_stations(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
  submission_type VARCHAR(20) NOT NULL CHECK (submission_type IN ('primary', 'backup', 'public')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'flagged', 'rejected')),

  -- Location verification
  submitted_lat DECIMAL(10, 8),
  submitted_lng DECIMAL(11, 8),
  location_verified BOOLEAN DEFAULT FALSE,

  -- Timestamps
  form_captured_at TIMESTAMP,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP,

  -- Device info
  device_id VARCHAR(255),
  device_type VARCHAR(50),
  ip_address VARCHAR(45),

  -- Confidence scoring
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),

  -- Flags
  has_discrepancy BOOLEAN DEFAULT FALSE,
  flagged_reason TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submissions_station ON submissions(polling_station_id);
CREATE INDEX idx_submissions_user ON submissions(user_id);
CREATE INDEX idx_submissions_candidate ON submissions(candidate_id);
CREATE INDEX idx_submissions_type ON submissions(submission_type);
CREATE INDEX idx_submissions_status ON submissions(status);
```

### 9. **submission_photos**
Photos uploaded with each submission.

```sql
CREATE TABLE submission_photos (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  photo_type VARCHAR(50) NOT NULL CHECK (photo_type IN ('full_form', 'closeup', 'signature', 'stamp', 'serial_number', 'other')),
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  width INTEGER,
  height INTEGER,
  exif_data JSONB,
  hash VARCHAR(64) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submission_photos_submission ON submission_photos(submission_id);
CREATE INDEX idx_submission_photos_type ON submission_photos(photo_type);
CREATE INDEX idx_submission_photos_hash ON submission_photos(hash);
```

### 10. **results**
Extracted/entered vote counts from submissions.

```sql
CREATE TABLE results (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  polling_station_id INTEGER REFERENCES polling_stations(id) ON DELETE CASCADE,
  position VARCHAR(100) NOT NULL CHECK (position IN ('president', 'governor', 'senator', 'mp', 'mca')),

  -- Vote counts
  registered_voters INTEGER NOT NULL,
  total_votes_cast INTEGER NOT NULL,
  valid_votes INTEGER NOT NULL,
  rejected_votes INTEGER NOT NULL,

  -- Validation
  is_valid BOOLEAN DEFAULT TRUE,
  validation_errors JSONB,

  -- OCR confidence (if applicable)
  ocr_confidence INTEGER DEFAULT 0 CHECK (ocr_confidence BETWEEN 0 AND 100),
  manually_verified BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(submission_id, position)
);

CREATE INDEX idx_results_submission ON results(submission_id);
CREATE INDEX idx_results_station ON results(polling_station_id);
CREATE INDEX idx_results_position ON results(position);
```

### 11. **candidate_votes**
Individual candidate vote counts per result.

```sql
CREATE TABLE candidate_votes (
  id SERIAL PRIMARY KEY,
  result_id INTEGER REFERENCES results(id) ON DELETE CASCADE,
  candidate_name VARCHAR(255) NOT NULL,
  party_name VARCHAR(255),
  votes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_candidate_votes_result ON candidate_votes(result_id);
CREATE INDEX idx_candidate_votes_name ON candidate_votes(candidate_name);
```

### 12. **audit_logs**
Complete audit trail of all actions.

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
```

### 13. **discrepancies**
Flagged discrepancies between submissions or vs IEBC.

```sql
CREATE TABLE discrepancies (
  id SERIAL PRIMARY KEY,
  polling_station_id INTEGER REFERENCES polling_stations(id) ON DELETE CASCADE,
  position VARCHAR(100) NOT NULL,
  primary_submission_id INTEGER REFERENCES submissions(id),
  backup_submission_id INTEGER REFERENCES submissions(id),
  discrepancy_type VARCHAR(50) NOT NULL CHECK (discrepancy_type IN ('agent_vs_backup', 'vs_iebc', 'statistical_anomaly', 'location_mismatch')),
  variance_percentage DECIMAL(5, 2),
  details JSONB,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'confirmed_error')),
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_discrepancies_station ON discrepancies(polling_station_id);
CREATE INDEX idx_discrepancies_status ON discrepancies(status);
```

### 14. **iebc_results**
Official IEBC results for comparison (scraped or manually entered).

```sql
CREATE TABLE iebc_results (
  id SERIAL PRIMARY KEY,
  polling_station_id INTEGER REFERENCES polling_stations(id) ON DELETE CASCADE,
  position VARCHAR(100) NOT NULL,
  candidate_name VARCHAR(255) NOT NULL,
  votes INTEGER NOT NULL,
  published_at TIMESTAMP,
  source_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(polling_station_id, position, candidate_name)
);

CREATE INDEX idx_iebc_results_station ON iebc_results(polling_station_id);
CREATE INDEX idx_iebc_results_position ON iebc_results(position);
```

### 15. **notifications**
User notifications and alerts.

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('info', 'warning', 'error', 'success')),
  related_entity_type VARCHAR(50),
  related_entity_id INTEGER,
  read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
```

---

## Key Design Decisions

### 1. **Single Primary Agent + Optional Backups**
- `agents.is_primary` distinguishes trusted agent from backups
- `submissions.submission_type` categorizes submissions (primary/backup/public)
- Only primary submissions used for tallying by default
- Backup submissions for verification and discrepancy detection

### 2. **Confidence Scoring**
- `submissions.confidence_score` (0-100) based on:
  - GPS accuracy (20%)
  - Photo quality (30%)
  - Math validation (20%)
  - Timely submission (15%)
  - Historical pattern match (15%)

### 3. **Location Verification**
- Each submission includes GPS coordinates
- Compared against `polling_stations.latitude/longitude`
- `location_radius` defines acceptable range (default 500m)

### 4. **Photo Deduplication**
- `submission_photos.hash` prevents same form uploaded multiple times
- SHA-256 hash of image content

### 5. **Hierarchical Geography**
- County → Constituency → Ward → Polling Station
- Results aggregate up the hierarchy
- Each level stores `registered_voters` for validation

### 6. **Multi-Position Support**
- Single station can have results for: President, Governor, Senator, MP, MCA
- `results.position` and `candidate_votes` link results to specific races

### 7. **Audit Trail**
- Every action logged in `audit_logs`
- Stores old/new values for full history
- Immutable once written

---

## Next Steps

1. Create migration scripts
2. Seed with Kenya electoral geography data (counties, constituencies, wards, polling stations)
3. Set up database connection pool
4. Create TypeScript types/interfaces matching schema

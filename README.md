# UkweliTally

Independent Election Results Tallying Platform for Kenya 2027 Elections

## Overview

UkweliTally is a web-based platform that enables candidates and their agents to independently tally and verify election results in real-time. The system provides transparency, accuracy, and verification capabilities through:

- Single trusted agent per polling station (primary submissions)
- Optional backup submissions from observers/candidates
- GPS verification and photo evidence
- Real-time aggregation and analytics
- Offline-first PWA support
- OCR form scanning

## Tech Stack
That’s a great initiative — a result-tallying platform can really help candidates and agents maintain transparency and verify official counts. Here’s a breakdown of how you can design and build such a system for the 2027 elections (likely referring to Kenya’s general elections):

⚙️ 1. Core Features

User Registration and Authentication

Roles: Candidate, Agent, Observer, Admin.

Use OTP or ID verification for authenticity.

Role-based dashboards.

Polling Station Data Input

Agents can submit results per station (e.g., Form 34A uploads).

Automatic image-to-data extraction using OCR (e.g., Google Vision or Tesseract).

Results Tallying

Aggregate votes per polling station, ward, constituency, and county.

Real-time graphs/charts (e.g., Chart.js, Recharts, or D3.js).

Verification & Validation

Compare submitted data against other agents' entries to flag inconsistencies.

Audit logs of all edits/submissions.

Analytics Dashboard

Candidate-specific summary.

Heatmaps for regional performance.

Historical comparison and projections.

Offline Functionality

Mobile-first approach with data syncing when internet is available.

Could use Progressive Web App (PWA) design.

Security

HTTPS, JWT authentication, and encrypted uploads.

Secure cloud storage (e.g., AWS S3, Google Cloud Storage).

Role-based data access and audit trail.
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL
- **Authentication**: JWT + bcrypt
- **File Storage**: Local filesystem (configurable for S3)
- **OCR**: Google Vision API (optional)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   cd ukwelitally
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and configure:
   - `DATABASE_URL`: PostgreSQL connection string
   - `JWT_SECRET`: Generate with `openssl rand -base64 32`
   - Other optional configurations

4. **Create the database**
   ```bash
   createdb ukwelitally
   ```

5. **Run migrations**
   ```bash
   psql -d ukwelitally -f src/db/migrations/001_initial_schema.sql
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

7. **Open your browser**
   ```
   http://localhost:3000
   ```

## Project Structure

```
ukwelitally/
├── src/
│   ├── app/                 # Next.js app router
│   │   ├── api/            # API routes
│   │   ├── (auth)/         # Auth pages (login, register)
│   │   ├── dashboard/      # Dashboard pages
│   │   ├── layout.tsx      # Root layout
│   │   └── page.tsx        # Landing page
│   ├── components/          # React components
│   ├── lib/                 # Utility functions
│   │   ├── db.ts           # Database connection
│   │   ├── auth.ts         # Authentication utilities
│   │   └── validation.ts   # Validation functions
│   ├── types/               # TypeScript types
│   │   └── database.ts     # Database schema types
│   └── db/                  # Database files
│       └── migrations/     # SQL migration files
├── public/                  # Static assets
├── DATABASE_SCHEMA.md      # Database documentation
└── README.md               # This file
```

## Key Features

### 1. User Roles

- **Candidate**: Registers agents, views results, monitors discrepancies
- **Agent**: Submits forms from assigned polling stations
- **Observer**: Can submit backup forms for verification
- **Admin**: System management and oversight

### 2. Submission Flow

1. Agent photographs Form 34A at polling station
2. GPS coordinates captured automatically
3. Multiple photos uploaded (full form, signatures, stamps)
4. OCR extracts data (with manual verification)
5. Math validation ensures vote counts add up
6. Confidence score calculated (0-100%)
7. Results aggregated in real-time

### 3. Verification Mechanisms

- **GPS Verification**: Submission location must be within 500m of polling station
- **Photo Deduplication**: Hash checking prevents duplicate submissions
- **Math Validation**: Total votes = valid + rejected; candidate votes sum = valid votes
- **Backup Comparison**: Optional backup submissions flagged if variance > 5%
- **IEBC Comparison**: Auto-compare with official results when available
- **Anomaly Detection**: Flags statistical outliers (>95% turnout, >90% single candidate, etc.)

### 4. Confidence Scoring

Each submission receives a confidence score (0-100%) based on:
- GPS accuracy (20%)
- Photo quality (30%)
- Math validation (20%)
- Timely submission (15%)
- Historical pattern match (15%)

## Database Schema

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema documentation.

### Key Tables

- `users`, `candidates`, `agents` - User management
- `counties`, `constituencies`, `wards`, `polling_stations` - Geographic hierarchy
- `submissions`, `submission_photos` - Form submissions
- `results`, `candidate_votes` - Vote tallies
- `discrepancies` - Flagged inconsistencies
- `iebc_results` - Official results for comparison
- `audit_logs` - Complete audit trail

## API Routes (Coming)

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/polling-stations` - List polling stations
- `POST /api/submissions` - Submit results
- `GET /api/results/:level/:id` - Get aggregated results
- `GET /api/discrepancies` - List discrepancies

## Development Roadmap

- [x] Project initialization
- [x] Database schema design
- [x] Core utilities (auth, validation, db)
- [ ] Authentication API
- [ ] Agent registration module
- [ ] Form submission workflow
- [ ] Results tallying system
- [ ] Dashboard with charts
- [ ] PWA offline support
- [ ] OCR integration
- [ ] SMS fallback
- [ ] WhatsApp bot

## Security Considerations

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with 7-day expiration
- SQL injection prevention via parameterized queries
- Role-based access control (RBAC)
- Complete audit trail
- GPS and photo verification
- Rate limiting (to be implemented)

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## Legal Disclaimer

UkweliTally is an independent platform and is NOT affiliated with or endorsed by the Independent Electoral and Boundaries Commission (IEBC). Results shown are crowd-sourced from candidate agents and should not be considered official until verified by IEBC.

## License

MIT License (adjust as needed)

## Support

For issues or questions, please open an issue on GitHub.

---

Built for transparency in Kenya's 2027 Elections 🇰🇪

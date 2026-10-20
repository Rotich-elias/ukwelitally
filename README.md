# UkweliTally

Independent Election Results Tallying Platform for Kenya 2027 Elections

## Overview

UkweliTally is a web-based platform that enables candidates and their agents to independently tally and verify election results in real-time. The system provides transparency, accuracy, and verification capabilities through:

- Single trusted agent per polling station (primary submissions)
- Optional backup submissions from observers/candidates
- GPS verification and photo evidence
- Real-time aggregation and analytics
- Offline-first PWA support
- Vote variance detection between primary and backup submissions

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL
- **Authentication**: JWT (httpOnly session cookie + bearer token), bcrypt
- **File Storage**: Local filesystem (configurable for S3)
- **Testing**: Vitest

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

4. **Create the database and run migrations**
   ```bash
   npm run db:setup      # creates the database, user and runs all migrations
   # or, against an existing database:
   npm run db:migrate
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   ```
   http://localhost:3000
   ```

## Project Structure

```
ukwelitally/
├── src/
│   ├── app/                 # Next.js app router
│   │   ├── api/            # API routes
│   │   ├── dashboard/      # Role dashboards (admin, candidate, agent, observer)
│   │   ├── layout.tsx      # Root layout
│   │   ├── middleware.ts   # Route protection for dashboard pages
│   │   └── page.tsx        # Landing page
│   ├── components/          # React components
│   ├── db/migrations/       # SQL migrations (applied in filename order)
│   ├── lib/                 # Utility functions
│   │   ├── aggregation.ts   # Result aggregation math (pure, unit tested)
│   │   ├── auth.ts          # Password hashing, JWT helpers
│   │   ├── candidate-restrictions.ts  # Candidate location scoping
│   │   ├── db.ts            # Database connection pool
│   │   ├── jwt-edge.ts      # Edge-runtime JWT verification
│   │   ├── notifications.ts # In-app notification helpers
│   │   ├── observer.ts      # Observer assignment helpers
│   │   ├── rateLimit.ts     # Request rate limiting
│   │   ├── storage.ts       # File storage backend (Blob / S3 / local disk)
│   │   ├── validation.ts    # Vote count validation, anomaly detection
│   │   └── verification.ts  # Primary/backup and IEBC comparison
│   └── types/               # TypeScript types
├── scripts/                 # Maintenance scripts (migrations, data imports)
├── tests/                   # Vitest unit tests
└── public/                  # Static assets, manifest, service worker
```

## Key Features

### 1. User Roles

- **Candidate**: Registers agents, views results, monitors discrepancies
- **Agent**: Submits forms from assigned polling stations
- **Observer**: Can submit backup forms for verification
- **Admin**: System management and oversight

Account creation is admin-only. Public self-registration is disabled, and
`POST /api/auth/register` requires an admin bearer token.

### 2. Submission Flow

1. Agent photographs Form 34A at polling station
2. GPS coordinates captured automatically
3. Multiple photos uploaded (full form, signatures, stamps)
4. Math validation ensures vote counts add up
5. Confidence score calculated (0-100%)
6. Results aggregated in real-time

### 3. Verification Mechanisms

- **GPS Verification**: Submission location must be within 500m of polling station
- **Photo Deduplication**: SHA-256 hash checking prevents duplicate submissions
- **Math Validation**: Total votes = valid + rejected; candidate votes sum = valid votes
- **Backup Comparison**: Backup submissions are compared against the primary
  submission for the same station. A variance above 5% creates a record in the
  `discrepancies` table and flags both submissions for review.
- **IEBC Comparison**: When official IEBC results have been imported, submitted
  results are compared against them and discrepancies are recorded.
- **Anomaly Detection**: Flags statistical outliers (>95% turnout, >90% single candidate, etc.)
- **Vote Integrity**: A UNIQUE constraint on `candidate_votes (result_id, candidate_name)`
  prevents a candidate being counted twice for the same result.

### 4. Confidence Scoring

Each submission receives a confidence score (0-100%) based on:
- GPS accuracy (20%)
- Photo quality (30%)
- Math validation (20%)
- Timely submission (15%)
- Historical pattern match (15%)

### 5. Aggregation

Vote totals are computed over the set of distinct verified primary results for
the requested area. Every candidate's percentage is measured against the same
denominator (total valid votes in scope), so percentages are directly
comparable and sum to 100%.

## Database Schema

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema documentation.

### Key Tables

- `users`, `candidates`, `agents` - User management
- `counties`, `constituencies`, `wards`, `polling_stations` - Geographic hierarchy
- `submissions`, `submission_photos` - Form submissions
- `results`, `candidate_votes` - Vote tallies
- `discrepancies` - Flagged inconsistencies
- `iebc_results` - Official results for comparison
- `notifications` - In-app notification feed
- `audit_logs` - Complete audit trail
- `schema_migrations` - Applied migration tracking

## Migrations

Migrations live in `src/db/migrations/` and are applied in filename order. Each
runs in its own transaction and is recorded in `schema_migrations`.

```bash
npm run db:migrate          # apply pending migrations
npm run db:migrate:status   # show applied/pending without applying
```

## API Routes

### Authentication
- `POST /api/auth/login` - Log in (sets an httpOnly session cookie and returns a bearer token)
- `POST /api/auth/logout` - Clear the session cookie
- `POST /api/auth/register` - Create a user (admin only)

### Submissions
- `GET /api/submissions` - List submissions (scoped by role)
- `POST /api/submissions` - Create a submission with photos
- `GET /api/submissions/review-queue` - Submissions awaiting review
- `POST /api/submissions/:id/review` - Approve, reject or request revision
- `GET /api/submissions/:id/reviews` - Review history

### Results
- `POST /api/results` - Record a result for a submission
- `GET /api/results/aggregate` - Aggregated results for an area
- `GET /api/polling-stations/reporting-status` - Per-station reporting status
- `GET /api/polling-stations/:id/detailed-results` - All submissions for a station

### Administration
- `GET/POST /api/admin/users` - List and create users
- `PUT /api/admin/users/:id` - Update a user
- `POST /api/admin/users/:id/payment` - Record a candidate payment
- `GET/POST /api/admin/volunteers` - Volunteer registrations
- `GET/POST/PUT/DELETE /api/ballot-candidates` - Ballot candidate management
- `GET /api/candidates` - List candidates by position
- `GET /api/agents`, `GET /api/agents/me` - Agent records
- `GET /api/observers/me` - Observer assignment and station
- `GET /api/notifications` - In-app notifications
- `POST /api/volunteers` - Public volunteer registration

## Security Considerations

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with 7-day expiration
- Session cookie is httpOnly and sameSite=lax
- SQL injection prevention via parameterized queries
- Role-based access control (RBAC) on every API route
- Dashboard pages protected by route middleware in addition to API checks
- Complete audit trail
- GPS and photo verification
- Rate limiting on login, registration and volunteer signup
- Placeholder candidates used internally for observer submissions are excluded
  from every ballot candidate list and from result aggregation

## Deployment

The app runs on Vercel with a hosted PostgreSQL database. See
[DEPLOYMENT.md](./DEPLOYMENT.md) for the full walkthrough.

Quick summary:

1. Create a hosted Postgres database (Neon, Supabase, Vercel Postgres, Railway)
   and use its **pooled** connection string
2. Set `DATABASE_URL` and a fresh `JWT_SECRET` in the Vercel project
3. Connect a Vercel Blob store (or S3 bucket) for uploaded evidence — the
   local filesystem is ephemeral on Vercel
4. Bootstrap the database:
   ```bash
   DATABASE_URL='postgresql://...' npm run db:bootstrap
   ```
   This applies all migrations, loads the Kenya electoral geography and
   creates the first admin account
5. `git push origin main`

## Development Roadmap

- [x] Project initialization
- [x] Database schema design
- [x] Core utilities (auth, validation, db)
- [x] Authentication API
- [x] Agent registration module
- [x] Form submission workflow
- [x] Results tallying system
- [x] Dashboard with charts
- [x] PWA offline support
- [x] Backup vs primary discrepancy detection
- [x] Notification feed
- [ ] OCR integration
- [ ] SMS fallback
- [ ] WhatsApp bot

## Testing

```bash
npm test          # run the unit test suite
npm run test:watch
npm run typecheck
npm run lint
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Add tests for new behaviour
4. Test thoroughly
5. Submit a pull request

## Legal Disclaimer

UkweliTally is an independent platform and is NOT affiliated with or endorsed by the Independent Electoral and Boundaries Commission (IEBC). Results shown are crowd-sourced from candidate agents and should not be considered official until verified by IEBC.

## License

MIT License (adjust as needed)

## Support

For issues or questions, please open an issue on GitHub.

---

Built for transparency in Kenya's 2027 Elections 🇰🇪

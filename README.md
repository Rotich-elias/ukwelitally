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

### 6. Submission Control and Fallback Reviews

Result submission is a candidate-controlled permission, separate from the
account status and from the purchased subscription:

| Concept | Stored in | Controlled by |
|---|---|---|
| Login account | `users.active` | Platform administrator |
| Purchased access | `candidates.access_status` | Platform administrator |
| Submission permission | `submission_windows` | The candidate |

- A reporting window is **closed by default**. The candidate opens, closes or
  schedules it from the candidate dashboard. The server clock decides when a
  window opens and expires, so a schedule applies whether or not the
  candidate is signed in.
- Every open, close, schedule and cancel action is written to `audit_logs`.
- Agents and observers can always sign in; only submitting a result is
  blocked while the window is closed. The check runs on the server, so a
  stale browser tab cannot bypass it, and the window row is locked inside the
  transaction that writes a result.
- An agent submission is a **primary result**. An observer submission is an
  **alternative result** (`submissions.submission_origin = 'observer'`) and
  never replaces an agent result on its own.
- The candidate reviews observer submissions and may approve one as the
  **fallback** for a polling station. That is only possible while no agent
  result exists for that station and position. A zero-vote agent result is a
  result, not a missing one.
- `selected_results` records the single result that counts for a polling
  station and position, with `source` telling agent primary results and
  candidate approved observer fallbacks apart.
- When an agent result arrives after a fallback was approved, the approved
  fallback is not replaced. The conflict is recorded in `discrepancies` and
  the candidate resolves it explicitly.

### Reporting scope of an observer submission

An observer reports a race at a polling station, and the reporting scope is
resolved explicitly:

- The scope is the candidates that run for that race, whose electoral area
  contains the station, **and** that have a team (an assigned agent) at that
  station.
- Only a window from that scope can authorise the submission. A window of a
  candidate who runs for another race, or who has no team at that station,
  never authorises anything — including a presidential candidate who is
  collecting results in another county.
- A candidate whose subscription is suspended or revoked is not part of the
  scope.
- The submission records the candidate that authorised it in
  `submissions.scope_candidate_id`, so the authorisation is auditable.
- The scope is re-read inside the transaction that writes the result, so a
  team that is withdrawn from the station in the meantime cannot authorise a
  submission.

### Versioned corrections

A correction never overwrites the submission it corrects:

| Column | Meaning |
|---|---|
| `revision_number` | 1 is the original, 2 the first correction, and so on |
| `supersedes_submission_id` | The submission this version corrects |
| `superseded_by_submission_id` | The approved version that replaced this one |
| `revision_reason` | Why the submitter corrected the previous version |

- The original submission keeps its figures, its evidence and its audit
  trail. The correction is stored as the next version and links back to it.
- A correction requires a reason. The correcting user, the time and the
  relationship are written to `audit_logs`.
- `selected_results` only ever points at an approved version. A version that
  is flagged or rejected releases the selection, and an approved correction
  takes it over. A correction that is never approved, or that fails, leaves
  the selected result untouched.
- The unique index on a submission now includes the revision number, so one
  version cannot be stored twice while the history stays intact.

### Images and evidence

Candidate photos and the evidence uploaded with a submission are stored
through the storage adapter in `src/lib/storage.ts`, and the database only
ever holds the storage key (for example `candidate-photos/1712-photo.jpg`),
never a temporary path or a browser URL.

| | Local development | Production |
|---|---|---|
| Backend | the local disk, in `./.uploads` | Vercel Blob or an S3 compatible store |
| Configured by | `UPLOAD_DIR` | `BLOB_READ_WRITE_TOKEN` or `S3_BUCKET` with the `S3_*` credentials |
| Served by | `/api/uploads/<key>` (public files) | the same route, or the store's own URL |

- The local directory moved out of `/tmp` on purpose: the operating system
  clears `/tmp`, so the photos and the evidence used to disappear from the
  database on the next reboot.
- **On Vercel the filesystem is ephemeral.** Without a durable store an upload
  would be written to a disk that is thrown away with the function instance,
  so the upload is refused with an explanation instead of being silently
  lost. Connect Vercel Blob or an S3 compatible store before going live; no
  new dependency or account is needed, both adapters are already installed.
- Candidate photos are public: they are served by `/api/uploads/<key>`.
- **Submission evidence is private.** It is served by
  `/api/submission-photos/:id`, which only lets the submitter, the candidate
  of the team and an administrator read it. A leaked id does not expose it.
- A stored reference that no longer points at a file (a record from before
  the storage was made durable) is reported as "unavailable" and the interface
  shows a placeholder. The database record is kept.

### Maintaining the wards and the polling stations

The electoral geography is reference data the platform administrator owns.
It used to be maintainable only with a command line script that connected
straight to the database; the location endpoints were read only.

**Admin dashboard → Locations** now lists, edits and creates them, and loads
the official IEBC files in bulk.

| Action | Endpoint |
|---|---|
| List the wards | `GET /api/admin/locations/wards` |
| Create or update a ward | `POST /api/admin/locations/wards`, `PUT /api/admin/locations/wards/:id` |
| Delete a ward | `DELETE /api/admin/locations/wards/:id` |
| List the polling stations | `GET /api/admin/locations/polling-stations` |
| Create or update a station | `POST /api/admin/locations/polling-stations`, `PUT /api/admin/locations/polling-stations/:id` |
| Delete a station | `DELETE /api/admin/locations/polling-stations/:id` |
| Bulk import and placeholder cleanup | `POST /api/admin/locations/import` |

The rules the write path enforces:

- The code of a ward and of a polling station is unique.
- A ward follows its constituency and a polling station follows its ward: the
  county and the constituency are derived, never typed in.
- A ward that is moved takes its polling stations with it.
- A ward that still has polling stations, and a polling station that has
  submissions or an agent, is not deleted.
- Every change is written to the audit trail.

**The bulk import** takes the official IEBC polling station file. It must
carry the eight IEBC columns:

| Column | Meaning |
|---|---|
| `County` | County name |
| `Constituency` | Constituency name |
| `Ward` | Ward name |
| `IEBC Code` | Polling station code |
| `Polling Station` | Polling station name |
| `Stream` | Stream of a station split into streams |
| `Registration Centre` | Registration centre of the station |
| `Registered Voters` | Registered voters for the stream |

A station is matched by its code and stream, and by its name inside its ward
as a fallback, so the columns a row leaves out can be taken from the record it
matches. The file then replaces the platform's polling stations: every
existing station, together with the agents, volunteers, submissions and results
attached to it, is deleted before the rows of the file are written. A missing
ward, constituency or county is created from the county down before the station
is written. A level that already exists is matched by name and keeps its code.
The names are compared without their case and without their extra spaces, so
the official files match as they are. An import with no valid row deletes
nothing.

**The preview** (the "Preview" button) reads the file with the same planner
the import writes with, and writes nothing:

| Reported | Meaning |
|---|---|
| Rows read | The rows of the file, the header apart |
| To create | The rows that would be added |
| To delete | The existing stations the import would remove |
| To skip | The rows that would not be written |
| With errors | The rows that carry at least one error |

Every problem is reported with the line of the file and a message that says
what to do about it: a code that the file uses twice, a row without a name
or without a code, a new station without a ward or a constituency, a code
that is too long. A warning, such as a county of the file that is not the
county of the constituency, is reported as well, but the row is still
written. A file that leaves out any of the eight required columns is refused
with the names of the missing columns.

**The placeholder wards** the geography seeder generates
("Constituency Ward 1", "Ward 2" …) are removed by the same screen once the
real IEBC wards are loaded. A placeholder ward that still has polling
stations or an agent attached to it is kept, and the preview says why.

The older command line scripts still work and are unchanged:
`scripts/import-iebc-data.js` (upserts by code), `scripts/import-locations.js`
(insert only), `scripts/seed-iebc-geography.js --wipe` (destructive reseed) and
the `scripts/update-*-voters.js` helpers.

### Assigning agents
A candidate assigns agents to the polling stations inside their own
electoral area, and the scope follows from their race:

| Race | Stations they may assign |
|---|---|
| Member of county assembly | the stations of their ward |
| Member of parliament | the stations of their constituency |
| Governor, senator, woman representative | the stations of their county |
| President | every station in the country, with county, constituency, ward and text filters |

- The candidate never has to select the county, constituency and ward they
  already belong to.
- The scope is derived on the server from the saved candidate profile
  (`src/lib/agentScope.ts`) and applied by `GET /api/candidates/stations`
  and by the assignment API, so the interface and the API cannot disagree.
- A station outside the scope is refused, also when it is sent by hand
  through the API or through the CSV import.
- A station has one primary agent per team: a second primary agent at the
  same station is refused.

## Database Schema
See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema documentation.

### Key Tables

- `users`, `candidates`, `agents` - User management
- `counties`, `constituencies`, `wards`, `polling_stations` - Geographic hierarchy
- `submissions`, `submission_photos` - Form submissions
- `results`, `candidate_votes` - Vote tallies
- `submission_windows` - Candidate controlled reporting windows
- `selected_results` - The result that counts per polling station and position
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
- `GET /api/submissions/window` - The reporting window of the signed in agent or observer
- `GET /api/submission-photos/:id` - Serve submission evidence (submitter, candidate of the team, admin)

### Submission control
- `GET /api/candidates/submission-window` - Window state and submission counters (candidate)
- `POST /api/candidates/submission-window` - Open, close, schedule or cancel the window (candidate)
- `GET /api/candidates/observer-submissions` - Observer review queue (candidate)
- `POST /api/candidates/observer-submissions/:id/fallback` - Approve or reject a fallback (candidate)
- `GET /api/candidates/submission-conflicts` - Agent versus fallback conflicts (candidate)
- `POST /api/candidates/submission-conflicts/:id/resolve` - Resolve a conflict (candidate)

### Results
- `POST /api/results` - Record a result for a submission
- `GET /api/results/aggregate?position=<race>` - Aggregated results for an area
- `GET /api/polling-stations/reporting-status?position=<race>` - Per-station reporting status for one race
- `GET /api/polling-stations/:id/detailed-results?position=<race>` - Submissions for a station and race

A submission belongs to a candidate, and therefore to exactly one race. The
reporting counters above only count submissions whose candidate has the
requested position, so a presidential submission at a polling station does not
mark that station as reported for the MCA race in the same ward. A candidate
account is always forced to its own position and electoral area; the `position`
query parameter cannot be used to read another race.

### Administration
- `GET/POST /api/admin/users` - List and create users
- `PUT /api/admin/users/:id` - Update a user
- `POST /api/admin/users/:id/payment` - Record a candidate payment
- `GET/POST /api/admin/volunteers` - Volunteer registrations
- `GET/POST/PUT/DELETE /api/ballot-candidates` - Ballot candidate management
- `GET /api/candidates` - List candidates by position
- `GET /api/candidates/stations` - The polling stations the candidate may assign an agent to
- `GET/POST /api/admin/locations/wards` - Maintain the wards (admin)
- `PUT/DELETE /api/admin/locations/wards/:id` - Update or delete a ward (admin)
- `GET/POST /api/admin/locations/polling-stations` - Maintain the polling stations (admin)
- `PUT/DELETE /api/admin/locations/polling-stations/:id` - Update or delete a station (admin)
- `POST /api/admin/locations/import` - Bulk import of the IEBC files, placeholder cleanup (admin)
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

## Branding

The favicon, PWA icons and social share image are generated from the brand
logo by `scripts/generate-icons.js`. It crops the emblem out of the source
image, masks it to a circle with transparent corners and writes every size the
app needs.

```bash
npm run icons -- ~/Downloads/ukwelitally-logo.jpeg
```

Generated files:

| File | Purpose |
|---|---|
| `src/app/icon.png` | Browser tab icon (Next.js file convention) |
| `src/app/apple-icon.png` | iOS home screen icon |
| `src/app/favicon.ico` | Legacy favicon (16/32/48) |
| `src/app/opengraph-image.png` | Social share card |
| `public/icons/icon-*.png` | PWA manifest icons, plus maskable variants |

### Installing the app

UkweliTally is installable: `public/manifest.json` describes the app, and
`public/sw.js` is registered by `src/app/ServiceWorkerRegistrar.tsx`.

An **Install App** button sits on the landing page, next to the main
actions, and in the navigation of the dashboard.

| Browser | What happens |
|---|---|
| Chrome, Edge, Opera and the other Chromium browsers | The button shows the install prompt of the browser |
| Safari on iPhone and iPad | The button explains how to add the app to the home screen |
| Safari on a computer | The button explains how to add the app to the Dock |
| Firefox | The button explains that Firefox cannot install a web app |
| An address that is not secure | The button explains that an installation needs https |

The app never claims that it can be installed on its own: the native prompt
is only offered when the browser hands it over, which it only does when the
manifest, the service worker and the secure origin are all in place. The
button disappears once the app runs as an installed app.

### Report letterhead

Candidates download their results from the candidate dashboard as a PDF
report. The document is built in the browser by `src/lib/reportPdf.ts` using
[jsPDF](https://github.com/parallax/jsPDF) and `jspdf-autotable`, and the PDF
engine is only loaded once a report is requested.

The letterhead reuses the same emblem (`public/icons/icon-192x192.png`) and the
contact details held in `src/lib/branding.ts`, so the wording stays in sync
with the rest of the app:

| Element | Source |
|---|---|
| Emblem, wordmark, tagline | `src/lib/branding.ts` and `public/icons/` |
| Contact details (email, WhatsApp, site) | `src/lib/branding.ts` |
| Page footer and "Page X of Y" | `src/lib/reportPdf.ts` |

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

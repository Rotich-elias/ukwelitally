# Deploying to Vercel

This guide covers deploying UkweliTally to Vercel with a hosted PostgreSQL
database.

## Prerequisites

- A Vercel account and a project connected to this repository
- A hosted PostgreSQL database (Neon, Supabase, Vercel Postgres, Railway, etc.)
- A Vercel Blob store (or S3-compatible bucket) for uploaded evidence

---

## 1. Provision the database

Create a free PostgreSQL database. Any of these work:

| Provider | How to get the connection string |
|---|---|
| **Neon** | [neon.tech](https://neon.tech) -> create project -> connection string |
| **Supabase** | [supabase.com](https://supabase.com) -> project -> Settings -> Database |
| **Vercel Postgres** | Vercel Dashboard -> Storage -> Create Database |
| **Railway** | [railway.app](https://railway.app) -> new project -> Postgres |

Copy the **pooled** connection string. It looks like:

```
postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

> **Use the pooled endpoint**, not the direct one. Serverless functions open
> many short-lived connections, and the pooled endpoint multiplexes them
> through a single connection to protect the database's connection limit.

---

## 2. Connect the database to the Vercel project

**Option A - Vercel Storage tab (easiest)**

1. Open your project in the Vercel Dashboard
2. Go to **Storage** -> **Create Database** (or connect an existing provider)
3. Vercel sets `DATABASE_URL` automatically

**Option B - Environment variables manually**

1. Open your project in the Vercel Dashboard
2. Go to **Settings** -> **Environment Variables**
3. Add the values below

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | your pooled connection string | **Required** |
| `JWT_SECRET` | `openssl rand -base64 32` | **Required.** Generate a new one for production |
| `NEXT_PUBLIC_APP_URL` | `https://ukwelitally.vercel.app` | Used to build absolute URLs |
| `BLOB_READ_WRITE_TOKEN` | set automatically by Vercel Blob | Or see option B below |
| `DATABASE_SSL` | `require` | Only if your provider needs it explicitly |
| `DATABASE_POOL_MAX` | `5` | Connections per function instance |

The app also accepts `POSTGRES_URL` and `PG_URL` as fallbacks for
`DATABASE_URL`.

> **Important:** set the variables for **all three environments**
> (Production, Preview, Development) unless you only need Production.

---

## 3. Configure file storage

The local filesystem on Vercel is **ephemeral**. Files written by one
function invocation are not visible to the next, so uploaded Form 34A evidence
would silently disappear. A durable object store is required in production.

**Option A - Vercel Blob (recommended)**

1. Vercel Dashboard -> project -> **Storage** -> **Create Blob Store**
2. Connect it. `BLOB_READ_WRITE_TOKEN` is set automatically.

**Option B - S3 compatible**

Works with AWS S3, Cloudflare R2, Supabase Storage, MinIO:

```
S3_BUCKET=ukwelitally-evidence
S3_REGION=auto
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=xxx
S3_SECRET_ACCESS_KEY=xxx
S3_PUBLIC_URL=https://cdn.example.com     # optional
```

**Option C - local disk (development only)**

Leave the storage variables unset. Uploads are written to
`/tmp/ukwelitally-uploads`. This works with `npm run dev` but **not** on
Vercel.

---

## 4. Run the migrations and seed the database

The database starts empty. Run the bootstrap script locally against the hosted
connection string:

```bash
# Use the production connection string
DATABASE_URL='postgresql://user:password@host/db?sslmode=require' \
  node scripts/bootstrap-db.js
```

This will:

1. Apply every migration in `src/db/migrations/` (tracked in `schema_migrations`)
2. Load the Kenya electoral geography (counties, constituencies, wards)
3. Create the initial admin account

Options:

```bash
# Use a different admin email/password
node scripts/bootstrap-db.js --admin-email you@example.com --admin-password 'YourPassword123'

# Skip creating the admin account
node scripts/bootstrap-db.js --skip-admin
```

> Change the admin password immediately after the first login.

To re-run only the migrations:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
```

To check which migrations have been applied:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate:status
```

---

## 5. Deploy

```bash
git push origin main
```

Vercel builds automatically. Watch the build log for the deployment URL.

For a preview build first:

```bash
npx vercel
```

---

## 6. Verify the deployment

```bash
# Public results should return JSON, not an error
curl https://ukwelitally.vercel.app/api/results/aggregate?position=president

# Login should succeed
curl -X POST https://ukwelitally.vercel.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ukwelitally.com","password":"Admin123"}'
```

Then sign in at `https://ukwelitally.vercel.app/login`.

---

## Troubleshooting

**`{"error":"Internal server error"}` on every API call**

The database is not configured or not reachable.

- Confirm `DATABASE_URL` is set in the Vercel project and applies to the
  environment you are testing
- Confirm the connection string uses the **pooled** endpoint
- Confirm `?sslmode=require` is present
- Check the function logs in the Vercel Dashboard for the real error

**`could not determine data type of parameter`**

A query is binding a parameter that is not referenced. This usually means a
migration is missing. Run `npm run db:migrate` against the hosted database.

**Uploaded photos disappear**

The storage backend is local disk. Connect Vercel Blob or an S3 bucket. Check
the function logs for `[storage] Using <backend> backend`.

**`too many connections`**

Lower `DATABASE_POOL_MAX` (try `2` or `1`) and make sure you are using the
pooled connection string.

**Migrations fail partway**

Each migration runs in its own transaction, so a failure leaves the database
consistent. Fix the cause and re-run `npm run db:migrate`; already-applied
migrations are skipped.

---

## Notes

- **Region.** `vercel.json` pins functions to `cpt1` (Cape Town), the closest
  Vercel region to Kenya. If your database is elsewhere, change `regions` in
  `vercel.json` to match the database region for the lowest latency.
- **Pool size.** The default is 5 connections per instance. Vercel can run
  many instances concurrently, so keep this low and use the pooled endpoint.
- **Rate limiting.** The built-in limiter is per-instance and therefore not
  shared across concurrent instances. For stricter limits, use a shared store
  (Upstash Redis) via the Vercel Marketplace.

# Deploying to Vercel

This guide covers deploying UkweliTally to Vercel with a hosted PostgreSQL
database.

## Prerequisites

- A Vercel account and a project connected to this repository
- A hosted PostgreSQL database (Neon, Supabase, Vercel Postgres, Railway, etc.)
- A Vercel Blob store (or S3-compatible bucket) for uploaded evidence

---

## 1. Provision the database

### Neon (recommended)

Create a free account at [neon.tech](https://neon.tech), then either use the
Console or the CLI.

**With the CLI (recommended - it prints the right strings):**

```bash
npm install -g neonctl
neonctl auth

node scripts/neon-setup.js
```

This creates the project and prints both connection strings. Add `--push` to
also set them in Vercel automatically.

**With the Console:**

1. Create a project (pick a region close to Kenya - `aws-eu-west-1` or
   `aws-eu-central-1`)
2. Click **Connect** in the nav
3. In the **Connect to your branch** modal, pick your branch, compute,
   database and role
4. Leave **Connection pooling** ON for the application connection string
5. Copy both strings - see the note below

### Other providers

| Provider | How to get the connection string |
|---|---|
| **Supabase** | [supabase.com](https://supabase.com) -> project -> Settings -> Database |
| **Vercel Postgres** | Vercel Dashboard -> Storage -> Create Database |
| **Railway** | [railway.app](https://railway.app) -> new project -> Postgres |

---

### Two connection strings, not one

This matters for Neon and Supabase. Both put a **pooler** (PgBouncer) in
front of the database. The pooler is what lets thousands of serverless
invocations share a small number of real connections, but it runs in
*transaction pooling* mode, where session-level state is lost between
transactions.

| Variable | Which string | Used for |
|---|---|---|
| `DATABASE_URL` | **Pooled** (hostname ends in `-pooler`) | The running application |
| `DATABASE_URL_DIRECT` | **Direct** (no `-pooler`) | Migrations, seeding, `pg_dump` |

Neon's pooled string looks like:

```
postgresql://user:password@ep-xxx-pooler.aws-eu-west-1.aws.neon.tech/neondb?sslmode=require
```

and the direct one is the same without `-pooler`.

If you only set `DATABASE_URL`, migrations still run - they just use the
pooled connection, which is less reliable for schema changes.

### TLS

Hosted providers require TLS. The app detects this automatically: it adds
`sslmode=require` to the connection string unless the host is `localhost` or
an `sslmode` is already present. `DATABASE_SSL` overrides the detection
(`disable`, `require`, `verify-ca`, `verify-full`).

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
| `DATABASE_URL` | pooled connection string | **Required** |
| `DATABASE_URL_DIRECT` | direct connection string | Recommended, used for migrations |
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
connection strings:

```bash
# Pooled for the app, direct for migrations
DATABASE_URL='postgresql://user:pass@ep-xxx-pooler.region.neon.tech/neondb?sslmode=require' \
DATABASE_URL_DIRECT='postgresql://user:pass@ep-xxx.region.neon.tech/neondb?sslmode=require' \
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
DATABASE_URL_DIRECT='postgresql://...' npm run db:migrate
```

To check which migrations have been applied:

```bash
DATABASE_URL_DIRECT='postgresql://...' npm run db:migrate:status
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
**pooled** connection string. On Neon, check the **Monitoring** page for
pooler client connections.

**Migrations fail partway**

Each migration runs in its own transaction, so a failure leaves the database
consistent. Fix the cause and re-run `npm run db:migrate`; already-applied
migrations are skipped.

**Neon: `relation "public.xxx" does not exist`**

You are connected through the pooler and a session-level `search_path` was
lost between transactions. Run migrations with `DATABASE_URL_DIRECT` set to
the direct (non-pooler) connection string.

**Neon: the compute goes to sleep**

Neon's free tier scales compute to zero after a period of inactivity. The
first request after that is slower (cold start) but works normally. Upgrade
to a paid plan to keep it always-on.

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

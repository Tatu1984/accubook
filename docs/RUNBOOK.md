# accubook — operations runbook

Last updated: 2026-05-04. This is the day-1 ops doc — what to do when
the app is on fire, how to deploy, how to rotate secrets, how to back
up. Update it every time you fix a real prod incident.

## On-call quickstart

| Symptom | First check | Likely cause |
|---|---|---|
| `GET /api/health` returns 503 with `db.ok: false` | Neon dashboard — is the DB online? | Neon serverless idled (auto-resumes); pooler URL wrong; password rotated without env update |
| `/api/health` returns 503 with `migrations.drift: [...]` | `npx prisma migrate status` | Last deploy didn't run `migrate deploy` — re-deploy with the build command intact |
| Customer reports "voucher number 500" | Filter logs for `P2002` (unique constraint) | Pre-NumberCounter race — should be impossible post-`6e4efc1`. If it recurs, check the route's call to `nextNumber` |
| Customer reports "approval inbox empty but I submitted a voucher" | Check `Approval` table for the voucher's id; check workflow `isActive` | Workflow not configured; user has no permission `approvals:read` |
| Cron sweep didn't run | `POST /api/cron/check-overdue` with `Authorization: Bearer <CRON_SECRET>` returns? | `CRON_SECRET` env var unset / rotated without updating the cron service |

## Deployment

The build runs `prisma migrate deploy && prisma generate && next build`
(see `vercel.json`). Migrations apply on every deploy; `_prisma_migrations`
prevents replays.

Pre-deploy checklist:
- [ ] `npm run build` passes locally
- [ ] `npm test` passes (currently 353/353)
- [ ] `npx tsc --noEmit` clean
- [ ] If schema changed: a migration directory exists at `prisma/migrations/N_*/`
- [ ] All required env vars set on Vercel for Production + Preview + Development scopes (see `.env.example`)

Post-deploy verification:
- [ ] `curl https://<app>/api/health` returns 200 with `migrations.ok: true`
- [ ] Sign in as `admin@accubook.com / password123!` (rotate after first real
  customer onboards — see "Secret rotation" below)
- [ ] Hit `/api/health` once more after 60s to ensure no startup race

## Database backups (Neon)

Neon provides Point-in-Time Recovery (PITR) for free-tier projects up to 7
days back; paid plans extend to 30 days. PITR is automatic; no setup
required. To restore:

1. Neon dashboard → project → "Restore" tab.
2. Pick a target timestamp.
3. Neon provisions a fresh branch at that timestamp.
4. Update Vercel env `DATABASE_URL` to point at the restored branch's
   pooler URL.
5. Re-deploy (the build will re-run `migrate deploy` against the
   restored branch — should be a no-op if the timestamp is post-most-
   recent-migration).

For a manual snapshot (e.g. before a risky migration):

```bash
# from your laptop, with the direct (non-pooler) DATABASE_URL set:
pg_dump --format=custom --no-owner --no-privileges \
  --file="accubook-$(date -u +%Y%m%dT%H%M%SZ).dump" \
  "$DATABASE_URL"
```

Restore that dump to a fresh DB:

```bash
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname="$NEW_DATABASE_URL" \
  accubook-20260504T120000Z.dump
```

## Secret rotation

| Secret | When to rotate | How |
|---|---|---|
| `DATABASE_URL` (Neon password) | First production deploy + every 90d | Neon dashboard → Settings → Reset password → update Vercel env → redeploy |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | First real user signup + every 180d | `openssl rand -base64 32` → update Vercel env → redeploy. **Existing JWTs invalidate immediately; users must re-sign-in.** |
| `RESEND_API_KEY` | If exposed | Resend dashboard → API keys → revoke + new → update env |
| `CRON_SECRET` | Quarterly | `openssl rand -base64 32` → update env on Vercel AND on the calling cron service (Vercel Cron / GitHub Actions) **simultaneously** |

## Migration playbook

### Creating a new migration

1. Edit `prisma/schema.prisma`.
2. `mkdir prisma/migrations/N_short_name`
3. Write the SQL by hand in `migration.sql` (we can't use `migrate dev`
   without a shadow DB URL — see `prisma.config.ts`).
4. `npx prisma migrate deploy` against Neon to apply it.
5. `npx prisma generate` to refresh the client.
6. Commit `prisma/migrations/N_*/migration.sql` AND the schema change
   in the same commit.

### Reverting a migration

There's no `migrate down`. Either:
- Write a NEW migration that reverses the change (preferred), or
- Restore from PITR (last resort — loses any data added after the bad
  migration).

### Migration drift detected by `/api/health`

Symptoms: `migrations.drift: ["N_foo"]` non-empty.

```bash
npx prisma migrate status
# If output mentions un-applied migrations:
npx prisma migrate deploy
# Then re-check /api/health
```

If `prisma migrate deploy` errors out on a specific migration, read the
SQL — usually a non-idempotent ALTER. Make the SQL idempotent (`IF NOT
EXISTS`, `IF EXISTS`) and re-apply.

## Known operational tradeoffs

- **Connection pool capped at 3 in production** (`src/backend/database/client.ts`).
  Serverless functions reuse connections aggressively but a sudden
  burst of cron + UI traffic can starve. Symptoms: `connectionTimeoutMillis`
  errors in logs. Mitigations: stagger cron, increase pool, or move cron
  to a separate runtime.
- **Voucher numbering uses `NumberCounter` upserts** (race-safe). Bills,
  invoices, payments, receipts, vouchers all share this pattern.
- **Approval auto-promote happens inside the same tx as the approval
  PATCH** (`maybePromoteEntity`). If the entity is a Voucher → ledger
  balances apply atomically. Refunds aren't possible mid-tx; the whole
  thing rolls back if any step fails.

## Index of cron-friendly endpoints

| Endpoint | Auth | Cadence |
|---|---|---|
| `POST /api/cron/check-overdue` | Bearer `CRON_SECRET` | Daily, e.g. 0 3 * * * |
| `POST /api/organizations/[orgId]/recurring-invoices/run` | Session + `invoices:create` | Daily per org |
| `POST /api/organizations/[orgId]/notifications/check-overdue` | Session + `settings:read` | Manual / per-org cron |

Set up the daily sweep in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-overdue",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Vercel Cron auto-injects an `Authorization: Bearer ${CRON_SECRET}`
header when `CRON_SECRET` is set as an env var matching Vercel's
naming convention.

## Incident severity guidance

- **SEV1**: Books corruption (Dr ≠ Cr in any voucher, AP/AR drift, voucher
  number collision) — rollback the DEPLOY, then PITR the DB to before
  the bad write.
- **SEV2**: Auth broken, GST returns produce wrong totals, payment
  posting fails — page the on-call + open an incident channel.
- **SEV3**: Single-customer / single-page issues, slow queries, dashboard
  widgets blank — file a ticket; usually a non-blocking fix in next
  deploy.

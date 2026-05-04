# accubook

Multi-tenant accounting platform built on Next.js 16, Prisma 7, and PostgreSQL (Neon). India-first financial core with multi-org / multi-branch support; international and AI features on the roadmap (see `update.md`).

## Stack

- **Next.js 16** App Router, React 19, React Compiler, TypeScript strict
- **Prisma 7** + **`@prisma/adapter-pg`** + **`pg`** against **Neon** Postgres (pooler)
- **NextAuth v5** (Credentials, JWT sessions)
- **Tailwind v4** + **shadcn/ui** ("new-york" style)
- **Zustand** for client state, **TanStack Query** + **TanStack Table**
- **Vitest** for tests, **pino** for structured logs

## Repo layout

```
src/
├── app/                          # Next.js routes (pages + API handlers)
│   ├── (auth)/                   # login, register, forgot-password
│   ├── (dashboard)/              # protected app: accounting, banking, sales, purchases, inventory, hr, reports, ...
│   └── api/                      # route handlers — mostly thin shells calling into src/backend/
├── backend/
│   ├── database/client.ts        # Prisma client singleton
│   ├── services/auth.service.ts  # NextAuth config
│   └── utils/                    # money.ts, posting.ts, with-org-auth.ts, logger.ts, payroll-calculations.util.ts
├── frontend/
│   ├── components/{ui,layout,features}
│   └── hooks/
├── shared/
│   ├── types/                    # TS types shared between frontend & backend
│   └── utils/common.util.ts      # shadcn `cn()`
├── config/env.ts                 # zod-validated process.env (single source of truth)
└── generated/prisma/             # Prisma client output (gitignored, regenerated on `prisma generate`)
```

Path aliases (see `tsconfig.json`): `@/*`, `@/backend/*`, `@/frontend/*`, `@/shared/*`, `@/config/*`.

## Getting started

Prereqs: Node 20+, npm.

```bash
npm install
cp .env.example .env             # then fill in DATABASE_URL + AUTH_SECRET
npx prisma generate
npx prisma db push               # OR `prisma migrate deploy` once migrations land
npm run db:seed                  # creates demo admin (refuses in production unless ALLOW_PROD_SEED=true)
npm run dev
```

Open <http://localhost:3000>. Demo creds (dev only, when `NEXT_PUBLIC_DEMO=true`): `admin@accubooks.com` / `admin123`.

## Environment variables

Validated at boot via `src/config/env.ts` — bad config crashes startup with a clear error.

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooler URL with `sslmode=require&channel_binding=require` |
| `AUTH_SECRET` | yes | ≥32 chars. `openssl rand -base64 32` |
| `NEXTAUTH_URL` | prod | App's external URL |
| `AUTH_TRUST_HOST` | Vercel | `"true"` so NextAuth trusts forwarded host headers |
| `NODE_ENV` | — | `development` / `test` / `production` |
| `ALLOW_PROD_SEED` | no | `"true"` to override the seed's prod refusal |
| `NEXT_PUBLIC_DEMO` | no | `"true"` to show demo credentials on the login page |

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run the built app |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run db:generate` | `prisma generate` |
| `npm run db:push` | `prisma db push` (dev only) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Seed currencies, roles, demo admin/org |
| `npm run db:studio` | Prisma Studio |

## Architecture notes

- **Folder-level backend/frontend separation, single Next.js deployment.** API routes live in `src/app/api/` (Next.js requirement); business logic lives in `src/backend/services/`, `src/backend/utils/`, etc. Route handlers are thin shells that delegate.
- **Multi-tenancy** is enforced by `src/backend/utils/with-org-auth.ts`. Every route under `src/app/api/organizations/[orgId]/...` wraps with `withOrgAuth` — that helper authenticates the session and verifies the caller is an active member of the URL's `orgId`. Cross-tenant data leak is structurally impossible inside a wrapped handler.
- **Money math is `Prisma.Decimal` end to end.** Use the helpers in `src/backend/utils/money.ts` (`D`, `sum`, `mul`, `cmp`, `closeEnough`); never JS floats. Reports, invoices, bills, vouchers, payments, receipts, stock all comply.
- **Bills, invoices, payments, and receipts all post to the GL atomically.** Bills now post on approval (or directly when status=APPROVED at create) — `src/backend/services/billing/post-bill.ts` builds the JV (Dr Expense + GST Input / Cr Vendor + GST Output RCM + TDS Payable as applicable; composition recipients collapse GST into expense). Payments + receipts post via `src/backend/utils/posting.ts`. Every posting site wraps in `prisma.$transaction`.
- **Approval workflows route entities through an inbox.** `src/backend/services/approvals/route-entity.ts` creates `Approval` rows for every step of a matching `ApprovalWorkflow` when a Voucher / Bill / ExpenseClaim / Leave is submitted in PENDING state. USER / ROLE / MANAGER step types supported. The `/approvals` page lets approvers act; `maybePromoteEntity` auto-posts the entity to GL once all steps approve. Sibling Approvals at the same step auto-CANCEL when one role-holder decides.
- **Permissions** are checked via `hasPermission(orgUser, module, action)` against the role's `permissions` JSON. Wildcards (`module: "*"` / `actions: ["*"]`) supported. Cross-tenant boundary on every endpoint via `withOrgAuth`; sensitive actions (workflow create/delete, GSTR-2B reconcile, recurring spawn, settings PATCH) are additionally gated.
- **Email notifications** via `src/backend/services/email/send.ts` — Resend-backed when `RESEND_API_KEY` + `EMAIL_FROM` are set, no-op (logged) otherwise. Approval-request emails fire post-tx in vouchers/bills POST.
- **Logger.** `src/backend/utils/logger.ts` — pino with redaction (password, token, authorization, cookie, AUTH_SECRET, DATABASE_URL). Use `logger.error({ err: error }, "msg")` instead of `console.error`.

## Deploying to Vercel

Vercel doesn't auto-load `.env` from the repo (it's gitignored). Set env vars in the project before the first deploy or it will fail with `prisma.config.ts` complaining about missing `DATABASE_URL`.

1. **Settings → Environment Variables**, add each below, **check Production + Preview + Development** for every row:
   - `DATABASE_URL` — Neon pooler URL (from your `.env`)
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `NEXTAUTH_SECRET` — same value as `AUTH_SECRET`
   - `AUTH_TRUST_HOST` — `true`
   - `NEXTAUTH_URL` — production URL (set after first successful deploy)
2. **Deployments → ⋯ → Redeploy** (Vercel does NOT auto-redeploy when env vars change). Uncheck "Use existing Build Cache" the first time.
3. The build runs `prisma migrate deploy && prisma generate && next build`. Migrations in `prisma/migrations/` apply on every deploy; the table `_prisma_migrations` on Neon tracks what's already applied so it's a no-op if you're up to date.
4. Don't paste values inside quotes — Vercel stores them literally. Just paste the raw string.

If a build fails with `DATABASE_URL is not set`, the env var didn't reach the build environment. Re-check the scope checkboxes; values set only for "Production" don't apply to Preview deployments triggered by PRs.

## Docs

- **`update.md`** — durable plan + progress log. Read this first when picking up the project. Phase roadmap, decisions log, completed work, what's next.
- **`DEVELOPER_GUIDE.md`** — deeper architecture/onboarding doc (under refresh).
- **`prisma/schema.prisma`** — authoritative data model.

## License

Proprietary.

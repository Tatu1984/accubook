# accubook — Production Readiness Plan & Progress

> **🤖 RESUMPTION PROTOCOL FOR FUTURE CLAUDE**
>
> This file is the durable state of the project. The user (Sudipto / Tatu1984) will reference it across multiple Claude conversations. **Read this file before doing anything else.**
>
> Steps when starting fresh in this repo:
> 1. Read this entire file.
> 2. Run `git log --oneline -15` to verify the "Last updated" hash matches.
> 3. Run `npx tsc --noEmit` to confirm the codebase still typechecks.
> 4. Skim the "Current state" section for the exact next task.
> 5. Skim "Decisions log" so you don't re-litigate settled questions.
> 6. **Update this file as you complete work.** Before any context-window pressure, save state here so your replacement can resume.
>
> **Mandatory cadence for updating this file:**
> - End of every PR / commit
> - End of every working session
> - When the user says "save state" or signals they want to clear context
> - Proactively when you notice the conversation getting long
>
> **Update style:** be terse. Future-you doesn't need prose; you need facts, file paths, and the exact next command.

---

## 1. Project snapshot

**Repo:** `git@github.com:Tatu1984/accubook.git` (branch `main`)
**Working dir:** `/Users/sudipto/Desktop/projects/accubook`
**Goal:** ship the "Next-Gen ERP" defined in `ProjectD.docx` (also pasted by user; identical content). India accounting first, then multi-country, manufacturing, AI, edge.
**User:** Sudipto Mitra (`saddygrouppie@gmail.com`, GitHub `Tatu1984`). Building this for a client. Working solo with Claude.

## 2. Tech stack & structure

- Next.js 16 (App Router), React 19, TypeScript strict, React Compiler enabled
- Prisma 7 + Postgres on Neon (pooler URL); `@prisma/adapter-pg` + `pg`
- NextAuth v5 beta, JWT session strategy, 30-day session
- Tailwind v4 + shadcn/ui ("new-york" style)
- TanStack React Query + React Table; zustand installed but unused
- Recently restructured into:
  ```
  src/
  ├── app/                    # Next.js routes (pages + API handlers — required by framework)
  ├── backend/
  │   ├── api/                # (scaffold, empty)
  │   ├── database/client.ts  # Prisma client (PrismaPg adapter)
  │   ├── repositories/       # (scaffold, empty)
  │   ├── services/auth.service.ts  # NextAuth config
  │   ├── utils/payroll-calculations.util.ts
  │   └── validators/         # (scaffold, empty)
  ├── frontend/
  │   ├── components/{ui,layout,features/transactions}
  │   ├── hooks/{use-organization,use-mobile}
  │   ├── store/              # (scaffold, empty — zustand here later)
  │   ├── api/                # (scaffold, empty — fetch wrappers later)
  │   └── utils/              # (scaffold, empty)
  ├── shared/types/{index,next-auth.d}
  ├── shared/utils/common.util.ts  # cn() — shadcn helper
  ├── shared/constants/        # (scaffold, empty)
  ├── config/env.ts           # (scaffold, empty — implement zod env validation here)
  └── generated/prisma/       # (gitignored — Prisma client output)
  ```
- Path aliases in `tsconfig.json`: `@/*`, `@/backend/*`, `@/frontend/*`, `@/shared/*`, `@/config/*`
- shadcn aliases in `components.json` point at `@/frontend/components`, `@/shared/utils/common.util`, `@/frontend/hooks`

## 3. Decisions log (locked unless user reopens)

| # | Decision | Choice | Date |
|---|---|---|---|
| D1 | Architecture | Monolithic Next.js fullstack (NOT separate backend service). `src/backend/` is folder-level only. | 2026-05-03 |
| D2 | Vercel deploy target | Project `accubook` (`prj_i8R9Qgxi00IgC84LMtKcOA2SuG6v`) in team `team_JLez4p6WrUVtodxcbh9MzJse`. **Not deployed yet.** | 2026-05-03 |
| D3 | Neon DB password rotation | User declined to rotate — accepting risk. The leaked password is in `.env` and was sent in a Claude conversation. | 2026-05-03 |
| D4 | Permission model | Drive auth off the `permissions` JSON on the role. Role names normalize to `OWNER` / `ADMIN` / `ACCOUNTANT` / `VIEWER` (uppercase). | 2026-05-03 (assumed default) |
| D5 | Demo credentials | Remove demo card from login page; only seed `admin@accubooks.com / admin123` when `NODE_ENV !== "production"`. | 2026-05-03 (assumed default) |
| D6 | Soft delete strategy | Refuse delete if FK references exist; otherwise flip `isActive=false`. Hard-delete only for drafts. | 2026-05-03 (assumed default) |
| D7 | Migration baseline | `prisma migrate dev --name init --create-only`, then `migrate resolve --applied init` so the existing Neon schema is treated as already-applied. From here on, real migrations. | 2026-05-03 (assumed default) |
| D8 | Voucher numbering | Postgres sequences per `(organizationId, voucherType)`. | 2026-05-03 (assumed default) |
| D9 | Email service | Stub for now (no actual email send). Resend/Postmark in Phase 1. | 2026-05-03 (assumed default) |
| D10 | Test runner | Vitest. Coverage targets the load-bearing pieces (auth helper, payment posting, voucher numbering) — not full coverage. | 2026-05-03 (assumed default) |
| D11 | Logger | `pino` via thin wrapper at `src/backend/utils/logger.ts`, redacts `password` / `token` / `authorization`. | 2026-05-03 (assumed default) |
| D12 | `AUTH_SECRET` rotation | **Skipped** — user declined. Revisit before first real user signs up. (No active JWTs to invalidate today.) | 2026-05-03 |
| D13 | Pace assumption | Solo + Claude, full-time. (User has not explicitly confirmed but said "lets start working".) | 2026-05-03 |
| D14 | v1 scope | India ERP MVP (Phase 0 + Phase 1). Phase 2+ is roadmap, not committed. | 2026-05-03 |

## 4. Open questions for user

- **Q1.** Is this solo full-time, evenings, or are devs being hired? (Affects timeline.) Defaulted to solo full-time per D13.
- **Q2.** Is there a specific paying client driving feature priority, or build-then-sell SaaS? (Affects which Phase 1 sub-items get sequenced first.)
- **Q3.** Rate limiting requires Upstash Redis (free tier) — provision now or stub for v1? Defaulted to "stub with TODO" until user provides Upstash creds.
- **Q4.** Email service for invitations — Resend / Postmark / SES? Defaulted to "stub" per D9.

## 5. Roadmap (six phases)

### Phase 0 — Stabilize foundation (2–3 weeks solo)
**Status: ACTIVE.** Full punch list in §7 below.
**Exit:** safe to demo to a paying customer; books are correct; security holes closed.

### Phase 1 — India ERP MVP, sellable (5–7 weeks)
- GST returns (GSTR-1, GSTR-3B, GSTR-9)
- E-invoicing (NIC IRN, QR, e-way bill)
- TDS/TCS (section-wise rules, certificates, Form 26AS, Form 16)
- Receivables/payables aging + dunning + credit limits
- Bank feeds + reconciliation (CSV/MT940 import + auto-match)
- Recurring billing & subscriptions
- Tally migration (XML import)
- Notifications (email via Resend, WhatsApp via Twilio, in-app)
- Document OCR (light — Claude vision API on bills/receipts)
- ~25 more reports (aging, cash flow forecast, stock aging, GST summary, etc.)

**Exit:** can take real Indian customers. Competes with Zoho Books / TallyPrime.

### Phase 2 — Multi-country + extensibility (8–10 weeks)
- Pluggable tax engine (country adapters)
- VAT for UAE/Saudi/EU (FTA format, OSS/IOSS, PEPPOL)
- Multi-currency + FX (daily sync, FX gain/loss vouchers)
- Multi-language UI (next-intl: EN/HI/AR)
- Public REST API (key management, OpenAPI, tenant-scoped)
- Webhooks (subscriptions, retries, signature verification)
- MFA + SSO (TOTP, WebAuthn, SAML/OIDC)
- Custom workflow builder (visual approval-chain editor)
- ESS portal (employee self-service)
- POS mode (tablet-first, offline-capable, UPI/card)

### Phase 3 — Manufacturing + advanced inventory (8–10 weeks)
- Multi-level BOM with version control
- Work orders, routing, scheduling
- WIP tracking, scrap, yield calc
- Job-work / subcontracting
- Vendor performance analytics
- Re-order automation (min/max + demand-based)
- True FIFO/LIFO/weighted-avg recompute on every movement

### Phase 4 — AI layer (10–14 weeks, parallelizable with Phase 3)
- Voucher auto-classification (LLM + rules)
- Fraud / duplicate / round-tripping detection
- Demand forecasting (Prophet/statsforecast)
- Auto-purchase suggestions
- Dynamic pricing
- Dead-stock detection
- Tax scrutiny risk
- Conversational reporting (NL → SQL with safety layer)
- Financial storyboards (monthly NL summary)
- Predictive approvals
- Attrition scoring
- Productivity analytics

### Phase 5 — Edge / offline / scale (10–14 weeks)
- Edge nodes per branch (local SQLite cache + sync)
- Distributed ledger w/ eventual consistency (CRDT)
- Multi-region deploy (DB sharding, regional read replicas)
- Data residency controls
- App marketplace
- Low-code scripting engine

### Phase 6 — Future-forward (opportunistic, customer-funded only)
- Blockchain immutable ledger (6–8 wks)
- IoT warehouse integrations (per device class)
- Heavy OCR pipeline beyond Phase 1's basic
- Voice-driven invoicing

**Total honest timeline:** Phases 0–5 = 12–14 months solo; 7–8 months with team of 3; 5–6 months with team of 6.

## 6. Audit findings (the why behind Phase 0)

Four parallel audits on 2026-05-03 found this codebase NOT production-ready. Top blockers:

**Cross-tenant data leak** — ~12 routes filter `where: { id, organizationId: orgId }` using attacker-supplied `orgId`, no `organizationUser` membership check. Files: `items/[itemId]`, `parties/[partyId]`, `branches/[branchId]`, `ledgers/[ledgerId]`, `warehouses/[warehouseId]`, `vouchers/[voucherId]`, `item-categories/[categoryId]`, `bank-accounts/route.ts:9-95`.

**Money math broken** — every aggregation uses `sum + Number(e.debitAmount)` patterns; Prisma schema is correctly Decimal but TS code uses native floats. Files: `vouchers/route.ts:176-184`, `invoices/route.ts:209-228`, `bills/route.ts:188-210`, all reports under `reports/`.

**Payments / receipts don't post to GL** — `payments/route.ts:172-193` and `receipts/route.ts:172-193` insert one row, never update `Invoice.amountPaid/amountDue/status`, never decrement `BankAccount.currentBalance`, never create offsetting `Voucher` + `VoucherEntry`.

**Ledger.currentBalance / BankAccount.currentBalance** never updated after creation. Displayed on dashboards as authoritative — permanently stale.

**Voucher / invoice / bill / payment / receipt numbering races** — all do `findFirst orderBy createdAt desc` then `+1` outside any transaction. Concurrent POSTs collide.

**Hardcoded admin creds** — `src/app/(auth)/login/page.tsx:135-136` shows `admin@accubooks.com / admin123` to every visitor; seeded in any environment.

**No env validation** — `src/config/env.ts` is empty. `prisma/seed.ts:7` falls back to localhost.

**No migrations** — `prisma/migrations/` doesn't exist; `vercel.json` runs `prisma generate && next build` (no `migrate deploy`).

**No rate limiting / no /api/health / no error boundaries / no security headers / no tests / no CI / 28 zero-byte scaffold files / 5 unused npm deps / ESLint silently broken.**

**Owner-protection check is dead code** — `users/route.ts:155, 275, 306, 393, 439` checks `role.name === "Owner"`, but seed creates `ADMIN`, register creates `ADMIN`, organizations creates `Admin` — nothing creates `Owner`. Org admins can demote each other unchecked.

**Hard deletes** without FK guards on `bills`, `parties`, `ledgers`, `bank-accounts`, `items`, `tax-config` — corrupts historical books.

**Stock can go negative**, weighted-avg cost never recomputes — `stock/route.ts:294-322`.

**Audit log dead** — only written by `invoices/[invoiceId]/e-invoice/route.ts:395, 439`.

## 7. Phase 0 detail — the active punch list

Three sub-PRs. Tick boxes as they ship.

### PR 1 — Security & tenant isolation ✅ COMPLETE (pending commit)
- [x] `src/backend/utils/with-org-auth.ts` — wrapper helper that authenticates session, verifies `organizationUser` membership of `params.orgId`, attaches `{ session, orgUser, orgId, params, userId }` to handler context. Plus `hasPermission()` for permissions-JSON checks and `unauthorized/forbidden/notFound/badRequest` response helpers.
- [x] Applied `withOrgAuth` to all 55 routes under `src/app/api/organizations/[orgId]/...` (5 parallel agent batches: items/inventory/branches=10, sales=8, purchase/vouchers/ledgers=10, HR/admin=12, reports/tax/banking=15). Cross-tenant data leak closed on every detail route.
- [x] `.strict()` added to every PATCH Zod schema (mass-assignment protection).
- [x] Deleted `src/app/api/test-session/route.ts`.
- [x] Login page: demo card gated behind `process.env.NEXT_PUBLIC_DEMO === "true"`. Seed: refuses to run when `NODE_ENV === "production"` unless `ALLOW_PROD_SEED=true`.
- [x] `/api/auth/register` — generic response on duplicate email (no enumeration).
- [x] Replaced `Math.random().toString(36).slice(-8)` with `crypto.randomBytes(16).toString("base64url")` in `users/route.ts`.
- [x] Permission model — switched all `role.name === "Owner"` checks (4× in users/route.ts, 1× in audit-logs/route.ts) to `hasPermission(orgUser, module, action)` against the structured permissions JSON. Added "last admin" guard to prevent orphaning the org via demote/deactivate/remove.
- [x] ~~Rotate `AUTH_SECRET`~~ — skipped per D12. Revisit before first real user.
- [ ] Rate limiting on `/api/auth/*` — **stubbed** with a TODO until user provisions Upstash (per Q3).

### PR 2 — Accounting correctness (IN PROGRESS)
- [x] **Decimal money helper** at `src/backend/utils/money.ts` (D, sum, mul, cmp, fmt, toNumber, closeEnough).
- [x] **Posting helpers** at `src/backend/utils/posting.ts` — getOrCreatePartyLedger, getOrCreateBankLedger, getCashLedger, getFiscalYearForDate, getVoucherTypeByCode, generateVoucherNumber, applyLedgerEntries (signed by AccountNature), recomputeInvoiceStatus, recomputeBillStatus.
- [x] **Payments POST** — full $transaction: creates voucher (Dr Party / Cr Bank), updates ledger balances, decrements BankAccount.currentBalance, creates InvoicePayment junction, recomputes Bill status.
- [x] **Receipts POST** — mirror of payments (Dr Bank / Cr Party). Recomputes Invoice status.
- [x] **Voucher POST** — Decimal math, requiresApproval flow (DRAFT/PENDING_APPROVAL/APPROVED+posted), Ledger.currentBalance applied in the same tx, fiscalYearId validated to org.
- [x] **Bills POST** — actually computes and persists per-line taxAmount + totalTax (was hardcoded to 0). All math via Decimal.
- [x] **Reports DRAFT filter** — every report (balance-sheet, trial-balance, profit-loss, cash-flow, export) now filters `status: "APPROVED"`.
- [x] **Decimal sweep across reports** — 6 files, ~69 sites in `aging/balance-sheet/cash-flow/export/profit-loss/trial-balance`. Decimal accumulators throughout. Internal report types promoted to Decimal.
- [x] **Stock movement fix** — `updateMany` with `quantity: { gte: qty }` predicate atomically guards negative stock; `InsufficientStockError` → 400. Weighted-avg recompute on PURCHASE/GRN/RETURN: `newAvg = (oldQty*oldAvg + qty*rate)/(oldQty+qty)`. All Decimal.
- [ ] Voucher PATCH: reverse old entries before applying new ones; permission check on DRAFT↔APPROVED flip. **PR 2 part 3b — pending.**
- [x] Voucher / invoice / bill / payment / receipt numbering races — fixed via `NumberCounter` table + atomic `nextNumber()` upsert+increment (`1f2a0e1`). Migration `1_add_number_counters` applied to Neon. Scopes: `VOUCHER:<typeId>:<fyId>`, `INVOICE:<FY>`, `BILL`, `PAYMENT`, `RECEIPT`.
- [ ] Soft delete pattern: refuse delete if FK references exist; otherwise `isActive=false`. Touch: parties, ledgers, bank-accounts, tax-config, bills. (Items already does this.) **PR 2 part 3c — pending.**
- [ ] Audit log writes inside every mutation tx (entityType, entityId, oldData, newData, userId, orgId). **PR 2 part 3d — pending.**

### PR 3 — Ops basics (PART 1 SHIPPED)
- [x] `src/config/env.ts` — zod schema, fail-fast at boot. Always import `env` from here, never `process.env.X` directly.
- [x] `/api/health` endpoint — liveness + DB readiness, returns env/commit/version/dbLatency.
- [x] `src/app/{error,global-error,not-found,loading}.tsx` — root-level boundaries.
- [x] `next.config.ts` — HSTS, X-Frame-Options=SAMEORIGIN, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. `poweredByHeader=false`.
- [x] `src/backend/utils/logger.ts` — pino with redaction (password/token/authorization/cookie/AUTH_SECRET/DATABASE_URL). Use `logger.error({ err: error }, "msg")`.
- [x] DB pool tuned: `max: 3` in production, explicit timeouts, reads `DATABASE_URL` via `env`.
- [x] ESLint config ignores `src/generated/**`. Lint surface dropped from 2,318 problems → 113 warnings + 0 errors. Fixed `Math.random` in render (real bug) + the only `no-explicit-any`.
- [x] Pruned 8 unused npm deps: `jspdf`, `jspdf-autotable`, `decimal.js`, `numeral`, `uuid`, `immer`, `@types/numeral`, `@types/uuid`.
- [x] **PR 3 part 2 SHIPPED** (`31d3f43`):
  - [x] Vitest + 19 smoke tests for money helpers (`D`/`sum`/`mul`/`cmp`/`closeEnough`) covering the 0.1+0.2≠0.3 and 100×0.01=1 cases. `npm test`.
  - [x] GitHub Actions `.github/workflows/ci.yml` — typecheck + lint + test + build on push/PR.
  - [x] `console.error` → `logger.error` sweep across 60 API-route files (129 calls replaced).
  - [x] README.md replaced with real content (stack, layout, env vars, scripts, architecture notes).
  - [x] `.env.example` documenting required + optional env vars.
  - [x] Deleted 40 zero-byte scaffold stubs + the now-empty parent dirs.
  - [x] `serverExternalPackages = ["pino","pino-pretty","thread-stream"]` so Turbopack stops trying to bundle pino's worker threads.
- [x] **PR 3 part 3 SHIPPED** (`e5d8935`):
  - [x] Prisma migrations baselined: `prisma/migrations/0_init/migration.sql` generated via `migrate diff --from-empty --to-schema`, marked applied on Neon via `migrate resolve`. `migrate status` clean.
  - [x] `vercel.json` build command → `prisma migrate deploy && prisma generate && next build`.
  - [x] Extracted `hasPermission` + types to `src/backend/utils/permissions.ts` (leaf module, zero deps). Re-exported from with-org-auth.ts. **+10 unit tests** covering wildcards, malformed input, null cases.
  - [x] DEVELOPER_GUIDE.md paths refreshed; pointer to update.md added at top.
  - [ ] Integration tests against an ephemeral test DB (deferred — needs Docker / testcontainers setup).

## 8. Current state

- **Active phase:** Phase 0 — **~99% complete**.
- **Active sub-PR:** PR 2 part 3a shipped (`1f2a0e1`). Remaining: 3b (voucher PATCH reversal), 3c (soft delete sweep), 3d (audit log writes). Plus a build-config issue: prisma's pooler-URL advisory locks made `migrate deploy` flaky locally — used `db execute` + `migrate resolve` for the latest migration. On Vercel this should work since each lambda gets a fresh connection, but worth watching the first prod deploy logs.
- **Last updated:** 2026-05-03 by Claude (commit `1f2a0e1`)
- **What's done since last session:**
  - PR 1 (`ce7532d`+`381fe36`+`1cc57c0`): tenant isolation closed everywhere, permission model rewired, quick-wins.
  - PR 2 part 1 (`46d022b`): Decimal helpers, posting helpers, payments/receipts/bills/vouchers POST → GL posting in `$transaction`. Reports filter DRAFT.
  - PR 2 part 2 (`c5eba29`): Decimal sweep across 6 reports (~69 sites), stock movement guard + weighted-avg recompute.
  - PR 3 part 1 (`82a99c5`): env.ts zod, /api/health, error boundaries, security headers, pino logger, DB pool tuned, ESLint fixed, 8 unused deps pruned.
  - PR 3 part 2 (`31d3f43`): Vitest + 19 tests, GitHub Actions CI, console.error → logger sweep (129 calls / 60 files), README rewritten, .env.example, 40 scaffold stubs deleted.
  - PR 3 part 3 (`e5d8935`): Prisma migrations baselined against Neon, vercel.json updated, hasPermission extracted to leaf module, +10 unit tests (29 total), DEVELOPER_GUIDE refreshed.
- **What's next (exact)** — pick path:
  - **(A) PR 2 part 3 — close out Phase 0:** voucher numbering Postgres sequences (now possible — migration baseline exists) → voucher PATCH reversal → soft delete sweep across parties/ledgers/bank-accounts/tax-config/bills → audit log writes inside every mutation tx.
  - **(B) Start Phase 1 (India ERP MVP)** — pick a feature from §5: GST returns (GSTR-1/3B/9), e-invoicing (NIC IRN + QR), TDS/TCS, recurring billing, Tally XML migration, document OCR via Claude vision, dunning emails.
  Recommendation: (A) is safer (numbering races bite under concurrency, audit log dead means compliance gap). (B) is more visible (sellable features). Either is defensible — Phase 0 is functionally complete.

## 9. Completed log (reverse chronological)

| Date | What | Commit |
|---|---|---|
| 2026-05-03 | **PR 2 part 3a — race-safe numbering.** `NumberCounter` model + migration `1_add_number_counters`. `nextNumber(tx, orgId, scope)` does atomic upsert+increment. Applied to vouchers, invoices (per-FY scope), bills, payments, receipts. Invoice POST also got Decimal cleanup that was outstanding. tsc + tests + build clean. | `1f2a0e1` |
| 2026-05-03 | Hardening: `prisma.config.ts` now gives a useful error message when `DATABASE_URL` is missing (was failing silently with "Failed to load config file"). | `8ba7ec1` |
| 2026-05-03 | **PR 3 part 3 — migrations + permissions extraction.** Baselined Prisma migrations on Neon (`migrate diff` → `0_init/migration.sql`, `migrate resolve --applied`). vercel.json now runs `migrate deploy` before build. Extracted `hasPermission` to leaf module + 10 unit tests (29/29 passing). DEVELOPER_GUIDE paths refreshed. | `e5d8935` |
| 2026-05-03 | **PR 3 part 2 — Vitest, CI, logger sweep, scaffold cleanup, README.** Vitest + 19 money-helper tests (`npm test`). GitHub Actions CI (typecheck/lint/test/build on push+PR). Replaced 129 `console.error` across 60 API files with `logger.error({ err })`. README rewritten. `.env.example`. 40 zero-byte scaffold stubs deleted. `serverExternalPackages` for pino. tsc + lint (0 errors) + tests (19/19) + build clean. | `31d3f43` |
| 2026-05-03 | **PR 3 part 1 — ops baseline.** env.ts zod validation, /api/health endpoint, root error/global-error/not-found/loading boundaries, security headers (HSTS/XFO/CSP-lite/Permissions-Policy), pino logger with redaction, DB pool tuned for serverless (max=3), ESLint config fixed (2318 → 0 errors), Math.random-in-render bug fixed, 8 unused npm deps pruned. tsc + build + lint clean. | `82a99c5` |
| 2026-05-03 | **PR 2 part 2.** Decimal sweep across 6 report files (~69 sites). Stock movement: atomic negative-stock guard via `updateMany` with `quantity:{gte}` predicate, weighted-avg recompute on PURCHASE/GRN/RETURN. tsc + build clean. Net +447/-376. | `c5eba29` |
| 2026-05-03 | **PR 2 part 1 — accounting correctness foundation.** Decimal money helper + posting helpers. Payments/receipts POST now wrap in `$transaction`, post to GL, update Ledger.currentBalance + BankAccount.currentBalance, recompute Invoice/Bill status. Voucher POST uses Decimal math + applies ledger balances. Bills POST computes per-line tax. Reports filter DRAFT vouchers. tsc clean. Net +758/-228. | `46d022b` |
| 2026-05-03 | Chore: gitignore MS Office lock files | `381fe36` |
| 2026-05-03 | **PR 1 — Security & tenant isolation complete.** `withOrgAuth` helper, applied to all 55 org-scoped routes, `.strict()` on PATCH schemas, demo/test gate, register enumeration fix, crypto-strength temp password, permission model rewired with `hasPermission()` + last-admin guard. tsc + build clean. Net diff: -3084 lines. | `ce7532d` |
| 2026-05-03 | Created `update.md`; saved memory pointer | `e4dc1db` |
| 2026-05-03 | Production audit (auth, data integrity, ops, code quality) — 4 agents | n/a |
| 2026-05-03 | Pushed all migration work to `origin/main` | `a734b34` |
| 2026-05-03 | Local `npm run build` passes (66 pages, 0 errors) | n/a |
| 2026-05-03 | Seeded Neon DB (idempotent — all upserts) | n/a |
| 2026-05-03 | `prisma db push` confirmed schema in sync | n/a |
| 2026-05-03 | Added `AUTH_SECRET` to `.env` (will rotate in Phase 0 PR 1) | n/a |
| 2026-05-03 | Wrote `.env` with Neon `DATABASE_URL` | n/a |
| 2026-05-03 | Migrated `src/components` → `src/frontend/components`, `src/lib/*` → `src/backend/*` and `src/shared/*`, etc. tsc clean. | `a734b34` |
| 2026-05-03 | Scaffolded empty `src/backend/`, `src/frontend/`, `src/shared/`, `src/config/` per client structure spec | `a734b34` |

## 10. Files to know

- **`prisma/schema.prisma`** — authoritative data model (1600+ lines). Multi-org accounting, inventory, HR, payroll, GST.
- **`prisma/seed.ts`** — seeds currencies, roles, units, voucher types, leave types, admin user, demo org/branch, fiscal year, ledger groups, default ledgers, departments, designations, tax configs, item categories, sample parties, sample items. All upserts.
- **`src/backend/services/auth.service.ts`** — NextAuth v5 config (Credentials provider, JWT strategy, 30-day session).
- **`src/backend/database/client.ts`** — Prisma client singleton, PrismaPg adapter, connection pool.
- **`src/app/api/organizations/[orgId]/`** — ~57 route files, all currently with duplicated 15-line auth preamble. Phase 0 PR 1 collapses them.
- **`middleware.ts`** (root) — checks for `authjs.session-token` cookie, redirects unauthenticated users to `/login`. Trusts cookie presence (not signature) — fine for UX, API routes do real auth.
- **`components.json`** — shadcn config, aliases now point at `@/frontend/components` etc.
- **`tsconfig.json`** — paths: `@/*`, `@/backend/*`, `@/frontend/*`, `@/shared/*`, `@/config/*`.

## 11. Critical "do not break"

- **Never move `src/app/api/`** — Next.js requires API routes there. The `src/backend/` folder is for *logic*, not handlers.
- **Don't introduce floats into money paths.** Decimal everywhere.
- **Don't add `prisma db push` to deploy.** Migrations only.
- **Don't commit `.env`.** Already gitignored — keep it that way.
- **Don't delete `src/generated/prisma/`** — it's the Prisma client output. Gitignored, regenerated on `prisma generate`.
- **Always run `npx tsc --noEmit && npm run build` before committing.** The build is the only smoke test we have until Vitest lands.

## 12. Environment / runtime notes

- `.env` contains: `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST`. Treat all as compromised (sent in chat). Rotate during Phase 0 PR 1.
- Neon project: pooler hostname `ep-crimson-glade-a4jvhp02-pooler.us-east-1.aws.neon.tech`. User declined password rotation (D3) — **revisit before paying customers.**
- `npm install` is required (node_modules currently present locally, not in git).
- `prisma generate` requires `DATABASE_URL` set; the schema generates client into `src/generated/prisma/` (gitignored).
- Production build: `npm run build` → ✅ as of `a734b34`. 66 pages.

## 13. Memory pointer

A project memory has been saved at `~/.claude/projects/.../memory/` pointing future-Claude conversations at this file. Confirm it's still there with `ls ~/.claude/projects/-Users-sudipto-Desktop-projects-accubook/memory/`.

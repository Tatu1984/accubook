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
- [x] **Voucher PATCH with reversal** (`4ad25ca`). DRAFT/PENDING_APPROVAL→APPROVED applies ledger entries (set isPosted, postedAt, approvedById). APPROVED→DRAFT/REJECTED/CANCELLED reverses ledger entries (debit/credit swapped). Permission-gated on `vouchers:approve`. Refuses narration/date edits on posted vouchers. DELETE refuses if posted.
- [x] **Voucher / invoice / bill / payment / receipt numbering** — fixed via `NumberCounter` table + atomic `nextNumber()` upsert+increment (`1f2a0e1`).
- [x] **Soft delete sweep** (`4ad25ca`). bills/[billId]: refuse if any Payment exists OR status is APPROVED/PAID/PARTIAL/OVERDUE. tax-config: counts FK refs across 9 relations; soft-deletes if any in use. parties/ledgers/bank-accounts/items already had the pattern.
- [x] **Audit log writes** (`4ad25ca`). `src/backend/utils/audit.ts` helper, called inside the same tx. Hooked into payments POST, receipts POST, vouchers POST, vouchers PATCH (with action = POST/REVERSE/UPDATE depending on transition).

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

- **Active phase:** India end-to-end build (workstreams in §5). Foundation (Phase 0) done.
- **Active workstreams:**
  - WS1 (invoicing core) ~80% done.
  - **WS2 (GST returns) — GSTR-1 + GSTR-3B + GSTR-9 compute + portal JSON. GSTR-2B reconciliation backend live.** UI wired for compute + portal download. GSTR-2B persistence + UI pending.
  - **WS3 (e-invoicing) — payload generator + preview endpoint complete.** NIC API submission still needs sandbox creds.
  - **WS4 (e-way bill) — payload generator + endpoint complete.** NIC EWB API submission still needs sandbox creds.
  - **WS5 (TDS/TCS) — full compliance pipeline.** Compute helper, payment posting (Dr Vendor / Cr Bank net / Cr TDS Payable), receipt posting (Dr Bank gross / Cr Party / Cr TCS Payable). `TdsDeduction` and `TcsCollection` rows persisted inside the same tx (migration 5 applied). `GET /tds-deductions` and `/tcs-collections` with `?view=list` (raw rows + pagination) and `?view=form16a` / `?view=form27d` (party-and-section aggregator over an FY quarter, ready for cert PDF rendering). Bill-time accrual TDS + UI section pickers + actual challan e-filing still pending.
  - **WS6 (banking) — bank statement CSV import + auto-reconciliation matcher live.** Manual-match UI for low-confidence cases pending.
  - **WS7 (payroll) — full month cycle live.** PF/ESI/PT/TDS/LOP compute helpers tested. `POST /payroll/post-month` (DRAFT/APPROVED → PROCESSED + Dr Salaries & Wages JV) and `POST /payroll/pay-month` (PROCESSED → PAID + Dr Salaries Payable / Cr Bank, decrements BankAccount). Refuses partial-paid periods. Salary structure UI / per-employee declarations UI / payslip generation UI still pending.
  - **WS10 (manufacturing) — issue + complete state transitions live.** BOM + WO schema + APIs + multi-level BOM cost compute. `POST /work-orders/[id]/issue` (BOM-scaled stock decrement → ISSUE movements + Dr WIP / Cr Stock-in-Hand JV → DRAFT→IN_PROGRESS) and `POST /work-orders/[id]/complete` (GRN with weighted-avg recompute + Dr Stock-in-Hand / Cr WIP at WIP value → IN_PROGRESS→COMPLETED). Scrap absorbed into FG cost; planned-vs-actual quantity guard. Reversal / multi-issue scenarios still pending.
  - **WS17 (reports) — 9 reports total + dashboard UI for new ones.** Built-ins: balance-sheet, P&L, trial-balance, cash-flow, aging, custom + sales-register, purchase-register, party-statement (the latter three now live at `/reports/registers`).
  - **WS18 (Tally migration) — masters + vouchers + UI live.** Same `POST /migration/tally` endpoint now also imports VOUCHER messages: maps Tally VOUCHERTYPENAME → our voucher type code (Sales/Purchase/Payment/Receipt/Journal/Contra/Credit Note/Debit Note), parses YYYYMMDD dates, resolves fiscal years per voucher, looks up ledgers by name, builds Voucher + VoucherEntry rows from signed AMOUNT (positive=Dr, negative=Cr), refuses unbalanced Dr≠Cr vouchers, idempotent on (orgId, voucherType, voucherNumber, FY). Stock journals / inventory-affecting voucher types still skipped. Bill allocations + UoM masters still pending.
  - **GST returns UI** — `/taxation/gst` now wired to compute + portal-JSON download for GSTR-1/3B/9.
  - **Banking import UI** at `/banking/import` — upload statement → reconcile → match results.
  - **Marketing landing page** at `/` — reactbits-style hero/features/CTA, sign-in button → /login on same domain.
- **Last updated:** 2026-05-11 by Claude (commit `ced6a25`)
- **Production readiness audit (2026-05-11):** Deep audit run; 6 BLOCKERs identified, all 6 shipped this session. ~85% → ~93% production-ready. Remaining: HIGH-tier items (CSP, CSRF, integration tests, JWT revocation, status page) + npm audit transitive (waiting on next Next.js patch). Detailed verdict + tiered list in audit log section below.
- **Production-readiness fixes this session (2026-05-11):**
  - **Sentry stub** (`ced6a25`). `@sentry/nextjs` installed; `src/instrumentation.ts` + `src/instrumentation-client.ts` initialize Sentry only when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set (no-op otherwise, SDK not loaded). `error.tsx` + `global-error.tsx` swapped `console.error` → `Sentry.captureException` via dynamic import (also fixes H4 → stops leaking the rendered Error to Vercel stdout). To activate: paste DSN into Vercel env.
  - **next-auth pinned** (`5c6feeb`). `package.json` was `^5.0.0-beta.30` — caret on a pre-release matches any newer beta. beta.31 is already out and untested. Pinned exact `5.0.0-beta.30`. DEVELOPER_GUIDE stack table reflects "do not float". When v5 GA ships, deliberately upgrade.
  - **Rate-limit stub on /api/auth/*** (`bea3520`). New `src/backend/utils/rate-limit.ts` — Upstash REST pipeline (INCR+EXPIRE, 2s timeout), no new npm deps. `/api/auth/register` capped 5/IP/10min; NextAuth `credentials.authorize` capped 10/IP/10min AND 5/email/10min (both must allow). Generic error so attacker can't tell which axis tripped. Fail-open on Upstash errors (better to let one bruter through than lock all users out). env.ts reserves `UPSTASH_REDIS_REST_URL/TOKEN` + `SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN`. To activate rate-limit: paste Upstash creds into Vercel env.
  - **Vercel Cron wired** (`56c4a42`). `vercel.json` had no `crons` array — recurring-invoice runner and overdue sweep were dead code in prod despite the endpoints existing. Extracted `runRecurringForOrg` service helper from the per-org route, added top-level `POST /api/cron/run-recurring` that loops orgs (mirroring `/api/cron/check-overdue`). Both crons registered at daily granularity (fits Hobby 2-crons cap): check-overdue 03:00 UTC, run-recurring 04:00 UTC. RUNBOOK cron-endpoint table refreshed.
  - **Cross-tenant write holes + mass-assignment closed** (`410d8dd`). `cost-centers` PATCH/DELETE WHERE clause filtered only by `id`, no `organizationId` — user in org A could update/delete cost-centers in org B if they knew the ID. Same bug on `projects` PATCH/DELETE. `bank-accounts` PATCH was tenant-isolated but mass-assignable — caller could overwrite `currentBalance`/`openingBalance` directly, bypassing the entire payment/receipt GL-posting pipeline. Added ownership findFirst, defense-in-depth orgId WHERE, `.strict()` Zod schemas (bank-accounts excludes the GL-derived fields), soft-delete FK guards on cost-centers + projects.
- **What's next:** HIGH-tier production fixes — H1 CSP w/ nonce, H2/H3 integration tests of API routes (payment GL, voucher cancel, cross-tenant DELETE, race-safe numbering), H5 JWT revocation, H8 CSRF origin allowlist. User chose "strict CSP + CSRF" risk tolerance.
- **What's done earlier in project history:**
  - **Form 16A / 27D printable cert** (`c8ec993`). New `/taxation/tds-tcs/cert/[partyId]?fy=&q=&kind=tds|tcs` renders one deductee's quarterly certificate in a print-friendly layout mirroring the official forms (Part I deductor+deductee, Part II section-wise summary, challan ref block, verification + signature line). Print stylesheet hides dashboard chrome. "📄 Cert" pill on each Form 16A/27D card links to it in a new tab. Closes the "TDS deductor must hand a quarterly cert to each deductee" compliance gap.
  - **Ops closure** (`8af5117`). `/api/health` now compares on-disk `prisma/migrations/` vs `_prisma_migrations` and 503s on drift (catches "deploy ran but migrate deploy was skipped"). New `docs/RUNBOOK.md` — day-1 ops doc with on-call quickstart, deploy checklist, Neon PITR backup procedure, secret rotation table (DATABASE_URL/AUTH_SECRET/RESEND/CRON quarterly), migration playbook, cron endpoint inventory + Vercel Cron snippet, SEV1/2/3 incident guidance. DEVELOPER_GUIDE API table refreshed with the 9 endpoints shipped since `b2f3174`.
  - **Push to 95% production-ready** (`9c46d36`). Single batch closing the largest audit-v2 gaps.
    - **Super admin** seeded against Neon: `admin@accubook.com` / `password123!`. Login page demo card updated. (Seed's org upsert dodges Neon-pooler P2022 via narrow `select`.)
    - **Cancel-* UIs wired** on `/purchases/payments`, `/sales/receipts`, `/purchases/bills`. The existing "Delete" buttons were 404'ing into a non-existent DELETE handler; repurposed to call the real PATCH cancel endpoints (payments → CANCELLED; receipts → CANCELLED or BOUNCED via two-button dialog; bills → PATCH cancel for posted, fall-through DELETE for DRAFT). Closes audit BLOCKER #3.
    - **TDS Monthly Challan tab** added to `/taxation/tds-tcs` consuming `?view=monthly-challan`. Per-section count/deductees/base/tax + ITNS-281 due date.
    - **CRON_SECRET service-account path** — new `requireCronSecret(request)` helper (constant-time Bearer compare) + new top-level `POST /api/cron/check-overdue` that sweeps every active org. External schedulers can now drive cron flows without a session cookie.
    - **Security mediums**: GET `/api/organizations/[orgId]` permission-gated; DELETE `/bills/[billId]` permission-gated; pino redact extended (RESEND_API_KEY, CRON_SECRET, apiKey); NextAuth explicit `secret` + `trustHost`.
  - **Audit v2 — two BLOCKERs + two HIGHs** (`4acca88`). (1) `recomputeBillStatus` was clobbering the TDS reduction every time a payment landed — fixed to subtract `tdsAmount` (Bill never closed otherwise; AP drifted from vendor ledger). (2) Migration 10 adds the missing `Payment.voucher` / `Receipt.voucher` FK constraints to DB; the Prisma relations were schema-only, no SQL backing. (3) Bill reversal now deletes orphaned `TdsDeduction` rows + clears the bill's TDS context fields + resets amountDue (was leaving stale Form 16A entries on bills sent back to DRAFT). (4) `/payroll/post-month` + `/payroll/pay-month` now permission-gated on `payroll:approve` (every other GL-posting POST had the gate; payroll was the anomaly).
  - **Voucher numbering race + TDS_SECTIONS single-source** (`6e4efc1`). Vouchers POST was the last caller of the `findFirst orderBy + 1` pattern (race-prone under concurrent posts; previously labelled ACCEPTABLE in the audit but actually a 500-on-loser bug). Switched to the race-safe `generateVoucherNumber` helper. TDS_SECTIONS const arrays in payments/bills/receipts collapsed to three exports from `tds.ts` — `TDS_DEDUCTION_SECTIONS` / `TCS_COLLECTION_SECTIONS` / `TDS_SECTIONS_ALL` — each `as const satisfies readonly TdsSectionCode[]` so type and runtime values stay locked together at compile time. Bills now narrows to deduction-only sections (was using the union, which would have accepted a 206C TCS code on a vendor bill).
  - **Daily overdue notification emitter** (`ae7f2e8`). New `checkOverdue(prisma, orgId)` service: sweeps overdue invoices + bills, emits Notification rows to active org users (type=PAYMENT_DUE; data carries entityId+daysOverdue+inboxPath). 24h dedup via Postgres JSONB path query on `data.entityId`. New `POST /notifications/check-overdue` endpoint for external cron (Vercel Cron / GitHub Actions). Returns scan/created/skipped counters. New `src/shared/utils/dates.util.ts` (daysBetween) extracted as a leaf utility. +7 tests (353 total).
  - **Cancel-receipt flow** (`4143c5a`). AR-side mirror of c04ec29. PATCH `/receipts/[receiptId]` with status=CANCELLED or BOUNCED. Reverses voucher, decrements BankAccount.currentBalance by `amount + tcs`, drops TcsCollection row, removes InvoicePayment junction, recomputes Invoice.amountPaid/Due/status. Schema: added Receipt↔Voucher relation.
  - **Cancel-payment flow** (`c04ec29`). PATCH `/payments/[paymentId]` for status=CANCELLED. Reverses the voucher (Dr↔Cr swap), restores BankAccount.currentBalance by `amount − tds`, deletes the TdsDeduction row (deduction never happened in legal terms), drops the InvoicePayment junction, prepends [CANCELLED] + reason to notes, recomputes Bill.amountPaid/Due/status. Permission-gated on `payments:approve`. Schema: added Payment↔Voucher relation (FK already existed).
  - **WS5 — TDS monthly challan summary** (`aa0d764`). New `buildMonthlyChallan` aggregator + `?view=monthly-challan&fy=...&month=...` on `/tds-deductions`. Groups TdsDeduction by section for one calendar month with count/base/tax/distinct-deductee per section + org-wide totals. Includes ITNS-281 deposit due date (7th of next month, or Apr 30 for March). Closes the gap between persisted deductions (b8dfd56) and the quarterly Form 16A (b8dfd56) — accountants need this to deposit cash monthly. +10 tests (346 total).
  - **Bill PATCH with voucher reversal** (`5f4bfd9`). Mirrors the voucher PATCH reversal pattern from PR2. DRAFT/PENDING_APPROVAL→APPROVED posts to GL via postBillToGl (or re-applies entries if voucher already exists). APPROVED→CANCELLED|DRAFT reverses every entry (Dr↔Cr swap) and flips Voucher.status accordingly. Refuses reverse when payments exist. Locks notes/vendorBillNo edits on posted bills. Permission-gated on `bills:approve`. Audit action distinguishes POST / REVERSE / UPDATE.
  - **In-app notifications + real org-settings save** (`fa0e1c3`). `notifyNewApprovers` now also inserts `Notification` rows so the `/settings/notifications` inbox actually fills (it was wired to a real GET endpoint but nothing was creating rows). `/settings/organization` rewritten from 395-line placeholder mock-defaultValue form to a real load+save against `PATCH /api/organizations/[orgId]` (basic info, tax IDs, contact, registered address); cross-links to `/settings/india-tax` for composition scheme.
  - **Audit MEDIUM follow-ups (3 commits).** `3d28496` — bills POST now writes audit log (action=POST when promoted-to-GL at create, =CREATE otherwise; payload captures rcm/tdsSection/voucherId); routeEntityForApproval `amountLimit` gate uses explicit null/undefined check so `0` is treated as a real threshold (was JS-falsy-coerced). `b2f3174` — README + DEVELOPER_GUIDE refreshed: README architecture-notes now mentions bills→GL on approval + the approvals workflow + email scaffold; DEVELOPER_GUIDE adds the new endpoints (post-month, pay-month, PATCH /organizations, DELETE /approvals) and the new page inventory (Approvals / Billing / Manufacturing / Banking modules; india-tax / setup migrate / gstr2b).
  - **Production-readiness audit + Tier 1+2 fixes (4 commits).** Four parallel audit agents (security / data integrity / ops / code quality) found 12+ blocker/high issues. Fixed in three batches:
    - `43dff53` Approvals cross-tenant fix — migration 9 adds `Approval.organizationId` (backfilled from routed entity); routing helper sets it on every create; PATCH/promote-entity filter by it; POST/DELETE permission-gated; `createWorkflowSchema` validates approverId belongs to the org. Also drive-by fixed `userId: ""` FK-violation fallback in promote-entity.
    - `4159284` Data integrity — bills `amountDue` now reduced by TDS (AP subledger no longer drifts from vendor ledger); 194Q YTD aggregate sums `subtotal` not `totalAmount` (CBDT Circular 13/2021); recurring runner derives FY from `ranAt` not `nextRunDate` (back-dated catch-ups can't mint invoice numbers in closed FYs); bills DELETE refuses if `voucherId` is set (won't orphan a posted voucher).
    - `658932d` UX — six orphaned pages added to sidebar nav (`/approvals`, `/billing/recurring`, `/manufacturing/work-orders`, `/taxation/gstr2b`, `/hr/payroll/run`, `/settings/india-tax`, others); `/settings/preferences` placeholder rewritten (was fake-save with toast lie); `/settings/notifications` wired to the real `/api/notifications` endpoint (was hardcoded December-2024 mock data).
    - `ae638b2` Tier 2 — Resend fetch gets 5s timeout (no more hung threads); TDS list view includes `bill` (was NPEing on bill-sourced rows after migration 8); `.env.example` documents `RESEND_API_KEY`/`EMAIL_FROM`/`APP_URL` (now actually tracked, was caught by `.env*` ignore); voucher schema gets `.strict()`; GSTR-2B reconcile + recurring runner + recurring create get permission gates.
  - **WS1 + WS5 — Bill posts to GL (closes the architectural blocker).** Bills now hit the books at the moment they're recorded (accrual basis), not when paid. Migration `8_bill_to_gl_posting`: `Bill.voucherId / tdsSection / tdsRationale` + `TdsDeduction.paymentId` becomes nullable + `TdsDeduction.billId` added. New pure helper `decideBillEntries({taxable, gst, tdsAmount, reverseCharge, composition})` returns the 5-line plan; +9 invariant tests covering every combination of regular / RCM / composition / TDS-at-bill (Dr=Cr always). New `postBillToGl(tx, opts)` resolves party + Purchase Accounts + GST Input + GST Output (RCM) + TDS Payable, builds the Voucher (PURCHASE), persists `TdsDeduction` row when applicable, links `Bill.voucherId`. Wired into bills POST (status=APPROVED at create) and into `maybePromoteEntity` (workflow-gated promotion). bills POST schema gains `reverseCharge` + `tdsSection` + `deducteeType` + `noPan`. Idempotent (refuses re-post). Posting failure aborts the tx so books never carry an APPROVED-but-not-posted bill.
  - **Approvals polish + email scaffold.** (a) Sibling cleanup: when one ROLE-holder decides a step, the other PENDING rows are auto-CANCELLED with a "X already decided" comment so the inbox stays tidy. (b) `maybePromoteEntity` extended to ExpenseClaim (PENDING→APPROVED/REJECTED with `approvedBy` stamped from latest APPROVED Approval) and Leave (same). (c) `routeEntityForApproval` now actually implements MANAGER approver type via `Employee.reportingTo`. (d) New `src/backend/services/email/send.ts` — provider-neutral wrapper around Resend; no-ops with a logged-warning when `RESEND_API_KEY` / `EMAIL_FROM` are unset, so the rest of the app calls `sendEmail()` unconditionally. New `sendApprovalRequestEmail()` helper. (e) New `notifyNewApprovers(prisma, ctx)` runs post-tx in vouchers POST + bills POST, emails every PENDING approver with their inbox link.
  - **Approval → entity auto-promote/demote.** New `maybePromoteEntity(tx, entityType, entityId)` helper. PATCH /approvals now wraps the Approval update + the promotion in a single $transaction: if any approval is REJECTED → demote (Voucher → REJECTED, Bill → DRAFT); if ALL approvals are APPROVED → promote (Voucher → APPROVED + isPosted + applyLedgerEntries; Bill → APPROVED). Idempotent (only acts when entity is currently PENDING_APPROVAL). Closes the loop: pending voucher → workflow routes → approver clicks Approve → voucher auto-posts to GL.
  - **Voucher + Bill CREATE → auto-route through approval workflow.** New `routeEntityForApproval(tx, opts)` helper. When a voucher is created with `requiresApproval` (or a bill with status=PENDING_APPROVAL), looks up the active ApprovalWorkflow for that entityType, evaluates each step against the entity's amount (steps with `amountLimit` skipped when amount < limit — so "up to ₹10k auto-approve, ₹10k+ needs CFO" works), and creates `Approval` rows. USER and ROLE approver types fully supported (ROLE creates one row per holder; any one can approve). MANAGER skipped with TODO. Routing failures non-fatal — entity stays in pending state for manual review. Wired into both `vouchers POST` and `bills POST`.
  - **UI — `/approvals` inbox.** Surfaces the existing approvals backend (no UI before). Two tabs: Pending (current user's queue, with Approve / Reject actions per row) and History (past approvals where you were either approver or requester). Action dialog collects optional comments before posting back to the existing `PATCH /approvals` route. Empty state ("Inbox zero") when nothing's queued. Build now 75 pages.
  - **PATCH /organizations/[orgId] + `/settings/india-tax` page.** First properly-implemented org settings PATCH (the placeholder /settings/organization page was hardcoded `defaultValue` inputs that never persisted). Strict-mode zod allow-list of editable fields (no smuggling). New `/settings/india-tax` page lets users set GSTIN, supplier state, and toggle composition scheme + pick the rate (1% / 5% / 6%). Audit log entry per save. Heads-up banner when turning composition OFF mid-year.
  - **UI — CMP-08 tab on `/taxation/gst`.** Fourth tab next to GSTR-1/3B/9. Period bar (FY + quarter), 4-KPI summary (turnover / composition tax / RCM-inward / total), 8-cell layout matching the GSTN portal form. Refuses with structured error if org isn't on composition.
  - **UI — `/billing/recurring`.** Recurring-invoice management page. List view with party / frequency / next-run (with DUE badge when overdue) / runCount / last-invoice / status. KPIs for due-now / active / inactive. "Run now" button hits the runner; result card shows spawned + errored counts with details. "New template" modal collects party + frequency + start/end dates + due-days + single line-item, posts to `POST /recurring-invoices`. Build now 73 pages.
  - **Recurring billing scaffold.** New `RecurringInvoice` model with frequency / startDate / endDate / nextRunDate / dueDays / items JSON template / meta / runCount / lastInvoiceId (migration `7_add_recurring_invoices` applied). Pure helper `addFrequency` (DAILY / WEEKLY / MONTHLY / QUARTERLY / YEARLY) handles month-end clamp correctly (Jan 31 + 1mo → Feb 28/29). Plus `isDue`, `missedRunDates`, `isFrequency`. New `POST /recurring-invoices` to create a template; new `POST /recurring-invoices/run` to spawn one invoice per due template (mirrors invoice POST's GST split + composition handling + race-safe FY-scoped numbering, advances `nextRunDate` and bumps `runCount`, auto-deactivates when past `endDate`); new `GET /recurring-invoices?active=true&dueOnly=true` to list. Cron-friendly. +23 tests (327 total).
  - **WS1 — Composition Scheme support.** New `Organization.compositionScheme` flag + `compositionRate` (Decimal 5,2). Migration `6_add_composition_scheme` applied to Neon. Invoice POST detects the flag and zeros out per-line GST cells (CGST/SGST/IGST) on customer-facing lines while still capturing place-of-supply / supplyType for audit. New `computeCmp08(orgId, fy, quarter, rate)` aggregator: outward turnover × composition rate (split half/half CGST/SGST), plus regular GST on RCM-inward bills (composition supplier still owes RCM). New `GET /gst-returns/cmp08?fy=...&quarter=...` endpoint, refuses if org isn't on composition. +5 tests (304 total).
  - **UI — three new pages reach previously-curl-only endpoints.** (a) `/taxation/gstr2b`: file picker for GSTN GSTR-2B JSON, posts to `/gst-returns/gstr2b/reconcile`, renders 4-KPI summary + tabbed table per status (Matched / Mismatched / Missing-in-Books / Missing-in-2B) with reasons + ITC-eligibility badges. (b) `/hr/payroll/run`: month/year picker, two-step card layout (Post to GL → Pay net salary) with bank account dropdown, success display with line-by-line JV breakdown. (c) `/manufacturing/work-orders`: WO list with status badges + KPIs + Issue/Complete action buttons, modal for Issue (renders structured shortage list on 400) and Complete (collects completedQty + scrapQty, displays FG unit cost on success).
  - **WS5 UI — `/taxation/tds-tcs` wired to real endpoints.** Replaces the placeholder ₹0 page. Period bar (FY input + quarter dropdown, defaults to current FY+Q). Four tabs: TDS Deductions list, TCS Collections list, Form 16A (TDS quarterly cert), Form 27D (TCS quarterly cert). Both list views show per-row date, party, PAN (with NO-PAN flag in amber), section, rate, base, tax, rationale. Both cert views render party-card-per-row with section sub-table + party totals. Powered by `/tds-deductions` and `/tcs-collections` with `?view=list` and `?view=form16a/form27d`.
  - **WS2 — GSTR-2B reconciliation.** New `parseGstr2bJson` extracts the GSTN portal's GSTR-2B file (rtnprd / docdata.b2b[].ctin / inv[] / items[]); robust to single-element-as-object quirk and the missing-`data`-wrapper variant. New `matchGstr2bToBills` (pure aggregator) classifies every supplier-reported invoice into MATCHED / MISMATCHED / MISSING_IN_BOOKS, plus surfaces every B2B bill in books that's MISSING_IN_2B. Case-insensitive on both GSTIN and vendor invoice number. ₹1 per-cell tolerance (rounding noise on the supplier side). New `POST /gst-returns/gstr2b/reconcile` accepts multipart upload or `application/json`, derives the period from rtnprd, loads bills for that calendar month (excludes DRAFT/CANCELLED), returns the full reconciliation result. Read-only — no persistence yet (Gstr2bImport / Gstr2bRow tables are a follow-up). +16 tests (299 total).
  - **WS2 — GSTR-9 portal JSON converter.** Mirrors the GSTR-1/3B portal pattern: `gstr9ToPortalJson(result, { gstin, precedingFyTurnover? })` emits the GSTN portal upload format with sections 4 (A-N), 5 (A-N), 6 (A-O ITC), 7 (A-J reversal), 9 (tax payable / paid-via-ITC / paid-in-cash). Cells we don't yet compute (4D SEZ, 4E deemed exports, 6.A-L ITC sub-categorization, 7.A-G specific reversal reasons) are emitted as zeros — portal accepts and the user can edit before filing. Download endpoint at `/gst-returns/gstr9/portal?fy=2025-26&download=true&precedingFyTurnover=...` serves as `GSTR9_<gstin>_<FY>.json`. +12 tests (283 total).
  - **WS5 — TDS/TCS persistence + Form 16A/27D aggregator.** New `TdsDeduction` and `TcsCollection` Prisma models with migration `5_add_tds_tcs_persistence` (applied to Neon). Each row captures section / deducteeType / ratePercent / baseAmount / taxAmount / noPan / rationale / FY / voucher + payment-or-receipt FK. Persisted from inside the existing payments + receipts $transactions when the caller flagged a section. Rate captured from `computeTds` output (not the input — picks up the no-PAN penal override correctly). Two new GETs: `/tds-deductions` and `/tcs-collections`, both with `?view=list` (paginated raw rows) and `?view=form16a`/`?view=form27d` (party-and-section quarterly aggregator). New pure helper `buildForm16AQuarterly` + `quarterFromDate` + `quarterDateRange`. +16 tests (271 total). tsc + build clean.
  - **WS18 — Tally voucher import.** `parseTallyXml` now extracts VOUCHER messages (VCHTYPE attr, VOUCHERTYPENAME, VOUCHERNUMBER, DATE, NARRATION, ALLLEDGERENTRIES.LIST or older LEDGERENTRIES.LIST). New `importTallyVouchers` (called from `importTallyData` when the parsed data carries vouchers and `opts.userId` is supplied): maps voucher type by name to our codes, looks up FY covering each voucher's date, resolves every named ledger, builds VoucherEntry rows (positive AMOUNT→Dr, negative→Cr abs), refuses Dr≠Cr unbalanced vouchers, skips with structured error on missing ledger / FY / unsupported type / duplicate. Idempotent on (orgId, voucherType, voucherNumber, FY). Same route accepts everything in one upload now; transaction timeout bumped to 30s for big files. +3 tests (255 total). Tally migration covers Tally All-Masters + Day Book together.
  - **WS7 — payroll pay step closes the cycle.** New `POST /api/organizations/[orgId]/payroll/pay-month` settles the Salaries Payable balance: validates the period is fully PROCESSED (refuses if any payslip is still DRAFT/APPROVED, refuses partial-paid), sums net salaries, posts Dr Salaries Payable / Cr Bank-or-Cash JV, decrements `BankAccount.currentBalance`, moves payslips to PAID with paidAt + paidVia + transactionRef. Voucher type=PAYMENT, prefix=PAY-OUT. Audit row entityType=PayrollDisbursement.
  - **WS10 — manufacturing issue + complete state transitions.** `POST /api/organizations/[orgId]/manufacturing/work-orders/[id]/issue` reads the WO's BOM, scales each component to plannedQuantity, atomically decrements source-warehouse stock with structured shortage details on 400, creates ISSUE StockMovements at avgCost, posts a single Dr Work in Progress / Cr Stock-in-Hand JV, transitions DRAFT→IN_PROGRESS. `POST /work-orders/[id]/complete` accepts completedQuantity + optional scrapQuantity, derives WIP value from prior ISSUE movements (referenceType="WORK_ORDER"), GRNs the FG with weighted-avg cost recompute, posts Dr Stock-in-Hand / Cr Work in Progress for the full WIP value, transitions IN_PROGRESS→COMPLETED. Scrap absorbed into FG unit cost. New seed ledgers "Stock-in-Hand" and "Work in Progress" under the existing Stock-in-Hand group. AuditAction extended with "ISSUE" / "COMPLETE". tsc + 252 tests + 71-route build clean.
  - **WS7 — payroll month-end posting to GL.** `POST /api/organizations/[orgId]/payroll/post-month` aggregates every DRAFT/APPROVED payslip for (month, year) without a voucherId, builds a single JV via the new pure aggregator `buildPayrollJournal`, and posts it. Each included payslip is linked to the voucher and moved to PROCESSED. Employer PF/ESI re-derived from each payslip's basic+gross via the existing helpers. Zero-amount lines dropped. Audit log captures totals. **Schema:** `Payslip.voucherId` (nullable FK to Voucher) + migration `4_add_payslip_voucher_link` applied to Neon. **Seed:** 6 new ledgers (PF Payable, ESI Payable, Professional Tax Payable, Salaries Payable, Employer PF Contribution, Employer ESI Contribution); existing orgs handled by find-or-create helper. **Posting helpers:** new `getOrCreateNamedLedger` generic wrapper. **Tests:** +9 aggregator tests (252 total). tsc + 252 tests + 69-page build clean.
  - **WS5 — TCS at receipt time + TDS YTD bug fix.** receipts POST mirrors the TDS-on-payments pattern: optional `tcsSection` (`206C_1H` / `206C_1F`), `deducteeType`, `noPan`. With TCS, voucher is 3-line (Dr Bank gross / Cr Party amount / Cr TCS Payable); BankAccount.currentBalance increments by gross (= amount + tcs). Without TCS, behaviour unchanged. Audit captures tcsSection / tcsAmount / rationale / bankGrossAmount. New posting helper `getTcsPayableLedger` (factored alongside `getTdsPayableLedger` via shared `findOrCreateDutiesAndTaxesLedger`). Seed adds "TCS Payable" ledger. **Bonus fix:** `getFiscalYearForDate` now also returns `startDate`; payments POST switched its YTD aggregate from `gte: undefined` (whole-of-time, latent bug) to `gte: fy.startDate`, so the 194Q annual threshold is checked correctly. Receipt YTD uses the same FY-bounded query. tsc + 243 tests + 69-page build clean.
- **Earlier this session:**
  - PR 1 (`ce7532d`+`381fe36`+`1cc57c0`): tenant isolation closed everywhere, permission model rewired, quick-wins.
  - PR 2 part 1 (`46d022b`): Decimal helpers, posting helpers, payments/receipts/bills/vouchers POST → GL posting in `$transaction`. Reports filter DRAFT.
  - PR 2 part 2 (`c5eba29`): Decimal sweep across 6 reports (~69 sites), stock movement guard + weighted-avg recompute.
  - PR 3 part 1 (`82a99c5`): env.ts zod, /api/health, error boundaries, security headers, pino logger, DB pool tuned, ESLint fixed, 8 unused deps pruned.
  - PR 3 part 2 (`31d3f43`): Vitest + 19 tests, GitHub Actions CI, console.error → logger sweep (129 calls / 60 files), README rewritten, .env.example, 40 scaffold stubs deleted.
  - PR 3 part 3 (`e5d8935`): Prisma migrations baselined against Neon, vercel.json updated, hasPermission extracted to leaf module, +10 unit tests (29 total), DEVELOPER_GUIDE refreshed.
  - PR 2 part 3a (`1f2a0e1`): NumberCounter model + race-safe numbering across all 5 entity types (voucher/invoice/bill/payment/receipt).
  - PR 2 part 3 b/c/d (`4ad25ca`): voucher PATCH with reversal, soft delete sweep on bills + tax-config, audit log helper + hookups in payments/receipts/vouchers POST + vouchers PATCH.
- **What's next** — India end-to-end build.
  - **WS1 (invoicing core) — done (incl. composition scheme):**
    * `india-tax.ts` helper + tests (`dcf10b3`).
    * Schema columns + persistence of CGST/SGST/IGST/CESS breakdown on InvoiceItem and BillItem; placeOfSupply, supplyType, reverseCharge on Invoice and Bill (`f948ce6`).
  - **WS1 — still pending (lower priority):**
    1. HSN/SAC code library (master data + lookup helper) — currently HSN code is a free-text field on items.
    2. GSTIN checksum (Mod-36 check digit) validation — format-only check exists.
    3. Reverse charge mechanism: column exists, but POST doesn't set it and offsetting RCM voucher entries aren't generated.
    4. Composition scheme handling (outward at 1%/5%/6%, no ITC).
    5. Export invoice (zero-rated outward, LUT vs IGST).
    6. Place-of-supply overrides for special-category services (IGST Act §12-13).
  - **WS2 (GSTR-1) — backend complete:**
    * `computeGstr1` covers all 9 sections: B2B / B2CL / B2CS / CDNR / CDNUR / EXP (WPAY/WOPAY) / NIL / HSN / DOCS (`d2204a4`, `95614c4`).
    * `summarizeGstr1` includes credit-note / debit-note totals.
    * `gstr1ToPortalJson` + GET `/api/.../gst-returns/gstr1/portal?...&download=true` produces the GSTN portal upload JSON in the exact format the portal accepts (DD-MM-YYYY dates, numeric state codes, rchrg Y/N, etc.) and serves it as `GSTR1_<gstin>_<MMYYYY>.json` (`9f93061`).
    * Invoice POST sets `supplyType="EXPORT"` for non-Indian customers.
    * 26 GSTR-1 unit tests (B2B/B2CL/B2CS/CDNR/CDNUR/EXP/NIL/HSN/DOCS + portal conversion).
  - **WS2 — still pending:**
    1. UI: wire `taxation/gst/page.tsx` to call the endpoints (GSTR-1 + GSTR-3B + portal download), period picker, section tabs.
    2. Org-level "preceding FY turnover" setting → flow into portal `gt` field.
    3. GSTR-3B portal JSON conversion (different shape from GSTR-1).
    4. CDNUR `typ` discrimination, inv_typ overrides (SEWP/SEWOP/DE), LUT flag → EXPWOP override.
    5. ATXP (advances), SUPECO (e-commerce) — need new domain models.
    6. GSTR-3B Section 4.A.(1)(2)(4) — imports of goods/services + ISD; needs Bill type extension.

  - **WS3 (e-invoicing NIC IRN) — first chunk shipped (`66fe987`):**
    * `buildEInvoicePayload` produces NIC schema v1.1 payload from any invoice.
    * Strict pre-flight validation: GSTIN format, address completeness, HSN per line. Returns `EInvoiceValidationError` with `details: string[]` so the UI can render a checklist.
    * GET `/api/organizations/[orgId]/invoices/[invoiceId]/einvoice-payload` for preview/validation.
    * 11 tests.
  - **WS3 — still pending:**
    1. Actual NIC sandbox/prod API integration (auth-token endpoint, POST /eivital/v1.04/Invoice).
    2. Persist IRN/QR on Invoice (columns `irnNumber`, `qrCode` exist already).
    3. Cancellation endpoint (24-hour window).
    4. E-way bill auto-generation from invoice.
    5. SEZ supplies (SEWP/SEWOP), deemed exports (DEXP) classification.
    6. `Party.legalName` field for proper LglNm vs TrdNm distinction.

  - **WS18 (Tally migration) — masters import shipped (`1b812da`):**
    * `parseTallyXml` + `importTallyData` import groups, ledgers, parties, stock items from a Tally All-Masters XML.
    * Two-pass group import resolves child-before-parent ordering.
    * POST `/api/organizations/[orgId]/migration/tally` accepts multipart upload up to 50 MB.
    * Idempotent (re-running upserts by name).
    * Audit-logged.
    * 7 tests.
  - **WS18 — still pending:**
    1. VOUCHER import (sales/purchase/payment/receipt) — biggest piece left.
    2. UNIT masters import (currently uses existing org UoMs).
    3. STOCKGROUP → ItemCategory mapping (currently flattens).
    4. BILLALLOCATIONS — Tally bill-wise outstanding for parties.
    5. Tally GST registration types → enum normalization.
  - **Order of work (rough trunk):** invoicing core → bills+ITC → GSTR-1 → e-invoicing → GSTR-3B → TDS → e-way bill → banking import → payroll → reports expansion → manufacturing → migration → POS → workflows → ESS.
  - Loose ends still open:
    - Integration tests against ephemeral test DB (Docker/testcontainers).
    - Rate limiting on `/api/auth/*` (Upstash — Q3 still open).
    - Email service for invitations (Resend/Postmark — Q4 still open).
    - DB password rotation (Q3/D3).

## 9. Completed log (reverse chronological)

| Date | What | Commit |
|---|---|---|
| 2026-05-04 | **Printable Form 16A / 27D cert** at `/taxation/tds-tcs/cert/[partyId]`. Per-party quarterly certificate; print-friendly layout mirroring official forms; "📄 Cert" pill links from the Form 16A/27D tabs. | `c8ec993` |
| 2026-05-04 | **Ops closure** — `/api/health` migration-drift check, `docs/RUNBOOK.md`, DEVELOPER_GUIDE endpoint refresh. | `8af5117` |
| 2026-05-04 | **Push to 95%** — super admin (`admin@accubook.com`/`password123!`), 3 cancel-* UIs wired, TDS monthly-challan tab, `CRON_SECRET` cron path, security mediums (GET org gate, bills DELETE gate, pino redact, NextAuth explicit secret). | `9c46d36` |
| 2026-05-04 | **Audit v2 fixes** — `recomputeBillStatus` × `tdsAmount`; migration 10 (Payment/Receipt voucher FKs); bill reversal drops TdsDeduction; payroll permission gates. | `4acca88` |
| 2026-05-04 | **Voucher numbering race fix + TDS_SECTIONS single-source.** Vouchers POST switched to the race-safe NumberCounter pattern (last caller of the old findFirst+1). TDS section arrays consolidated into three exports from tds.ts. | `6e4efc1` |
| 2026-05-04 | **Daily overdue notification emitter.** `checkOverdue` service + `POST /notifications/check-overdue` endpoint (cron-friendly). 24h dedup. +7 tests (353 total). | `ae7f2e8` |
| 2026-05-04 | **Cancel-receipt flow** (mirror of c04ec29). PATCH `/receipts/[receiptId]` with status=CANCELLED|BOUNCED. | `4143c5a` |
| 2026-05-04 | **Cancel-payment flow.** PATCH `/payments/[paymentId]` reverses voucher + restores bank + drops TDS row + recomputes bill status. Permission-gated. | `c04ec29` |
| 2026-05-04 | **WS5 — TDS monthly challan summary.** New `buildMonthlyChallan` + `?view=monthly-challan` on `/tds-deductions`. ITNS-281 due-date helper. +10 tests (346 total). | `aa0d764` |
| 2026-05-04 | **Bill PATCH with voucher reversal.** | `5f4bfd9` |
| 2026-05-04 | **In-app Notification rows + real org-settings PATCH form.** | `fa0e1c3` |
| 2026-05-04 | **Docs refresh** — README architecture notes + DEVELOPER_GUIDE endpoint/page inventory. | `b2f3174` |
| 2026-05-04 | **Audit log in bills POST + amountLimit `0` falsy fix.** | `3d28496` |
| 2026-05-04 | **Tier 2 audit fixes — Resend timeout, TDS list nullable-payment, .env.example, .strict() schemas, permission gates.** | `ae638b2` |
| 2026-05-04 | **Tier 1 UX — sidebar links 6 orphaned pages; preferences placeholder; notifications wired to real API (was Dec-2024 mock).** | `658932d` |
| 2026-05-04 | **Tier 1 data integrity — bills amountDue net of TDS; 194Q YTD net of GST; recurring runner FY from ranAt; bills DELETE checks voucherId.** | `4159284` |
| 2026-05-08 | **API keys for external integrations (e.g. hospital ERP).** New `ApiKey` table (migration 11) with hashed token at rest + visible 12-char prefix. Format: `acb_live_<32-hex>`. Storage: SHA-256 hex hash; `keyPrefix` indexed for constant-time lookup; `scopes` JSON. New helpers in `src/backend/utils/api-scope.ts` (resource map, `methodToAction`, `resolveScopeTarget`, `scopesCover`, `isValidScopes`) + `verify-api-key.ts` (`generateApiKey`, `extractBearerToken`, `verifyApiKey` with constant-time compare + fire-and-forget last-used update). `withOrgAuth` extended to accept `Authorization: Bearer acb_live_…` in addition to session cookies; on API-key requests it scope-checks the resolved (module, category, action) tuple against the key's grants and returns 403 `scope_denied` on mismatch. New routes: `GET / POST /api/.../api-keys` (list with masked prefixes; create returning the full token EXACTLY ONCE) + `DELETE /api/.../api-keys/[keyId]` (soft-revoke, audit-logged). New page `/settings/api-keys` with module×category×action scope picker (Read-only / Full access / Clear shortcuts per module), show-once token reveal dialog with copy-to-clipboard + curl example, revoke confirm. ADMIN-only at the management endpoints; API keys cannot create/manage other API keys (low-priv key bootstrapping defence). +20 tests (`api-scope.test.ts`) — 373 total now. tsc + build clean. | _(local)_ |
| 2026-05-06 | **Dashboard repair + UI sweep (autonomous run).** Four root causes fixed: (a) middleware was at repo root, not picked up under `src/app/` — moved to `src/middleware.ts`, restoring auth-bypass protection (unauthed `/dashboard` now 307→/login). (b) Dashboard hung on infinite skeleton when user had no org — `fetchDashboardData` returned without `setLoading(false)`. (c) DB had zero `Organization` rows + lone `admin@accubooks.com` (typo, no org) — re-seeded; admin is now `admin@accubook.com / password123!` linked to `Demo Corporation` org as ADMIN. (d) Then full button/3-dot audit + wiring: header now has working command-palette search (jump-nav) and real notification dropdown wired to `/notifications` API (markAllRead, view-all link, unread badge). Sales invoices 3-dot → Print/Download (autoprint via `?print=1` on detail page), Duplicate (new POST `/invoices/[id]/duplicate` creates DRAFT clone with FY-scoped number), Send Reminder (new POST creates Notification + audit). Chart of Accounts 8 dead items wired (group Add Sub-Group / Add Ledger / Edit / Delete; ledger View Details / Edit / View Transactions / Delete) — added `PATCH /ledger-groups/[id]` + `DELETE` with system-group + non-empty guard. Budgets fully rewritten — replaced mock data with real fetch, wired Activate/Close/Delete to existing PATCH/DELETE, removed three items with no backend (View Details / Edit / Budget vs Actual). Parties dropdowns wired (View Details + View Transactions → `/reports/registers?tab=party&partyId=…`; Edit reuses dialog with PATCH; Delete already worked). Registers page now reads `?partyId=` + `?tab=` query. Three Export buttons (vouchers/ledgers/payments) wired to client-side CSV via new `frontend/utils/export-csv.ts`. tsc clean, build passes 75 pages, 10/10 authenticated API smoke tests green. **No git push.** | _(local)_ |
| 2026-05-04 | **Tier 1 security — Approval cross-tenant fix.** Migration 9: `Approval.organizationId` (backfilled). Routing/PATCH/promote scoped by org. POST/DELETE permission-gated. `createWorkflowSchema` validates approverIds belong to org. | `43dff53` |
| 2026-05-04 | **Bill → GL posting (architectural).** Migration 8 (Bill.voucherId, Bill.tdsSection, TdsDeduction.billId). New pure `decideBillEntries` (4-way Dr=Cr invariants) + `postBillToGl` covering regular / RCM / composition / TDS-at-bill. Wired into bills POST + maybePromoteEntity. +9 tests (336 total). | `2ce7a43` |
| 2026-05-04 | **Approvals polish + email scaffold.** Sibling-CANCELLED on first decide; ExpenseClaim + Leave promotion; MANAGER approver type via Employee.reportingTo; Resend-based `sendEmail` with no-op fallback; vouchers/bills post-tx notify approvers. New env vars: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`. | `67bc0d0` |
| 2026-05-04 | **Approval → entity auto-promote/demote.** PATCH /approvals now closes the loop: all APPROVED → voucher posts to GL or bill is approved; any REJECTED → voucher REJECTED / bill back to DRAFT. Single $transaction with the Approval update. | `a19a24d` |
| 2026-05-04 | **Voucher + Bill → approval workflow routing.** New `routeEntityForApproval`. PENDING_APPROVAL voucher/bill auto-creates Approval rows from workflow steps with amount-limit gating. USER + ROLE approver types fully supported. | `99e07f6` |
| 2026-05-04 | **UI — `/approvals` inbox.** Pending + History tabs over the existing approvals backend. Approve / Reject dialog with optional comments. | `79b327a` |
| 2026-05-04 | **PATCH /organizations/[orgId] + `/settings/india-tax` page.** First real org settings PATCH (strict-mode zod + audit log). Page toggles GSTIN / state / composition scheme + rate. | `63a1e2a` |
| 2026-05-04 | **UI — CMP-08 tab on `/taxation/gst`.** Fourth tab; surfaces the composition quarterly cells in 4 KPIs + 8-line cell card. | `9915d80` |
| 2026-05-04 | **UI — `/billing/recurring`.** Template list + Run-now action + Create modal. KPIs (due / active / inactive) + DUE badge per row when overdue. | `d1e56b9` |
| 2026-05-04 | **Recurring billing scaffold.** `RecurringInvoice` model + migration 7. Pure helpers `addFrequency` / `isDue` / `missedRunDates` (handles month-end clamp). New `POST /recurring-invoices` (create template) and `POST /recurring-invoices/run` (cron-friendly tick that spawns one invoice per due template, mirrors GST split + composition + FY numbering). +23 tests (327 total). | `a4b3922` |
| 2026-05-04 | **WS1 — Composition Scheme.** Org-level `compositionScheme` + `compositionRate` (migration 6). Invoice POST zeros per-line GST when on. New `computeCmp08` quarterly aggregator + `/gst-returns/cmp08` endpoint. +5 tests (304 total). | `3b81e23` |
| 2026-05-04 | **UI — three new pages.** `/taxation/gstr2b` (upload + 4-bucket reconcile view), `/hr/payroll/run` (post-month + pay-month two-step), `/manufacturing/work-orders` (list + Issue/Complete modal flow). Build now 72 pages. | `9e5a216` |
| 2026-05-04 | **UI — `/taxation/tds-tcs` wired to real endpoints.** Period bar (FY + quarter), four tabs (TDS list / TCS list / Form 16A / Form 27D) backed by the persistence work shipped earlier today. | `7cb1f8c` |
| 2026-05-04 | **WS2 — GSTR-2B reconciliation.** New `parseGstr2bJson` + `matchGstr2bToBills` (pure helpers). `POST /gst-returns/gstr2b/reconcile` accepts the GSTN 2B JSON, classifies every B2B invoice as MATCHED / MISMATCHED / MISSING_IN_BOOKS / MISSING_IN_2B with reasons. ₹1 per-cell tolerance. +16 tests (299 total). | `e04760c` |
| 2026-05-04 | **WS2 — GSTR-9 portal JSON converter + download endpoint.** Same pattern as 1/3B; emits sections 4 / 5 / 6 / 7 / 9 cells we compute, zeros for unmodeled cells. Optional `precedingFyTurnover` query param feeds `gt`. +12 tests (283 total). | `2199272` |
| 2026-05-04 | **WS5 — TDS/TCS persistence tables + Form 16A/27D aggregator.** New `TdsDeduction` + `TcsCollection` models (migration 5). Populated inside payments + receipts $transactions. Two GET endpoints with list-or-aggregate views. New `buildForm16AQuarterly` + 16 tests (271 total). | `b8dfd56` |
| 2026-05-04 | **WS18 — Tally voucher import.** parseTallyXml extracts VOUCHER + ALLLEDGERENTRIES.LIST. New `importTallyVouchers`: voucher-type mapping, YYYYMMDD date parsing, FY lookup, ledger name → id resolve, signed-AMOUNT → Dr/Cr split, refuse Dr≠Cr, idempotent re-runs. +3 tests (255 total). | `3f8c4d3` |
| 2026-05-04 | **WS7 — payroll pay-month settles Salaries Payable.** New `POST /payroll/pay-month` validates period is fully PROCESSED, posts Dr Salaries Payable / Cr Bank, decrements BankAccount, moves payslips to PAID. Refuses partial-paid periods (defensive). | `34d6503` |
| 2026-05-04 | **WS10 — manufacturing WO issue + complete.** New `POST /work-orders/[id]/issue` (BOM-scaled stock decrement, ISSUE movements, Dr WIP / Cr Stock-in-Hand JV, → IN_PROGRESS; structured shortage list on 400) and `POST /work-orders/[id]/complete` (GRN finished good with weighted-avg recompute, Dr Stock-in-Hand / Cr WIP, → COMPLETED). Scrap absorbed into FG cost. Seed adds "Stock-in-Hand" + "Work in Progress" ledgers. AuditAction enum +ISSUE/+COMPLETE. | `56cb8c9` |
| 2026-05-04 | **WS7 — payroll month-end run posts to GL.** New `POST /payroll/post-month` aggregates payslips for (month, year) → single JV (Dr Salaries & Wages net of LOP / Dr Employer PF&ESI / Cr Salaries Payable / Cr PF/ESI/PT/TDS Payable). Schema: `Payslip.voucherId` + migration 4. Seed: 6 new payroll ledgers. New `buildPayrollJournal` pure aggregator + `getOrCreateNamedLedger` generic helper + 9 tests (252 total). | `90f9a11` |
| 2026-05-04 | **WS5 — TCS at receipt time + TDS YTD bug fix.** receipts POST gets optional 206C_1H/206C_1F TCS via `computeTds` (3-line voucher Dr Bank gross / Cr Party / Cr TCS Payable; bank ↑ by gross). New `getTcsPayableLedger` (shared find-or-create with `getTdsPayableLedger`). Seed adds "TCS Payable". `getFiscalYearForDate` returns `startDate` and payments POST now FY-bounds its YTD aggregate (was `gte: undefined`, all-time). 243/243 tests, 69 pages. | `789a18d` |
| 2026-05-04 | **WS5 — TDS deduction integrated into payment posting.** `tdsSection` opt-in on payments POST → 3-line voucher (Dr Vendor / Cr Bank net / Cr TDS Payable). `getTdsPayableLedger` find-or-create under "Duties & Taxes". Audit captures section/amount/rationale. | `a9d83ad` |
| 2026-05-04 | **UI — /setup/migrate Tally importer.** XML upload, per-section stats (groups / ledgers / parties / items), error lists collapsed. Build now 69 pages. | `f7e6ade` |
| 2026-05-04 | **chore:** zombie zero-byte scaffold stubs deleted again (linter keeps recreating them; -22 files). | `cd8f6c0` |
| 2026-05-04 | **UI — /banking/import.** Bank account picker, format select, CSV upload, parsed/inserted/skipped stats, reconcile button, match results table with rationale. Build now 68 pages. | `2a35931` |
| 2026-05-03 | **UI — /reports/registers page.** 3-tab page (sales / purchase / party statement). Period picker, party dropdown, KPIs, full data tables. Build now 67 pages. | `7d6445d` |
| 2026-05-03 | **UI — /taxation/gst wired to compute + portal endpoints.** Replaced static placeholder with tabs for GSTR-1/3B/9, period picker, fetch + summary + section breakdown + portal-JSON download. | `4388910` |
| 2026-05-03 | **WS2 — GSTR-9 annual return compute.** Reuses GSTR-3B across FY. Sections 4 (outward+RCM-inward, B2B/B2C/exports/CN/DN), 5 (non-payable), 6 (ITC availed + RCM split), 7 (net ITC), 9 (tax payable / paid via ITC / paid in cash, cell-wise capped). `fyFromLabel("YYYY-YY")` helper. +11 tests (243 total). | `7ad121c` |
| 2026-05-03 | **WS17 — sales/purchase register + party statement reports.** Three high-utility daily reports for Indian accountants. Pure read paths over existing data. Customer/vendor running balance, opening from pre-period docs, BOTH-typed parties combined. +11 tests (232 total). | `bcb891d` |
| 2026-05-03 | **WS10 — manufacturing module.** Schema additions: Bom + BomItem + WorkOrder (migration `3_add_manufacturing` applied to Neon). `computeBomCost` + `resolveLeafCost` (multi-level w/ cycle detection). GET/POST /manufacturing/boms + /manufacturing/work-orders. +9 tests (221 total). | `6af0767` |
| 2026-05-03 | **WS2 — GSTR-3B portal JSON converter + download endpoint.** Same shape pattern as GSTR-1: ret_period MMYYYY, sup_details (3.1), inter_sup placeholders (3.2), itc_elg with 5-row itc_avl (IMPG/IMPS/ISRC/ISD/OTH), inward_sup (5) GST/NONGST split. Serves as `GSTR3B_<gstin>_<MMYYYY>.json`. +10 tests (212 total). | `51091ea` |
| 2026-05-03 | **chore(login):** show demo creds unconditionally. (Was env-gated; revert documented inline. Re-gate when real customers onboard.) | `daa03af` |
| 2026-05-03 | **Landing page** at `/` (reactbits-style). Aurora bg, BlurText reveal, TiltedCard, Magnetic CTA. Pure CSS + pointer events (no extra deps). Logged-in users hitting `/` redirect to `/dashboard`. | `74d8399` |
| 2026-05-03 | **WS4 — e-way bill payload generator.** NIC EWB API schema v1.04: supplyType / subSupplyType / docType / from-to addresses (numeric state codes) / transport (mode/distance/vehicle/transporter). ₹50k threshold check. Vehicle normalization. EwayBillValidationError with structured details. +13 tests (202 total). | `a9df161` |
| 2026-05-03 | **WS1 — HSN/SAC library + GSTIN Mod-36 checksum.** 50+ HSN entries + 20 SAC + lookup/search helpers + public `/api/hsn-search` endpoint. `verifyGstinChecksum` catches mistyped GSTINs that pass format. +20 tests (191 total). | `047b5b4` |
| 2026-05-03 | **WS6 — bank reconciliation auto-matcher.** Layered scoring (amount + date proximity + ref-substring + party-token overlap, with ambiguity detection). Idempotent. POST endpoint. +18 tests (171 total). | `b77dfc3` |
| 2026-05-03 | **WS7 — payroll helper test coverage.** 24 tests for calculatePF / calculateESI / calculateProfessionalTax / calculateTDS / calculateLOP. +24 tests (153 total). | `6914429` |
| 2026-05-03 | **WS6 — bank statement CSV importer.** `parseStatementCsv` + `importParsedTxns` for HDFC / ICICI / SBI / Axis / generic. Idempotent dedup key on (date, debit, credit, ref, desc). POST endpoint accepts multipart up to 10 MB. +9 tests (129 total). | `b56e2ad` |
| 2026-05-03 | **WS5 — TDS/TCS computation helper.** TDS_RULES table for 194C/J/I/H/Q/O + 206C(1H)/(1F). `computeTds` with single + annual threshold logic, no-PAN penal rate, 194Q/206C "only excess over threshold" rule. +18 tests (120 total). | `0587008` |
| 2026-05-03 | **WS18 — Tally migration: masters import.** `parseTallyXml` + `importTallyData` for groups / ledgers / parties / stock items. Two-pass group resolution, idempotent, audit-logged. POST endpoint accepts multipart up to 50 MB. fast-xml-parser dep added. +7 tests (102 total). | `1b812da` |
| 2026-05-03 | **WS3 — E-invoice NIC IRN payload generator.** `buildEInvoicePayload` produces NIC schema v1.1 payload. Strict pre-flight validation with structured error `details: string[]`. GET preview/validation endpoint. +11 tests (95 total). NIC API submission separate. | `66fe987` |
| 2026-05-03 | **WS2 — GSTR-3B compute + endpoint.** `computeGstr3b` covers Section 3.1 outward classifications (taxable/zero-rated/nil-rated/RCM-inward), Section 4 ITC available + net, Section 5 exempt inward (intra/inter split). Signed CN accumulation. Decimal end-to-end. +10 tests (84 total). | `3b5aa5e` |
| 2026-05-03 | **WS2 — GSTR-1 GSTN portal JSON converter + download endpoint.** `gstr1ToPortalJson` + GET `/api/.../gst-returns/gstr1/portal?...&download=true` emits exact GSTN portal format. Serves as `GSTR1_<gstin>_<MMYYYY>.json`. +12 tests (74 total). | `9f93061` |
| 2026-05-03 | **WS2 — GSTR-1 complete sections (B2CL, CDNR/CDNUR, EXP, NIL).** Refactored `computeGstr1` with `bucketize()` dispatcher. Added all missing GSTR-1 sections. Invoice POST sets supplyType="EXPORT" for non-IN customers. +7 tests (62 total). | `95614c4` |
| 2026-05-03 | docs: Vercel deployment guide added to README. | `909a25d` |
| 2026-05-03 | **WS2 — GSTR-1 outward returns first pass.** `computeGstr1` + `summarizeGstr1` services. B2B/B2CS/HSN/DOCS aggregation from persisted breakdown. GET `/api/.../gst-returns/gstr1` endpoint. 7 unit tests. | `d2204a4` |
| 2026-05-03 | **WS1 — persist CGST/SGST/IGST breakdown.** Migration `2_add_gst_breakdown` adds placeOfSupply/supplyType/reverseCharge to invoices+bills, and cgstRate/cgstAmount/sgstRate/sgstAmount/igstRate/igstAmount/cessRate/cessAmount to invoice_items+bill_items. POST handlers populate them. Audit trail locked at write time. | `f948ce6` |
| 2026-05-03 | **WS1 (India invoicing) — place-of-supply GST split.** `india-tax.ts` helper + 19 tests. Invoice POST + Bill POST now compute correct CGST/SGST/IGST per place of supply. Foundation for GSTR-1, e-invoicing, RCM. tsc + 48/48 tests + build clean. | `dcf10b3` |
| 2026-05-03 | **PR 2 part 3 b/c/d — voucher PATCH reversal, soft delete sweep, audit log writes.** Voucher PATCH now applies/reverses ledger entries on status transitions. bills + tax-config DELETE no longer hard-delete past FK refs. `src/backend/utils/audit.ts` helper hooked into payments/receipts/vouchers POST + vouchers PATCH. **Phase 0 audit punch list 100% complete.** | `4ad25ca` |
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

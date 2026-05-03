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
| D12 | `AUTH_SECRET` rotation | Will rotate during Phase 0 work — invalidates JWTs but no real users yet. | 2026-05-03 |
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

### PR 1 — Security & tenant isolation
- [ ] `src/backend/utils/with-org-auth.ts` — wrapper helper that authenticates session, verifies `organizationUser` membership of `params.orgId`, attaches `{ session, orgUser, orgId }` to handler context. Type-safe.
- [ ] Apply `withOrgAuth` to every route under `src/app/api/organizations/[orgId]/...` (~57 routes). Delete the duplicated 15-line preambles.
- [ ] Strict Zod (`.strict()`) on every PATCH endpoint to block mass-assignment.
- [ ] Delete `src/app/api/test-session/route.ts`.
- [ ] Login page: remove demo card or gate behind `process.env.NEXT_PUBLIC_DEMO === "true"`. Seed: skip admin user when `NODE_ENV === "production"`.
- [ ] `/api/auth/register` — generic response on duplicate email (no enumeration).
- [ ] Replace `Math.random().toString(36).slice(-8)` (`users/route.ts:189`) with `crypto.randomBytes(16).toString("base64url")`.
- [ ] Permission model — switch to `permissions` JSON checks. Normalize role names to uppercase. Patch `users/route.ts` "Owner" check.
- [ ] Rotate `AUTH_SECRET` (regenerate, update `.env`, document in this file).
- [ ] Rate limiting on `/api/auth/*` — **stubbed** with a TODO until user provisions Upstash (per Q3).

### PR 2 — Accounting correctness
- [ ] All money arithmetic via `Prisma.Decimal` (or `decimal.js`). Touch: vouchers POST, invoices POST, bills POST, all reports.
- [ ] Payments POST: wrap in `prisma.$transaction` that creates payment + creates voucher (Dr Bank / Cr AR) + updates invoice `amountPaid`/`amountDue`/`status` + updates `BankAccount.currentBalance`.
- [ ] Receipts POST: same pattern, opposite direction.
- [ ] Voucher posting: update `Ledger.currentBalance` for every entry inside the same tx.
- [ ] Voucher / invoice / bill / payment / receipt numbering: Postgres sequences per `(organizationId, type)`. Migration adds the sequences.
- [ ] Bills POST: actually compute and persist `taxAmount`. Currently hardcoded to 0.
- [ ] Reports filter out `status: 'DRAFT'` vouchers (`balance-sheet/route.ts:113, 132, 162` etc.).
- [ ] Soft delete pattern: refuse delete if FK references exist; otherwise `isActive=false`. Touch: parties, ledgers, items, bank-accounts, tax-config, bills.
- [ ] Stock movement: `WHERE quantity >= x` guard + serializable tx, recompute weighted-avg on every PURCHASE.
- [ ] Audit log writes inside every mutation tx (entityType, entityId, oldData, newData, userId, orgId).
- [ ] Voucher PATCH: permission check before allowing DRAFT↔APPROVED flip; reverse old entries, post new ones.

### PR 3 — Ops basics
- [ ] `src/config/env.ts` — zod schema, parse `process.env` at boot, fail-fast.
- [ ] `prisma migrate dev --name init --create-only`; `prisma migrate resolve --applied init` against Neon; commit migrations.
- [ ] `vercel.json` build command → `prisma migrate deploy && prisma generate && next build`.
- [ ] `/api/health` endpoint — checks DB connectivity, returns version + commit SHA.
- [ ] `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/app/loading.tsx`. Per-route segments: `(dashboard)/error.tsx`, etc.
- [ ] `next.config.ts` — `headers()` for CSP, HSTS, X-Frame-Options, Referrer-Policy. `poweredByHeader: false`.
- [ ] `src/backend/utils/logger.ts` — pino with redaction. Replace `console.error` in API routes.
- [ ] DB pool: `max: 1` (or 3) per lambda in `src/backend/database/client.ts`.
- [ ] ESLint config: ignore `src/generated/**`. Fix the 9 real errors. Add `--max-warnings 0` to lint script.
- [ ] Vitest setup; smoke tests for `withOrgAuth`, payment posting, voucher numbering.
- [ ] GitHub Actions workflow: tsc, lint, test on PR.
- [ ] Prune unused deps: `jspdf`, `jspdf-autotable`, `decimal.js` (replace use-cases with Prisma.Decimal explicitly), `numeral`, `uuid`, `immer`. (Re-evaluate `decimal.js` after PR 2 — may end up using it.)
- [ ] Refresh `README.md` (replace create-next-app template) and `DEVELOPER_GUIDE.md` (paths now `@/backend/...`).
- [ ] Delete the 28 zero-byte scaffold stubs OR document them as "filled during Phase 1+". Decide.

## 8. Current state

- **Active phase:** Phase 0
- **Active sub-PR:** None yet — about to start PR 1
- **Last updated:** 2026-05-03 by Claude (commit ` <to-fill-on-commit> `)
- **What's done since last session:**
  - Restructured `src/` into `backend/`, `frontend/`, `shared/`, `config/` (commit `a734b34`)
  - Schema pushed to Neon, seeded
  - Production build passes (`npm run build` → 66 pages, 0 errors)
  - Four-agent audit completed; findings logged in §6 above
  - This `update.md` file created
- **What's next (exact):**
  1. Create `src/backend/utils/with-org-auth.ts` — type-safe wrapper for `(req, ctx) => Response` handlers.
  2. Apply to one representative route (e.g. `items/[itemId]/route.ts`) as a proof-of-concept.
  3. Confirm with user before bulk-applying to ~57 routes.

## 9. Completed log (reverse chronological)

| Date | What | Commit |
|---|---|---|
| 2026-05-03 | Created `update.md`; saved memory pointer | `<pending>` |
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

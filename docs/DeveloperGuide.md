---
title: "AccuBook Developer's Guide"
subtitle: "Architecture, Data Model, APIs, Operations"
author: "AccuBook"
date: "2026-05-06"
---

# 1. Project at a glance

**AccuBook** is a multi-tenant accounting / ERP web application targeting Indian small- and medium-sized businesses. The codebase is a single Next.js 16 application that ships frontend + backend out of the same deployment. PostgreSQL (hosted on Neon) is the only datastore. A Vercel build pipeline applies Prisma migrations on every deploy and produces a single artifact.

- **Repo:** `git@github.com:Tatu1984/accubook.git` (branch `main`).
- **Production:** `accubook.tensparrows.com`, `accubook.infinititechpartners.com`, `accubook-tau.vercel.app` (Vercel project `accubook` / id `prj_i8R9Qgxi00IgC84LMtKcOA2SuG6v`, team `team_JLez4p6WrUVtodxcbh9MzJse`).
- **Database:** Neon Postgres (pooler hostname `ep-crimson-glade-a4jvhp02-pooler.us-east-1.aws.neon.tech`).
- **Build command (Vercel):** `prisma migrate deploy && prisma generate && next build` — set in `vercel.json`.

The product is feature-rich (98 API routes, 71 UI pages, 71 Prisma models, 11 migrations applied, 75 build pages on production). This guide is the reference — read it linearly the first time, then dip into specific sections later.

# 2. Tech stack & versions

| Layer | Technology | Version (from `package.json`) |
|---|---|---|
| Framework | Next.js (App Router) | `16.0.8` (Turbopack bundler) |
| UI runtime | React | `19.2.1` |
| Language | TypeScript | `^5` (strict) |
| Bundler | Turbopack | bundled with Next 16 |
| ORM | Prisma | `^7.1.0` |
| DB driver | `pg` + `@prisma/adapter-pg` | `^8.16.3` / `^7.1.0` |
| Database | PostgreSQL | 16+ (Neon pooler) |
| Auth | NextAuth.js | `^5.0.0-beta.30` (Credentials provider, JWT strategy) |
| UI primitives | Radix UI | `@radix-ui/react-*` mid-1.x / 2.x |
| Styling | TailwindCSS | `^4` |
| State | Zustand | `^5.0.9` |
| Server cache | TanStack Query | `^5.90.12` |
| Tables | TanStack Table | `^8.21.3` |
| Charts | Recharts | `^2.15.4` |
| Forms | React Hook Form + Zod | `^7.68.0` / `^4.1.13` |
| Hashing | bcryptjs | `^3.0.3` |
| XML parser | fast-xml-parser | `^5.7.2` |
| Sheet IO | xlsx | `^0.18.5` |
| QR codes | qrcode | `^1.5.4` |
| Barcodes | bwip-js | `^4.8.0` |
| Logging | pino | `^10.3.1` (with redaction) |
| Toasts | sonner | `^2.0.7` |
| Tests | Vitest + v8 coverage | `^4.1.5` |
| Linter | ESLint 9 | `^9` |
| Node | Node | 20+ (24 in Vercel) |

# 3. Prerequisites

- **Node.js 20+** (Vercel uses 24).
- **npm** 10+.
- A **Neon** Postgres project (or any Postgres 14+ instance reachable over TLS).
- An **`AUTH_SECRET`** — generate via `openssl rand -base64 32`.

Optional but useful: pandoc 3+ (for regenerating these `.docx` docs), Prisma Studio access to inspect the DB graphically.

# 4. Quick start (local dev)

```bash
git clone git@github.com:Tatu1984/accubook.git
cd accubook
npm install

cp .env.example .env
# edit .env — fill DATABASE_URL and AUTH_SECRET at minimum

npx prisma generate            # generate Prisma client into src/generated/prisma
npx prisma migrate deploy      # apply all migrations on a fresh DB
                               # (use `prisma db push` for ad-hoc schema work
                               #  before committing a migration)
npm run db:seed                # creates demo admin + Demo Corporation org
npm run dev                    # http://localhost:3000
```

Demo login (when seed has run):

- email: `admin@accubook.com`
- password: `password123!`

# 5. Repository layout

```
accubook/
├── prisma/
│   ├── schema.prisma            # 71 models, 1700+ lines (authoritative data model)
│   ├── seed.ts                  # idempotent seed: currencies, roles, units, voucher types,
│   │                            # leave types, admin user, demo org/branch, fiscal year,
│   │                            # ledger groups, default ledgers, departments, designations,
│   │                            # tax configs, item categories, sample parties, sample items
│   └── migrations/              # 11 migrations:
│       ├── 0_init/
│       ├── 1_add_number_counters/
│       ├── 2_add_gst_breakdown/
│       ├── 3_add_manufacturing/
│       ├── 4_add_payslip_voucher_link/
│       ├── 5_add_tds_tcs_persistence/
│       ├── 6_add_composition_scheme/
│       ├── 7_add_recurring_invoices/
│       ├── 8_bill_to_gl_posting/
│       ├── 9_approval_org_scope/
│       └── 10_payment_receipt_voucher_fk/
│
├── src/
│   ├── app/                     # Next.js App Router (single deployment surface)
│   │   ├── (auth)/              # /login, /register, /forgot-password
│   │   ├── (dashboard)/         # protected app — every route under this group
│   │   │                        # is guarded by middleware.ts auth check
│   │   ├── api/                 # 98 route.ts files (REST handlers)
│   │   ├── error.tsx            # error boundary
│   │   ├── global-error.tsx     # global error fallback
│   │   ├── layout.tsx           # root layout (renders <Providers>)
│   │   ├── loading.tsx          # root loading shell
│   │   ├── not-found.tsx        # 404
│   │   └── page.tsx             # landing page (marketing)
│   │
│   ├── backend/
│   │   ├── database/client.ts   # Prisma client singleton (PrismaPg adapter, pool max=3)
│   │   ├── services/            # domain services — heavy lifting goes here
│   │   │   ├── approvals/       # routing + auto-promotion of approved entities
│   │   │   ├── auth.service.ts  # NextAuth v5 config (Credentials, JWT, 30d session)
│   │   │   ├── banking/         # statement-import + reconciliation matcher
│   │   │   ├── billing/         # bill→GL posting + recurring-invoice helpers
│   │   │   ├── email/send.ts    # Resend-backed sendEmail with no-op fallback
│   │   │   ├── gst/             # GSTR-1 / 3B / 9 / 2B / CMP-08 + portal JSON converters
│   │   │   ├── india/           # HSN/SAC library
│   │   │   ├── manufacturing/   # multi-level BOM cost compute
│   │   │   ├── migration/       # Tally XML importer
│   │   │   ├── notifications/   # check-overdue cron logic
│   │   │   ├── payroll/         # post-month aggregator
│   │   │   ├── reports/         # registers + party-statement
│   │   │   └── tax/             # TDS/TCS computation, Form 16A, monthly challan
│   │   └── utils/
│   │       ├── audit.ts         # writeAudit(tx, opts) — single-source audit logger
│   │       ├── cron-auth.ts     # CRON_SECRET header validation for /api/cron/*
│   │       ├── india-tax.ts     # place-of-supply → GST-split decision helper + 19 tests
│   │       ├── logger.ts        # pino with redaction
│   │       ├── money.ts         # Decimal helpers (D, sum, mul, cmp, closeEnough)
│   │       ├── payroll-calculations.util.ts  # PF/ESI/PT/TDS/LOP pure helpers
│   │       ├── permissions.ts   # hasPermission(orgUser, module, action) + 10 tests
│   │       ├── posting.ts       # nextNumber, generateVoucherNumber, getOrCreate*Ledger,
│   │       │                    # applyLedgerEntries, recomputeInvoiceStatus,
│   │       │                    # recomputeBillStatus, getFiscalYearForDate
│   │       └── with-org-auth.ts # the multi-tenant auth wrapper for every API route
│   │
│   ├── frontend/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn-generated Radix primitives (button, card,
│   │   │   │                    # dialog, dropdown-menu, alert-dialog, sidebar, tabs,
│   │   │   │                    # data-table, skeleton, sonner, ...)
│   │   │   ├── layout/          # AppSidebar, Header
│   │   │   ├── features/transactions/   # CreateQuotationDialog,
│   │   │   │                            # CreateSalesOrderDialog,
│   │   │   │                            # CreatePurchaseOrderDialog,
│   │   │   │                            # RecordReceiptDialog,
│   │   │   │                            # RecordPaymentDialog
│   │   │   └── providers.tsx    # NextAuth SessionProvider + TanStack Query +
│   │   │                        # TooltipProvider + Toaster
│   │   ├── hooks/
│   │   │   ├── use-organization.ts    # useOrganization() and useApi()
│   │   │   └── use-mobile.ts          # mobile breakpoint sniffer
│   │   └── utils/
│   │       └── export-csv.ts    # client-side rowsToCsv + downloadCsv
│   │
│   ├── shared/
│   │   ├── types/
│   │   │   ├── index.ts
│   │   │   └── next-auth.d.ts   # session.user augmentation (organizationId, role,
│   │   │                        # permissions)
│   │   └── utils/
│   │       ├── common.util.ts   # shadcn `cn()` (tailwind-merge wrapper)
│   │       └── dates.util.ts
│   │
│   ├── config/env.ts            # zod schema for process.env (single source of truth);
│   │                            # bad config throws on import
│   │
│   ├── generated/prisma/        # Prisma client output (gitignored)
│   │
│   └── middleware.ts            # auth gate + host guard (runs on every non-static
│                                # request; lives in src/ not project root because
│                                # we use src/app/)
│
├── tests/
│   ├── unit/                    # (mostly empty — unit tests live next to source)
│   ├── integration/             # (placeholder — Vitest + real Postgres planned)
│   └── e2e/                     # (placeholder)
│
├── docs/
│   ├── RUNBOOK.md               # ops runbook for outages
│   ├── UserManual.md / .docx    # this guide's sibling
│   └── DeveloperGuide.md / .docx
│
├── public/                      # static assets (favicon, og-image, etc.)
├── scripts/                     # one-shot operational scripts
├── update.md                    # durable cross-session plan (read this first when
│                                # context-switching back into the codebase)
├── security.md                  # local-only domain-binding design (NEVER commit;
│                                # excluded via .git/info/exclude)
├── README.md                    # short onboarding doc
├── DEVELOPER_GUIDE.md           # legacy dev guide (this .docx supersedes it)
├── package.json
├── prisma.config.ts             # tells Prisma where schema lives + DATABASE_URL guard
├── next.config.ts               # security headers + serverExternalPackages for pino
├── middleware.ts                # ⛔ historical (now lives at src/middleware.ts)
├── tsconfig.json                # path aliases: @/*, @/backend/*, @/frontend/*,
│                                # @/shared/*, @/config/*
├── eslint.config.mjs
├── postcss.config.mjs
├── components.json              # shadcn config (aliases point at @/frontend/components)
├── vercel.json                  # buildCommand sets `prisma migrate deploy` first
└── vitest.config.ts
```

## Path aliases

In `tsconfig.json`:

```jsonc
{
  "@/*":          ["./src/*"],
  "@/backend/*":  ["./src/backend/*"],
  "@/frontend/*": ["./src/frontend/*"],
  "@/shared/*":   ["./src/shared/*"],
  "@/config/*":   ["./src/config/*"]
}
```

Use `@/backend/...` over `../../backend/...` everywhere.

# 6. Environment variables

Validated at boot via `src/config/env.ts` (zod). Bad config kills the process with a clear error.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooler URL: `postgresql://USER:PASSWORD@HOST/DB?sslmode=require&channel_binding=require` |
| `AUTH_SECRET` | yes | ≥32 chars. `openssl rand -base64 32` |
| `NEXTAUTH_SECRET` | yes | Same value as `AUTH_SECRET`; NextAuth v5 reads both during the migration window. |
| `NEXTAUTH_URL` | prod only | The app's external base URL. Set it on Vercel after the first deploy. |
| `AUTH_TRUST_HOST` | Vercel | `"true"` so NextAuth trusts the `X-Forwarded-Host` header. |
| `NODE_ENV` | implicit | `development` / `test` / `production`. |
| `ALLOW_PROD_SEED` | optional | `"true"` to override the seed's prod refusal. |
| `NEXT_PUBLIC_DEMO` | optional | `"true"` to render the demo-credentials card on `/login`. |
| `RESEND_API_KEY` | optional | Resend API key for outbound email. |
| `EMAIL_FROM` | optional | The "From:" address (e.g. `noreply@yourdomain.example`). |
| `APP_URL` | optional | Public app URL used to build deep-links in emails. Falls back to `NEXTAUTH_URL`. |
| `CRON_SECRET` | optional | Bearer token expected on cron endpoints (`/api/cron/*`). Without it those routes 403. |

**Never commit `.env`.** It is gitignored. Add a `.env.example` row when you introduce a new variable.

# 7. Architecture

## 7.1 Single deployment, folder-level split

There is one Next.js application — frontend pages, server components, route handlers, edge middleware all build into one artifact and deploy together. The "backend" and "frontend" you read about in the folder layout are conventions, not separate processes:

- Anything under `src/app/api/...` is a server-only route handler.
- Anything under `src/backend/...` is server-only domain logic, importable from route handlers but never from a client component.
- Anything under `src/frontend/...` is a React component or hook that runs in the browser.
- Anything under `src/shared/...` is plain TS that runs on both sides (no Node-only or DOM-only APIs).

This split is enforced by convention, not by the bundler. `import` paths make the boundary obvious; reviewers reject server modules being pulled into client components.

## 7.2 Routing model

- **Public:** `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`.
- **Protected:** everything under `(dashboard)/`. Guarded by `src/middleware.ts`.
- **API:** `src/app/api/...` — handlers grouped by resource. Org-scoped resources live under `/api/organizations/[orgId]/...` and are wrapped with `withOrgAuth`.
- **Public API:** `/api/auth/*`, `/api/health`, `/api/hsn-search`. Whitelisted in middleware.
- **Cron API:** `/api/cron/*` — bearer-protected via `cron-auth.ts`. Used by Vercel Cron and external schedulers.

## 7.3 Multi-tenant model

Two key tables: **`Organization`** (a tenant) and **`OrganizationUser`** (a user's link into a tenant with a role). A `User` belongs to many orgs through `OrganizationUser`; `Organization` owns every tenant-scoped row downstream (Invoice, Bill, Voucher, Party, Item, …).

Every org-scoped API route looks like:

```ts
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";

export const GET = withOrgAuth(async (request, { orgId, userId }) => {
  // orgId is verified to belong to the caller; userId is the session user.
  // Cross-tenant access is structurally impossible inside this handler.
});
```

`withOrgAuth`:

1. Reads the NextAuth session.
2. Confirms the URL's `[orgId]` matches an active `OrganizationUser` for that user.
3. Injects `{ orgId, userId, params, request }` into the handler.
4. Throws 401 on no session, 403 on cross-tenant attempts, 404 on no org match.

Sensitive actions (workflow create / delete, GSTR-2B reconcile, recurring spawn, settings PATCH) additionally check `hasPermission(orgUser, module, action)` against the role's permissions JSON.

## 7.4 Auth flow

NextAuth v5 with the **Credentials** provider and **JWT** sessions (no DB session table).

1. `/login` POSTs email + password to `/api/auth/callback/credentials`.
2. The `authorize` callback in `src/backend/services/auth.service.ts` looks up the user by email, verifies the bcrypt hash, checks active flag and lockedUntil, increments `failedLoginAttempts` on failure (locks for 30 minutes after 5 fails), and returns a user object including `organizationId`, `organizationName`, `branchId`, `branchName`, `role`, and `permissions`.
3. NextAuth issues a 30-day JWT and sets a `authjs.session-token` cookie.
4. `src/middleware.ts` reads that cookie on every request to gate non-public routes.
5. `useSession()` (client) or `auth()` (server component) returns `{ user: { id, organizationId, role, permissions, ... } }`.

Session updates (e.g. switching branch) call `update()` from `next-auth/react`, which re-runs the `jwt` callback's `trigger === "update"` branch.

## 7.5 Decimal money math

Money never touches a JS float. Every monetary value is `Prisma.Decimal` end-to-end. The helpers live in `src/backend/utils/money.ts`:

- `D(value)` — coerce a string / number / Decimal into a Decimal.
- `sum(arr)` — Decimal-safe sum.
- `mul(a, b)` — Decimal multiplication.
- `cmp(a, b)` — Decimal comparison, returns -1 / 0 / 1.
- `closeEnough(a, b, eps)` — tolerance-based equality (default ₹1).

Tests in `utils/__tests__/money.test.ts` validate the helpers against edge cases (carrying decimals, rounding, signed zero).

## 7.6 Posting to the GL

`src/backend/utils/posting.ts` is the canonical posting layer. Every monetary mutation that hits the GL passes through it:

- `nextNumber(tx, orgId, scope)` — atomic counter increment for race-safe document numbers (`scope` is e.g. `"INVOICE:2026-27"` so each FY resets).
- `getOrCreatePartyLedger(tx, orgId, partyId)` — find-or-create the Party's sundry-debtor / creditor ledger.
- `getOrCreateBankLedger(tx, orgId, bankAccountId)` — find-or-create a Bank-specific ledger under "Bank Accounts" group.
- `getOrCreateNamedLedger(tx, orgId, name, group)` — generic find-or-create by name (used for TDS Payable, TCS Payable, WIP, etc.).
- `getCashLedger`, `getTdsPayableLedger`, `getTcsPayableLedger` — convenience wrappers.
- `getFiscalYearForDate(tx, orgId, date)` — returns `{ id, label, startDate, endDate }`.
- `applyLedgerEntries(tx, voucherId, entries)` — for each entry, increment/decrement `Ledger.currentBalance` (and BankAccount.currentBalance if linked) atomically.
- `recomputeInvoiceStatus(tx, invoiceId)` and `recomputeBillStatus(tx, billId)` — re-derive status from amount paid vs total.

Every posting site wraps its work in `prisma.$transaction(async (tx) => { ... })` and writes an audit row inside the same transaction (see `writeAudit`). A failed mutation rolls the audit back too.

## 7.7 Approval workflows

`src/backend/services/approvals/route-entity.ts` and `promote-entity.ts`.

- When a **Voucher**, **Bill**, **ExpenseClaim**, or **Leave** is submitted in `PENDING` / `PENDING_APPROVAL` state, `routeEntityForApproval` looks up the matching `ApprovalWorkflow` (filtered by entity type and amount limit) and creates `Approval` rows for each step.
- Step approver types: `USER` (specific user), `ROLE` (any user with that role), `MANAGER` (the submitter's `Employee.reportingTo` user).
- The `/approvals` page reads pending Approvals; on Approve / Reject, the API updates the row and calls `maybePromoteEntity`.
- `maybePromoteEntity` checks if all required Approvals at the current step are decided. If all-APPROVED → promote (voucher posts to GL via `applyLedgerEntries`, bill becomes APPROVED via `postBillToGl`, expense claim posts, leave is granted with balance decrement). Any-REJECTED → demote (voucher REJECTED, bill back to DRAFT).
- Sibling approvals at the same step auto-CANCEL when one role-holder decides (so the others don't keep showing the item).

## 7.8 Permission model

`src/backend/utils/permissions.ts`:

```ts
export function hasPermission(
  orgUser: { role: { permissions: unknown } | null },
  module: string,
  action: string
): boolean
```

- `permissions` is JSON: an array of `{ module, actions[] }` triples. Wildcards are supported: `module: "*"` matches anything, `actions: ["*"]` matches every action.
- The seeded ADMIN role has `[{ module: "*", actions: ["create","read","update","delete","approve","export"] }]` — full access.
- `last-admin guard`: `users.PATCH` refuses to deactivate or demote the last active ADMIN of an org.

## 7.9 Email & notifications

- `src/backend/services/email/send.ts` — `sendEmail({ to, subject, html })`. Resend-backed when `RESEND_API_KEY` + `EMAIL_FROM` are set; logs at info level otherwise (no-op).
- Approval-request emails fire **post-tx** in vouchers / bills POST.
- In-app notifications live in the `Notification` table. The `/notifications` API supports list, markRead, markAllRead, delete.
- `check-overdue.ts` (`/api/.../notifications/check-overdue` and `/api/cron/check-overdue`) sweeps for overdue invoices / bills / low-stock items and creates Notification rows for the owner + role recipients.

## 7.10 Logger & redaction

`src/backend/utils/logger.ts`. pino with redaction list:

```
password, token, authorization, cookie, AUTH_SECRET, DATABASE_URL,
NEXTAUTH_SECRET, RESEND_API_KEY, CRON_SECRET, passwordHash
```

Use `logger.error({ err: error }, "msg")` instead of `console.error`. The 60+ API files all use the logger consistently.

## 7.11 Audit log

Every CREATE / UPDATE / DELETE / POST / REVERSE / ISSUE / COMPLETE / EXPORT / LOGIN / LOGOUT writes a row in `AuditLog`. `writeAudit(tx, opts)` is called inside the same `$transaction` as the underlying mutation so failed mutations don't leave orphan audit rows.

```ts
await writeAudit(tx, {
  organizationId: orgId,
  userId,
  action: "CREATE",
  entityType: "Invoice",
  entityId: created.id,
  oldData: undefined,
  newData: { invoiceNumber, totalAmount },
});
```

# 8. Database

## 8.1 Schema overview

Authoritative source: `prisma/schema.prisma` (1700+ lines, 71 models). Models are organized into the following functional groups:

### Tenancy / Identity
- `Organization` — the tenant root.
- `Branch` — sub-locations within an organization.
- `User` — login identity (one per email).
- `OrganizationUser` — joins user → org with role + isActive.
- `Role` — role definitions (ADMIN, ACCOUNTANT, MANAGER, VIEWER, custom). Holds the `permissions` JSON.
- `Session`, `Account`, `VerificationToken` — NextAuth tables (we use JWT sessions but keep the schema for compatibility).

### General Ledger
- `LedgerGroup` — hierarchical (parentId) groups. `nature` ∈ ASSETS / LIABILITIES / INCOME / EXPENSES / EQUITY. `isSystem` flag marks seeded protected groups.
- `Ledger` — leaf accounts.
- `Voucher` — header (date, type, number, narration, status, totalDebit, totalCredit).
- `VoucherEntry` — Dr/Cr lines.
- `VoucherType` — Receipt / Payment / Journal / Sales / Purchase / Contra / Debit Note / Credit Note / Stock Journal / Manufacturing Journal / Reversing Journal.
- `NumberCounter` — race-safe atomic counter (FK to org + scope) used by `nextNumber`.

### Sales
- `Quotation` + `QuotationItem`.
- `SalesOrder` + `SalesOrderItem`.
- `Invoice` + `InvoiceItem` + `InvoiceTax` + `InvoicePayment`.
- `Receipt` — money in, optionally linked to an invoice.
- `RecurringInvoice` — template that spawns invoices on a schedule.

### Purchases
- `PurchaseOrder` + `PurchaseOrderItem`.
- `Bill` + `BillItem` + `BillTax` (mirror of Invoice).
- `Payment` — money out, optionally linked to a bill.

### Inventory & Manufacturing
- `Item` — catalogue.
- `ItemCategory`.
- `UnitOfMeasure`, `ItemUnit`.
- `Warehouse`.
- `Stock` — per (item, warehouse) on-hand + weighted avg.
- `StockMovement` — append-only log.
- `Batch` — batch / lot tracking.
- `Bom` + `BomItem` — recipe.
- `WorkOrder` — manufacturing instruction.

### Banking
- `BankAccount` — name, IFSC, account number, current balance.
- `BankTransaction` — append-only.
- `BankReconciliation` — reconciliation runs.

### Tax
- `TaxConfig` — rate definitions (CGST/SGST/IGST/CESS).
- `GSTReturn` — header for filed GST returns (GSTR-1, 3B, 9, etc.).
- `TdsDeduction` — every TDS booking with section, payment / bill link, amount.
- `TcsCollection` — every TCS booking.

### HR / Payroll
- `Employee` — full HR record.
- `Department`, `Designation`.
- `Attendance` — day-wise.
- `LeaveType`, `Leave` — leave master + applications.
- `PayrollStructure` — salary structure template.
- `Payslip` — per-month per-employee.
- `ExpenseClaim`.

### Reports & Misc
- `Project`, `CostCenter` — analytical dimensions.
- `Budget` + `BudgetLine` — month × ledger plan.
- `FiscalYear` + `FiscalPeriod`.
- `Currency` + `ExchangeRate`.
- `Account` — chart-of-accounts code (separate from Ledger; for some legacy paths).
- `ReportTemplate` — saved custom report definitions.
- `Notification`, `AuditLog`.
- `Approval`, `ApprovalWorkflow`, `ApprovalWorkflowStep`.

### Full model list (alphabetical, 71 models)

```
Account, Approval, ApprovalWorkflow, ApprovalWorkflowStep, Attendance,
AuditLog, BankAccount, BankReconciliation, BankTransaction, Batch, Bill,
BillItem, BillTax, Bom, BomItem, Branch, Budget, BudgetLine, CostCenter,
Currency, Department, Designation, Employee, ExchangeRate, ExpenseClaim,
FiscalPeriod, FiscalYear, GSTReturn, Invoice, InvoiceItem, InvoicePayment,
InvoiceTax, Item, ItemCategory, ItemUnit, Leave, LeaveType, Ledger,
LedgerGroup, Notification, NumberCounter, Organization, OrganizationUser,
Party, Payment, PayrollStructure, Payslip, Project, PurchaseOrder,
PurchaseOrderItem, Quotation, QuotationItem, Receipt, RecurringInvoice,
ReportTemplate, Role, SalesOrder, SalesOrderItem, Session, Stock,
StockMovement, TaxConfig, TcsCollection, TdsDeduction, UnitOfMeasure, User,
VerificationToken, Voucher, VoucherEntry, VoucherType, Warehouse, WorkOrder
```

## 8.2 Migrations

All schema evolution flows through Prisma migrations under `prisma/migrations/`:

| Migration | Purpose |
|---|---|
| `0_init` | Baseline migration captured from the live Neon DB before migrations existed. |
| `1_add_number_counters` | `NumberCounter` table for race-safe FY-scoped counters. |
| `2_add_gst_breakdown` | `placeOfSupply / supplyType / reverseCharge` on Invoice + Bill; per-line `cgstRate / cgstAmount / sgst* / igst* / cessRate / cessAmount` on items. |
| `3_add_manufacturing` | `Bom`, `BomItem`, `WorkOrder` + indexes. |
| `4_add_payslip_voucher_link` | `Payslip.voucherId` for payroll-run posting. |
| `5_add_tds_tcs_persistence` | `TdsDeduction`, `TcsCollection` tables. |
| `6_add_composition_scheme` | `Organization.compositionScheme` + `compositionRate`. |
| `7_add_recurring_invoices` | `RecurringInvoice` table. |
| `8_bill_to_gl_posting` | `Bill.voucherId`, `Bill.tdsSection`, `TdsDeduction.billId`. |
| `9_approval_org_scope` | `Approval.organizationId` (cross-tenant fix). |
| `10_payment_receipt_voucher_fk` | Adds FK from Payment / Receipt to Voucher. |

**Rules:**

- **Never** edit an applied migration. Add a new one instead.
- **Never** add `prisma db push` to deploy. Migrations only.
- A new schema change is shipped via:
  ```bash
  npx prisma migrate dev --name <descriptive_name>
  # commit prisma/schema.prisma + prisma/migrations/<n>_<name>/migration.sql
  ```
- The Vercel buildCommand runs `prisma migrate deploy` before `next build`. Production DB stays in sync automatically.
- The `_prisma_migrations` table on Neon tracks what's applied; a redeploy is a no-op if no new migrations.

## 8.3 Seed

`prisma/seed.ts` is **idempotent** — safe to re-run. It:

1. Creates currencies (INR, USD, EUR, GBP, …).
2. Creates roles (ADMIN, ACCOUNTANT, MANAGER, VIEWER) with permissions JSON.
3. Creates units of measure (PCS, KG, GM, MTR, LTR, BOX, …).
4. Creates voucher types (Receipt, Payment, Journal, Sales, Purchase, Contra, etc.).
5. Creates leave types (Casual, Sick, Earned, …).
6. Upserts the **admin user** (`admin@accubook.com`, `password123!`, bcrypt hash). Re-hashes on every run so the documented password always works post-rotation.
7. Creates **Demo Corporation** organization with branch "Head Office".
8. Links admin to the org as ADMIN.
9. Creates fiscal year (current FY).
10. Creates ledger groups (Assets, Liabilities, Income, Expenses, Equity, then sub-groups: Sundry Debtors, Sundry Creditors, Bank Accounts, Cash in Hand, Duties & Taxes, Stock-in-Hand, Work in Progress, Salaries, …).
11. Creates default ledgers (Cash in Hand, Sales, Purchase, etc.).
12. Creates default warehouse, departments, designations.
13. Creates tax configs (GST 5/12/18/28%, Composition 1%, etc.).
14. Creates item categories.
15. Creates sample parties + sample items.

```bash
npm run db:seed   # equivalent to: npx tsx prisma/seed.ts
```

The seed refuses to run when `NODE_ENV=production` unless `ALLOW_PROD_SEED=true`.

# 9. API routes

98 `route.ts` files live under `src/app/api/`. The list below is the full inventory grouped by area.

## 9.1 Public

- `POST /api/auth/[...nextauth]` — NextAuth handler (login, callback, signOut, csrf, session).
- `POST /api/auth/register` — public registration (gated; rejects if signups are disabled at deploy).
- `GET  /api/health` — liveness + DB ping + migration drift check. **Public** (whitelisted in middleware).
- `GET  /api/hsn-search` — HSN/SAC lookup. **Public** (used pre-login on quoting flows).
- `GET  /api/currencies` — global currency master.
- `GET  /api/units` — global units-of-measure master.
- `GET  /api/cron/check-overdue` — cron-scheduled sweep, bearer-protected via `CRON_SECRET`.

## 9.2 Org master + setup

- `GET    /api/organizations` — list orgs the caller belongs to.
- `POST   /api/organizations` — create a new org (and link the caller as ADMIN).
- `GET    /api/organizations/[orgId]` — org details.
- `PATCH  /api/organizations/[orgId]` — update org (zod-strict, audit-logged).
- `GET    /api/organizations/[orgId]/branches` / `POST` / `[branchId]` (`PATCH` / `DELETE`).
- `GET    /api/organizations/[orgId]/fiscal-years` / `POST`.
- `GET    /api/organizations/[orgId]/users` / `POST` / `PATCH` / `DELETE` (with last-admin guard).
- `GET    /api/organizations/[orgId]/roles` / `POST` / `PATCH` / `DELETE`.
- `GET    /api/organizations/[orgId]/audit-logs` — paginated, filtered.

## 9.3 Accounting

- `GET/POST /api/organizations/[orgId]/ledger-groups`
- `PATCH/DELETE /api/organizations/[orgId]/ledger-groups/[groupId]` — system-group + non-empty guards.
- `GET/POST /api/organizations/[orgId]/ledgers`
- `GET/PATCH/DELETE /api/organizations/[orgId]/ledgers/[ledgerId]`
- `GET/POST /api/organizations/[orgId]/vouchers`
- `GET/PATCH/DELETE /api/organizations/[orgId]/vouchers/[voucherId]` — PATCH applies / reverses ledger entries on status transitions.
- `GET/POST /api/organizations/[orgId]/voucher-types`
- `GET/POST /api/organizations/[orgId]/cost-centers`
- `GET/POST /api/organizations/[orgId]/projects`
- `GET/POST/PATCH/DELETE /api/organizations/[orgId]/budgets`

## 9.4 Sales

- `GET/POST /api/organizations/[orgId]/quotations`
- `GET/POST /api/organizations/[orgId]/sales-orders` / `[orderId]`
- `GET/POST /api/organizations/[orgId]/invoices`
- `GET /api/organizations/[orgId]/invoices/[invoiceId]` — invoice detail with party + items + receipts.
- `POST /api/organizations/[orgId]/invoices/[invoiceId]/duplicate` — clone to fresh DRAFT.
- `POST /api/organizations/[orgId]/invoices/[invoiceId]/send-reminder` — log notification + audit.
- `GET  /api/organizations/[orgId]/invoices/[invoiceId]/einvoice-payload` — NIC e-invoice payload (validation included).
- `GET  /api/organizations/[orgId]/invoices/[invoiceId]/eway-bill-payload` — NIC e-way bill payload.
- `POST /api/organizations/[orgId]/invoices/[invoiceId]/e-invoice` — submit-to-NIC stub (real call is the integration step).
- `GET/POST /api/organizations/[orgId]/recurring-invoices`
- `POST /api/organizations/[orgId]/recurring-invoices/run` — cron-friendly tick.
- `GET/POST /api/organizations/[orgId]/receipts`
- `GET/PATCH/DELETE /api/organizations/[orgId]/receipts/[receiptId]`

## 9.5 Purchases

- `GET/POST /api/organizations/[orgId]/purchase-orders`
- `GET/POST /api/organizations/[orgId]/bills`
- `GET/PATCH/DELETE /api/organizations/[orgId]/bills/[billId]`
- `GET/POST /api/organizations/[orgId]/payments`
- `GET/PATCH/DELETE /api/organizations/[orgId]/payments/[paymentId]`
- `GET /api/organizations/[orgId]/tds-deductions`
- `GET /api/organizations/[orgId]/tcs-collections`

## 9.6 Inventory & Manufacturing

- `GET/POST /api/organizations/[orgId]/items` / `[itemId]`
- `GET/POST /api/organizations/[orgId]/item-categories` / `[categoryId]`
- `GET/POST /api/organizations/[orgId]/warehouses` / `[warehouseId]`
- `GET /api/organizations/[orgId]/stock`
- `GET/POST /api/organizations/[orgId]/inventory/batches`
- `GET /api/organizations/[orgId]/barcode` — barcode rendering helper (bwip-js).
- `GET/POST /api/organizations/[orgId]/manufacturing/boms`
- `GET/POST /api/organizations/[orgId]/manufacturing/work-orders`
- `POST /api/organizations/[orgId]/manufacturing/work-orders/[workOrderId]/issue`
- `POST /api/organizations/[orgId]/manufacturing/work-orders/[workOrderId]/complete`

## 9.7 Banking

- `GET/POST /api/organizations/[orgId]/bank-accounts`
- `POST /api/organizations/[orgId]/banking/import-statement` — multipart up to 10 MB; HDFC / ICICI / SBI / Axis / GENERIC.
- `POST /api/organizations/[orgId]/banking/reconcile`
- `POST /api/organizations/[orgId]/bank-reconciliation` — runs / persists.

## 9.8 Tax

- `GET/POST /api/organizations/[orgId]/tax-config`
- `GET /api/organizations/[orgId]/gst-returns` — list filed GSTR-* records.
- `GET /api/organizations/[orgId]/gst-returns/compute` — compute switch.
- `GET /api/organizations/[orgId]/gst-returns/gstr1` — period
- `GET /api/organizations/[orgId]/gst-returns/gstr1/portal` — portal JSON (download via `?download=true`).
- `GET /api/organizations/[orgId]/gst-returns/gstr3b`
- `GET /api/organizations/[orgId]/gst-returns/gstr3b/portal`
- `GET /api/organizations/[orgId]/gst-returns/gstr9`
- `GET /api/organizations/[orgId]/gst-returns/gstr9/portal`
- `GET /api/organizations/[orgId]/gst-returns/cmp08`
- `POST /api/organizations/[orgId]/gst-returns/gstr2b/reconcile` — bucket classification.
- `GET /api/organizations/[orgId]/tax-config`

## 9.9 HR / Payroll

- `GET/POST /api/organizations/[orgId]/employees`
- `GET/POST /api/organizations/[orgId]/attendance`
- `GET/POST /api/organizations/[orgId]/leaves`
- `GET/POST /api/organizations/[orgId]/expense-claims`
- `GET/POST /api/organizations/[orgId]/payroll`
- `POST /api/organizations/[orgId]/payroll/calculate`
- `POST /api/organizations/[orgId]/payroll/post-month`
- `POST /api/organizations/[orgId]/payroll/pay-month`

## 9.10 Reports

- `GET /api/organizations/[orgId]/reports/profit-loss`
- `GET /api/organizations/[orgId]/reports/balance-sheet`
- `GET /api/organizations/[orgId]/reports/cash-flow`
- `GET /api/organizations/[orgId]/reports/trial-balance`
- `GET /api/organizations/[orgId]/reports/sales-register`
- `GET /api/organizations/[orgId]/reports/purchase-register`
- `GET /api/organizations/[orgId]/reports/party-statement`
- `GET /api/organizations/[orgId]/reports/aging`
- `GET /api/organizations/[orgId]/reports/export`
- `GET /api/organizations/[orgId]/dashboard` — aggregator behind `/dashboard` page.

## 9.11 Approvals & misc

- `GET/POST/PATCH /api/organizations/[orgId]/approvals`
- `GET/POST/PATCH/DELETE /api/organizations/[orgId]/notifications`
- `GET /api/organizations/[orgId]/notifications/check-overdue`
- `POST /api/organizations/[orgId]/migration/tally` — multipart up to 50 MB; fast-xml-parser.
- `GET/POST /api/organizations/[orgId]/parties` / `[partyId]`

# 10. UI pages

71 `page.tsx` files, organized as:

## 10.1 Auth (`(auth)/`)

- `/login` — credentials form with demo creds card (rendered in both LoginForm and the Suspense fallback so they appear on SSR).
- `/register` — signup (gated by deploy config).
- `/forgot-password` — email reset flow.

## 10.2 Dashboard (`(dashboard)/`)

- `/dashboard` — KPIs, charts, recent transactions, top customers, pending actions.
- `/profile` — user profile + password change.
- `/notifications` — full feed.
- `/help` — help / support.
- `/setup` — first-time wizard.
- `/setup/migrate` — Tally migration page.

### Accounting
- `/accounting/chart-of-accounts`
- `/accounting/ledgers`
- `/accounting/vouchers` + `/accounting/vouchers/new`
- `/accounting/cost-centers`
- `/accounting/projects`
- `/accounting/budgets`

### Parties / Inventory
- `/parties`
- `/inventory/items`
- `/inventory/categories`
- `/inventory/warehouses`
- `/inventory/stock`
- `/inventory/movements`
- `/inventory/adjustment`

### Sales
- `/sales/quotations`
- `/sales/orders`
- `/sales/invoices` + `/sales/invoices/new` + `/sales/invoices/[invoiceId]`
- `/sales/credit-notes`
- `/sales/receipts`
- `/billing/recurring`

### Purchases
- `/purchases/orders`
- `/purchases/bills`
- `/purchases/debit-notes`
- `/purchases/payments`

### Banking / Manufacturing
- `/banking/accounts`
- `/banking/transactions`
- `/banking/import`
- `/banking/reconciliation`
- `/banking/cash`
- `/manufacturing/work-orders`

### Taxation
- `/taxation/gst` (4 tabs: GSTR-1, GSTR-3B, GSTR-9, CMP-08)
- `/taxation/gstr2b`
- `/taxation/tds-tcs` (4 tabs: TDS / TCS / Form 16A / Form 27D)
- `/taxation/tds-tcs/cert/[partyId]` — printable Form 16A / 27D
- `/taxation/reports`

### HR / Reports / Approvals
- `/hr/employees`
- `/hr/departments`
- `/hr/attendance`
- `/hr/leaves`
- `/hr/payroll`
- `/hr/payroll/run`
- `/hr/expense-claims`
- `/reports/financial`
- `/reports/profit-loss`
- `/reports/balance-sheet`
- `/reports/cash-flow`
- `/reports/trial-balance`
- `/reports/registers`
- `/reports/custom`
- `/approvals`

### Settings
- `/settings/organization`
- `/settings/india-tax`
- `/settings/branches`
- `/settings/users`
- `/settings/taxes`
- `/settings/approvals`
- `/settings/audit-logs`
- `/settings/notifications`
- `/settings/preferences`
- `/settings/gst-returns`

# 11. Backend services & utilities

The complete list of files under `src/backend/` (~50 files), organized by purpose.

## 11.1 Database & auth
- `database/client.ts` — Prisma singleton (PrismaPg adapter, connection pool max=3).
- `services/auth.service.ts` — NextAuth config.

## 11.2 Domain services (heavy lifting)
- `services/approvals/route-entity.ts` — voucher / bill / claim / leave routing.
- `services/approvals/promote-entity.ts` — auto-promote / auto-demote.
- `services/banking/statement-import.ts` — `parseStatementCsv` + `importParsedTxns` for HDFC / ICICI / SBI / Axis / GENERIC. Idempotent dedupe.
- `services/banking/reconcile.ts` — layered scoring matcher.
- `services/billing/post-bill.ts` — `decideBillEntries` (4-way Dr=Cr invariants) + `postBillToGl` (regular / RCM / composition / TDS-at-bill).
- `services/billing/recurring.ts` — `addFrequency` / `isDue` / `missedRunDates`.
- `services/email/send.ts` — Resend-backed sender.
- `services/gst/gstr1.ts` + `gstr1-portal.ts` — outward returns + portal JSON.
- `services/gst/gstr3b.ts` + `gstr3b-portal.ts` — monthly summary + portal JSON.
- `services/gst/gstr9.ts` + `gstr9-portal.ts` — annual + portal JSON.
- `services/gst/cmp08.ts` — composition quarterly.
- `services/gst/gstr2b.ts` — `parseGstr2bJson` + `matchGstr2bToBills`.
- `services/gst/einvoice.ts` — `buildEInvoicePayload` (NIC v1.1 schema).
- `services/gst/eway-bill.ts` — `buildEwayBillPayload` (NIC v1.04).
- `services/india/hsn-library.ts` — 50+ HSN + 20 SAC + lookup helpers + GSTIN Mod-36 checksum.
- `services/manufacturing/bom-cost.ts` — `computeBomCost` + `resolveLeafCost` (multi-level w/ cycle detection).
- `services/migration/tally.ts` — `parseTallyXml` + `importTallyData` (groups / ledgers / parties / items) + `importTallyVouchers`.
- `services/notifications/check-overdue.ts` — sweep + write Notification rows.
- `services/payroll/post-month.ts` — payroll JV builder.
- `services/reports/registers.ts` — `computeSalesRegister` + `computePurchaseRegister` + `computePartyStatement`.
- `services/tax/tds.ts` — TDS_RULES table + `computeTds`.
- `services/tax/form-16a.ts` — `buildForm16AQuarterly`.
- `services/tax/monthly-challan.ts` — TDS challan computation.

## 11.3 Utilities
- `utils/audit.ts` — `writeAudit(tx, opts)`.
- `utils/cron-auth.ts` — `verifyCronAuth(request)` for cron endpoints.
- `utils/india-tax.ts` — `decideGstSplit({orgState, partyState, isComposition})`.
- `utils/logger.ts` — pino with redaction.
- `utils/money.ts` — `D`, `sum`, `mul`, `cmp`, `closeEnough`.
- `utils/payroll-calculations.util.ts` — `calculatePF`, `calculateESI`, `calculateProfessionalTax`, `calculateTDS`, `calculateLOP`.
- `utils/permissions.ts` — `hasPermission(orgUser, module, action)`.
- `utils/posting.ts` — see Section 7.6.
- `utils/with-org-auth.ts` — see Section 7.3.

# 12. Frontend

## 12.1 Components

```
src/frontend/components/
├── ui/             # shadcn primitives (button, card, dialog, dropdown-menu,
│                   #   alert-dialog, sidebar, tabs, data-table, skeleton,
│                   #   sonner, badge, progress, tooltip, separator,
│                   #   collapsible, scroll-area, avatar, checkbox, input,
│                   #   label, popover, radio-group, select, switch, textarea,
│                   #   chart, accordion)
├── layout/
│   ├── app-sidebar.tsx       # the navigation tree + user-menu
│   └── header.tsx            # search + branch switcher + notifications
├── features/transactions/
│   ├── CreateQuotationDialog.tsx
│   ├── CreateSalesOrderDialog.tsx
│   ├── CreatePurchaseOrderDialog.tsx
│   ├── RecordReceiptDialog.tsx
│   ├── RecordPaymentDialog.tsx
│   └── index.ts
└── providers.tsx              # SessionProvider + QueryClient + TooltipProvider + Toaster
```

## 12.2 Hooks

- `useOrganization()` — returns `{ organizationId, organizationName, branchId, branchName, role, permissions, isLoading, isAuthenticated, session }`. Powered by NextAuth's `useSession()`.
- `useApi()` — returns `{ apiUrl, fetchApi, organizationId }`. `apiUrl(path)` prefixes `/api/organizations/<orgId>/`. `fetchApi<T>(path, opts)` is a thin JSON-fetch wrapper with error normalization.
- `useIsMobile()` — boolean breakpoint sniffer.

## 12.3 Utils

- `frontend/utils/export-csv.ts` — `rowsToCsv(rows, columns?)` and `downloadCsv(filename, rows, columns?)` for client-side CSV export.

# 13. Security model

## 13.1 Cross-tenant isolation

Every org-scoped API handler is wrapped with `withOrgAuth`. A handler that omits the wrapper is broken by definition — code review rejects it. Combined with `OrganizationUser`, this gives **structural** prevention of cross-tenant data leak.

## 13.2 Permission gates

Sensitive actions require `hasPermission(orgUser, module, action)` to be true:

- workflow create / delete (`module: "workflows"`).
- GSTR-2B reconcile (`module: "gst-returns"`).
- recurring invoice spawn (`module: "billing"`).
- settings PATCH (`module: "settings"`).
- user manage (`module: "users"`).

ADMIN role has wildcard on everything.

## 13.3 Last-admin guard

`PATCH /api/organizations/[orgId]/users` refuses if the change would leave zero active ADMINs in the org.

## 13.4 Lockout

`User.failedLoginAttempts` increments on every bad password; at 5 the row's `lockedUntil` is set 30 minutes in the future. The `authorize` callback rejects login while locked.

## 13.5 Demo gate

`prisma/seed.ts` refuses to run on `NODE_ENV=production` unless `ALLOW_PROD_SEED=true`. Stops accidental seeding into prod.

## 13.6 Secrets redaction

The pino logger redacts password, token, authorization, cookie, AUTH_SECRET, DATABASE_URL, NEXTAUTH_SECRET, RESEND_API_KEY, CRON_SECRET, and passwordHash from any log payload.

## 13.7 Security headers

`next.config.ts` sets HSTS (2 years, includeSubDomains, preload), X-Content-Type-Options, X-Frame-Options=SAMEORIGIN, Referrer-Policy, X-DNS-Prefetch-Control, and Permissions-Policy on every response.

## 13.8 Middleware

`src/middleware.ts` runs on every non-static request:

- Public routes: `/login`, `/register`, `/forgot-password`, `/reset-password`.
- Public APIs: `/api/auth/*`, `/api/health`, `/api/hsn-search`.
- Logged-in users hitting `/` or `/login` are redirected to `/dashboard`.
- Non-logged-in users hitting any other route are redirected to `/login?callbackUrl=<path>`.

# 14. Testing

```bash
npm test               # vitest run
npm run test:watch     # vitest watch
npm run test:coverage  # v8 coverage
```

Tests live next to source under `__tests__/` directories. Coverage is heaviest on:

- Money helpers (`utils/__tests__/money.test.ts`).
- Permission predicate (`utils/__tests__/permissions.test.ts`).
- Indian tax math (`utils/__tests__/india-tax.test.ts`, 19 tests).
- Payroll components (`utils/__tests__/payroll-calculations.test.ts`, 24 tests).
- TDS computation (`services/tax/__tests__/tds.test.ts`).
- Form 16A aggregator.
- GST services — every one of GSTR-1 / 3B / 9 / 2B / CMP-08 / e-invoice / e-way bill / portal JSON has a `__tests__/*.test.ts` companion.
- Banking statement-import + reconcile.
- BOM cost compute.
- Tally importer.
- Recurring invoices.
- Reports registers.
- Bill posting.
- Notifications check-overdue.

The test target north of 350 unit tests at last count. Integration tests against a real Postgres are the next major investment (see `update.md`).

# 15. Local development workflows

## 15.1 Adding a new entity end-to-end

Suppose you're adding a new entity called `Lead`. The recipe:

1. **Schema** — open `prisma/schema.prisma`, add the model:
   ```prisma
   model Lead {
     id             String   @id @default(cuid())
     organizationId String
     name           String
     email          String?
     status         String   @default("NEW")
     createdAt      DateTime @default(now())
     organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
     @@map("leads")
   }
   ```
2. **Migration**:
   ```bash
   npx prisma migrate dev --name add_leads
   ```
3. **API routes** under `src/app/api/organizations/[orgId]/leads/`:
   - `route.ts` with `GET = withOrgAuth(...)` returning a paginated list, `POST = withOrgAuth(...)` creating with zod validation.
   - `[leadId]/route.ts` with `GET / PATCH / DELETE`. PATCH uses `.strict()` zod schema. Delete writes audit.
4. **Page** under `src/app/(dashboard)/sales/leads/page.tsx`:
   - Client component (`"use client"`).
   - `useOrganization()` for orgId.
   - `useState + useEffect` to fetch.
   - DataTable with columns + row dropdown (View / Edit / Delete).
5. **Sidebar nav** — add an entry in `src/frontend/components/layout/app-sidebar.tsx` under the relevant module.
6. **Tests** — mirror the pattern in `__tests__/` for any pure logic.
7. **Build & verify** — `npx tsc --noEmit && npm run build && npm run dev`. Click through the page in a browser.
8. **Update** `update.md` with the work done.

## 15.2 Adding a new API endpoint

Always wrap with `withOrgAuth` for org-scoped resources, validate the body with zod (`.strict()` on PATCH), do mutations inside `prisma.$transaction`, and write an audit row in the same tx.

## 15.3 Adding a new UI page

Place under `src/app/(dashboard)/<module>/<page>/page.tsx`. Use `"use client"` if you need state / effects (most do). Always handle:

- `authLoading` — show skeleton.
- `!organizationId` — show empty state with CTA.
- `error` — show error state with Retry button.
- `loading` (data) — show skeleton.

The Sales Invoices page (`src/app/(dashboard)/sales/invoices/page.tsx`) is the canonical reference template.

# 16. Deployment (Vercel)

## 16.1 First-time setup

1. Create the project on Vercel pointing at the GitHub repo.
2. Set environment variables in Settings → Environment Variables. **Check Production + Preview + Development** for every row:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `NEXTAUTH_SECRET` (same as `AUTH_SECRET`)
   - `AUTH_TRUST_HOST=true`
   - `NEXTAUTH_URL` (set to the Vercel domain after first successful deploy)
   - Optional: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `CRON_SECRET`, `NEXT_PUBLIC_DEMO`.
3. Add custom domains under Settings → Domains.
4. Trigger a deploy. The buildCommand `prisma migrate deploy && prisma generate && next build` runs automatically.

## 16.2 Per-deploy

- Push to `main` → Vercel auto-deploys to production.
- Push to a feature branch → Vercel auto-deploys a preview.
- Migrations apply on every deploy (`prisma migrate deploy`); the `_prisma_migrations` table tracks state.

## 16.3 Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Build fails: `Failed to load config file` | `DATABASE_URL` not set in build env. | Set env var, redeploy with cache disabled. |
| Build fails: `P1001 Can't reach database server` | Neon paused or wrong host | Check Neon dashboard. |
| Migration drift on `/api/health` | Schema file ahead of applied migrations | Generate + commit a migration; redeploy. |
| 401 on every page in browser | Cookie domain mismatch | Set `NEXTAUTH_URL` to current production host. |

## 16.4 Rollback

Vercel keeps every prod deployment as a rollback candidate (state=READY) for ~14 days. From the dashboard: Deployments → previous deploy → ⋯ → Promote to Production. Migrations are *not* rolled back automatically — if the previous deploy expects an older schema, you must hand-write a downgrade migration first.

# 17. Operations

## 17.1 Health endpoint

`GET /api/health` returns:

```json
{
  "ok": true,
  "env": "production",
  "commit": "<sha>",
  "version": null,
  "db": { "ok": true, "latencyMs": 38 },
  "migrations": {
    "applied": 11,
    "onDisk": 11,
    "drift": [],
    "pending": [],
    "ok": true
  },
  "uptimeMs": 50,
  "timestamp": "<ISO 8601>"
}
```

`drift[]` is populated when on-disk migration files differ from the `_prisma_migrations` table — a deploy escape, treat as critical.

## 17.2 Runbook

`docs/RUNBOOK.md` covers known outage classes:

- DB unreachable → check Neon, retry deploy after fix.
- Vercel build failing → check env vars + `vercel.json` build command.
- 401 storm → check NEXTAUTH_URL vs current host.
- Cron not firing → verify `CRON_SECRET` header and Vercel Cron config.
- Approvals stuck → run the migration drift check, look at AuditLog for the entity.

## 17.3 Cron jobs

Vercel Cron schedules (or any equivalent scheduler) hit:

- `GET /api/cron/check-overdue` — daily 09:00 IST. Sweeps overdue invoices / bills / low stock and creates Notification rows. Bearer-protected via `CRON_SECRET`.

# 18. Common gotchas / "do not break"

- **Never move `src/app/api/`** — Next.js requires API routes there. The `src/backend/` folder is for *logic*, not handlers.
- **Don't introduce floats into money paths.** Decimal everywhere via `money.ts`. Reports, invoices, bills, vouchers, payments, receipts, stock all comply.
- **Don't add `prisma db push` to deploy.** Migrations only. `db push` is fine for local prototyping before you commit a migration.
- **Don't commit `.env`.** Already gitignored — keep it that way. Rotate `AUTH_SECRET` if you suspect a leak.
- **Don't delete `src/generated/prisma/`.** It's the Prisma client output. Gitignored, regenerated on `prisma generate`.
- **Always run `npx tsc --noEmit && npm run build` before committing.** The build is the only smoke test we have until integration tests land.
- **`middleware.ts` lives at `src/middleware.ts` (not the project root).** Because we use `src/app/`, Next 16 expects it next to the app dir. Putting it at the root silently breaks auth.
- **Approval order matters.** Don't post a voucher / bill outside the approval flow when a workflow is configured for it; you'll bypass audit + notify.
- **Place-of-supply on invoices is locked at write-time.** Editing the customer's billing state later does NOT recompute the GST split on existing invoices. Add a credit note + new invoice if the original was wrong.

# 19. Troubleshooting

| Symptom | Likely cause | First check |
|---|---|---|
| Login succeeds but dashboard skeleton spins forever | User has no `OrganizationUser` link → no `organizationId` in session | Check DB `organization_users` table; re-run `npm run db:seed` for demo |
| Unauthed `/dashboard` returns 200 (not 307 to login) | `middleware.ts` not at `src/middleware.ts` | Verify location |
| `/api/health` returns 307 to /login | Health not in middleware whitelist | Add to `publicApiRoutes` |
| Decimal precision off by 0.01 | A float crept into money path | Grep `parseFloat` and `Number(` for monetary fields |
| Voucher saves but no GL impact | Status didn't transition to APPROVED, or `applyLedgerEntries` was skipped | Check status field; check `posting.ts` was called |
| Build fails with `LayoutProps duplicate` | Stale `.next/types/routes.d *2.ts` from macOS Finder copy | `rm -rf .next` and rebuild |
| New migration doesn't run on Vercel | Forgot to commit the SQL file | `git status prisma/migrations/`; commit it |

# 20. CI

GitHub Actions runs on every push + PR. The workflow:

```yaml
- npm ci
- npx prisma generate    # uses a dummy DATABASE_URL so this works without DB access
- npm run typecheck
- npm run lint
- npm test
- npm run build          # smoke build
```

Failures block merge. Vercel is the actual deploy target — CI is the gate.

# 21. Glossary (developer)

- **`withOrgAuth`** — the multi-tenant auth wrapper. Every org-scoped route handler uses it.
- **`writeAudit`** — the audit logger. Always called inside the same `prisma.$transaction` as the underlying mutation.
- **`nextNumber`** — race-safe counter increment. Used for invoice / bill / voucher / payment / receipt numbers.
- **`postBillToGl`** — the bill→ledger posting routine.
- **`applyLedgerEntries`** — the voucher→ledger posting routine.
- **`hasPermission`** — the role/permission gate.
- **`maybePromoteEntity`** — auto-promotes voucher / bill / claim / leave once all required Approvals are decided.
- **`computeGstr1` / `computeGstr3b` / `computeGstr9` / `computeCmp08`** — pure functions that derive return cells from the persisted invoice / bill data.
- **`buildEInvoicePayload` / `buildEwayBillPayload`** — pure NIC schema builders.
- **`computeBomCost`** — multi-level BOM cost resolver (cycle-detected).

# 22. References

- `update.md` — durable cross-session plan + activity log. **Always read first** when picking up the project.
- `README.md` — short onboarding doc.
- `DEVELOPER_GUIDE.md` — legacy dev guide (this `.docx` supersedes it).
- `docs/RUNBOOK.md` — ops runbook.
- `prisma/schema.prisma` — authoritative data model.
- `vercel.json` — build command.
- `next.config.ts` — security headers + bundler exemptions.
- `.env.example` — env var template.
- Prisma docs — `https://www.prisma.io/docs`.
- NextAuth v5 docs — `https://authjs.dev/`.
- Next.js 16 docs — `https://nextjs.org/docs`.
- shadcn/ui — `https://ui.shadcn.com/`.
- Vercel — `https://vercel.com/docs`.

— End of Developer's Guide —

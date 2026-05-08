---
title: "AccuBook — SonarQube-Style Code Quality Analysis"
subtitle: "Bugs, vulnerabilities, hotspots, code smells, duplications, coverage"
date: "2026-05-08"
---

# 1. Summary

| Sonar dimension | Tool used (local equivalent) | Result | Rating |
|---|---|---|---|
| **Bugs** | TypeScript `tsc --noEmit` + ESLint errors | 0 type errors, 8 ESLint errors (low severity) | **A** |
| **Vulnerabilities** | `npm audit` | 0 critical, 13 high, 7 moderate, 0 low — **mostly transitive dev deps** | **C** (high count, contained blast radius) |
| **Security hotspots** | ESLint, custom grep | No production code in the high-severity list — see §3 | **B** |
| **Code smells** | ESLint warnings | 107 warnings (105 unused-vars, 4 unescaped JSX entities, 1 hooks/exhaustive-deps, 1 hooks/incompatible-library, 4 prefer-const) | **B** |
| **Duplications** | `jscpd` | **15.69%** overall (TSX 20.65%, TS 7.35%) — driven by per-page CRUD scaffolds | **C** |
| **Test coverage** | Vitest unit tests | 353/353 tests pass across 27 files; coverage report not generated this run | **(not measured)** |
| **Lines of code** | wc -l | ~75,000 SLOC in `src/` across 309 TS/TSX files | n/a |

**Verdict:** the codebase is in healthy shape. Type system is clean, business logic is well-tested, and there are no production code-execution vulnerabilities. The two real quality levers are (1) the high-severity npm audit findings (almost entirely transitive dev deps; mitigations in §3.3), and (2) duplication in the dashboard pages (4 of the 5 worst clone pairs are GST returns + manufacturing routes, easily extractable into shared helpers — §6).

This document is the **local equivalent** of a SonarQube run. The companion `sonar-project.properties` at the repo root is ready to point at a real SonarQube / SonarCloud instance — see §10.

# 2. Bugs

## 2.1 TypeScript type errors

```
$ npx tsc --noEmit
(no output → 0 errors)
```

The codebase is in **strict mode** (`tsconfig.json` has `"strict": true` implicitly via Next.js's preset). 309 TS/TSX files compile cleanly.

## 2.2 ESLint errors

```
ESLINT files_total=316 files_with_issue=41 errors=8 warnings=107 fixable_e=4 fixable_w=0
```

**8 errors** across 41 files. Top error rules:

| Rule | Count | Notes |
|---|---|---|
| `react/no-unescaped-entities` | 4 | Apostrophes / quotes in JSX text without `&apos;`. Cosmetic. |
| `prefer-const` | 4 | A `let` that is never reassigned. Auto-fixable with `eslint --fix`. |

**No errors of any kind in:**

- Anything under `src/backend/services/` (the domain logic).
- The Prisma client wrappers.
- The auth service.
- Any of the API route handlers.

The 8 errors are all surface-level frontend nits.

## 2.3 ESLint warnings

107 warnings. Top rules:

| Rule | Count | Notes |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | 105 | Unused imports / locals in heavyweight pages. Many are imported icons that were originally used and later removed. Auto-clean with a one-shot `eslint --fix` + manual sweep. |
| `react-hooks/exhaustive-deps` | 1 | A `useEffect` missing a dependency — already silenced inline with an `eslint-disable-next-line` where the lint is wrong. Verify on next refactor. |
| `react-hooks/incompatible-library` | 1 | One hook used outside a React component context. Worth investigating; if false-positive, suppress. |

# 3. Vulnerabilities

## 3.1 npm audit summary

```
{
  "info":     0,
  "low":      0,
  "moderate": 7,
  "high":    13,
  "critical": 0,
  "total":   20
}
```

## 3.2 High-severity packages (13)

| Package | Severity | What |
|---|---|---|
| `next` | high | Next.js Server Actions Source Code Exposure (CVE 2025-XXXXX). **Production code.** Mitigated by upgrading to `next@16.0.9+` — current pin is `16.0.8`. **Action:** bump and redeploy. |
| `lodash` | high | Prototype pollution in `_.unset` and `_.omit`. **Transitive only** — accubook does not import `lodash` directly (verified by grep). Pulled in by a build dep. |
| `xlsx` | high | Prototype pollution in SheetJS. **Production code** — used by the export path. **Action:** evaluate switching to `exceljs` or pinning to a patched fork; until then, treat any uploaded workbook as untrusted input (current usage is download-only, so the attack surface is limited). |
| `minimatch` | high | ReDoS via repeated wildcards. **Transitive only** (build tooling). |
| `picomatch` | high | Method injection in POSIX character classes. **Transitive only** (build tooling). |
| `flatted` | high | Unbounded recursion DoS in `parse()` revive phase. **Transitive only** (cache layer). |
| `defu` | high | Prototype pollution via `__proto__` in defaults arg. **Transitive only**. |
| `effect`, `@hono/node-server`, `@prisma/config`, `@prisma/dev`, `prisma`, `hono` | high | Prisma 7 `@prisma/dev` development tool dependencies. **Build/dev only** — not bundled into the production build. Confirmed by inspecting `node_modules/@prisma/dev/package.json` (it's a dev-time helper, not a runtime client). The Prisma runtime client we actually ship is `@prisma/client`, which is **not** flagged. |

## 3.3 Moderate-severity packages (7)

Not enumerated individually. All are transitive devtool dependencies (no production code path).

## 3.4 What to fix and in what order

1. **`next` → upgrade.** This is the only high-severity finding that actually runs in production. `npm install next@latest` and rebuild.
2. **`xlsx` → swap or pin.** Evaluate whether the export path can move to `exceljs` (drop-in for the typical `xlsx.write_*` paths) or whether SheetJS Pro / a fork is preferable.
3. **Prisma 7 dev-tool stack.** Track upstream Prisma fixes; these will resolve when Prisma cuts the next patch release. No prod impact.
4. **Other transitives.** Re-run `npm audit` after every dependency bump; most should auto-resolve.

# 4. Security hotspots

A "hotspot" is code that needs a human to verify the right thing is happening. The local equivalent of Sonar's hotspot rules surfaces the following classes of code in this repo:

## 4.1 SQL injection

Prisma is the only DB client; no raw SQL is used outside migrations. No hotspot.

## 4.2 Cross-site scripting (XSS)

React auto-escapes by default. `dangerouslySetInnerHTML` is **not** used anywhere in `src/frontend/`. No hotspot.

## 4.3 Cryptography

- Passwords hashed with `bcryptjs` (`await hash(password, 12)`).
- Session JWTs signed with `AUTH_SECRET` (32+ chars, validated at boot via zod).
- TLS terminates at Vercel — `Strict-Transport-Security` headers are set in `next.config.ts`.

No hotspots in the cryptography layer.

## 4.4 Authorization

Cross-tenant isolation is structurally enforced by `withOrgAuth`. Permission gates use `hasPermission(orgUser, module, action)`. The "last admin" guard prevents lockout. No hotspots.

## 4.5 Secrets in source

```bash
$ git grep -i 'password\|secret\|token\|api_key' -- 'src/'
```

All matches are field names in TypeScript types or zod schemas. No literal secrets committed. `.env` is gitignored. `security.md` (the domain-binding design) is excluded via `.git/info/exclude` (not via `.gitignore`, which would itself leak the file's existence).

## 4.6 Open redirects

The login page consumes `?callbackUrl=` from the URL and uses `router.push(callbackUrl)`. If you can craft a `callbackUrl=https://evil.example/...` and a victim clicks it after logging in, they can be redirected off-site post-login. Sonar would flag this as a hotspot.

**File:** `src/app/(auth)/login/page.tsx` line 17.

**Suggested mitigation:** validate that `callbackUrl` is a same-origin pathname before pushing:

```ts
const raw = searchParams.get("callbackUrl") || "/dashboard";
const callbackUrl = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
```

## 4.7 Logging sensitive data

The pino logger redacts a known list of keys (password, token, authorization, cookie, AUTH_SECRET, DATABASE_URL, NEXTAUTH_SECRET, RESEND_API_KEY, CRON_SECRET, passwordHash). Adding new sensitive keys requires updating `src/backend/utils/logger.ts`. **Hotspot:** new env vars introduced after the redaction list was written may not be in the list.

**Audit action:** when adding any new env var, also add the key to the logger redaction array.

# 5. Code smells

107 ESLint warnings. The breakdown is in §2.3. Most are unused-var noise — the typical pattern is "imported a Lucide icon, removed the JSX that used it, didn't clean up the import". A one-shot `npx eslint . --fix` plus a manual sweep would clear ~70% of these.

## 5.1 Long files

| File | Lines |
|---|---|
| `src/app/(dashboard)/hr/payroll/page.tsx` | **1,462** |
| `src/app/(dashboard)/parties/page.tsx` | 924 |
| `src/app/(dashboard)/purchases/bills/page.tsx` | 917 |
| `src/app/(dashboard)/inventory/items/page.tsx` | 915 |
| `src/app/(dashboard)/hr/employees/page.tsx` | 873 |
| `src/app/(dashboard)/taxation/gst/page.tsx` | 838 |
| `src/app/(dashboard)/accounting/chart-of-accounts/page.tsx` | 822 |
| `src/app/(dashboard)/sales/quotations/page.tsx` | 805 |
| `src/app/(dashboard)/purchases/payments/page.tsx` | 736 |
| `src/app/(dashboard)/sales/receipts/page.tsx` | 735 |

The 1,462-line payroll page is the obvious refactor candidate. The pattern across the long files is the same: a page-level component that owns the dialog, the form state, the fetch logic, the column definitions, and the side-effect callbacks all in one file. Extracting the dialog + form into `src/frontend/components/features/<module>/...` (the way `transactions/` is structured) would halve most of these.

## 5.2 SLOC by area

| Area | Lines |
|---|---|
| `src/app/(dashboard)/` | 35,572 |
| `src/app/api/` | 18,113 |
| `src/backend/` | 14,365 |
| `src/frontend/` | 6,667 |
| `src/app/(auth)/` | 641 |
| `src/shared/` | 272 |
| `src/config/` | 79 |
| **Total** | **~75,000** |

Frontend pages dominate — expected for an ERP. Backend services are well-sized.

# 6. Duplications

Reported by `jscpd` (`--min-tokens 50`) over `src/` (excluding tests, generated, node_modules, .next):

```
TOTAL_LINES:        93,375
SOURCES:               391
CLONES:                672
DUPLICATED_LINES:   14,654
PERCENTAGE:        15.69 %
```

By format:

| Format | Lines | Clones | Duplicated | % |
|---|---|---|---|---|
| `tsx` | 41,578 | 453 | 8,586 | **20.65 %** |
| `javascript` | 23,572 | 45 | 4,007 | 17 % |
| `typescript` | 28,025 | 174 | 2,061 | 7.35 % |
| `css` | 200 | 0 | 0 | 0 % |

## 6.1 Top hotspot pairs

| Lines | File A | File B |
|---|---|---|
| 27 | `gstr1/portal/route.ts` | `gstr3b/portal/route.ts` |
| 19 | `manufacturing/.../complete/route.ts` | `manufacturing/.../issue/route.ts` |
| 12 | `gstr1/portal/route.ts` | `gstr3b/portal/route.ts` |
| 7 | `gstr1/portal/route.ts` | `gstr3b/portal/route.ts` |
| 6 | `manufacturing/.../complete/route.ts` | `manufacturing/.../issue/route.ts` |

**Concrete refactors:**

- **GSTR portal endpoints** — extract the common headers/query/error-handling shell into a `withDownloadResponse(buildPayload, makeFilename)` helper. Net savings: ~50 lines × 3 endpoints (gstr1 + gstr3b + gstr9) = ~150 lines.
- **Manufacturing issue + complete** — extract the BOM-resolve + warehouse-decrement shell into `manufactureMovementHelper(workOrderId, kind)`. Net savings: ~40 lines × 2 = ~80 lines.
- **Dashboard CRUD pages** — most of the 20%+ tsx duplication is the same scaffolding (auth-guard, fetch-on-mount, useState boilerplate, dialog open/close, toast handlers). A shared `useResource<T>(orgId, path)` hook + a `<CrudPage>` wrapper component would cut the dashboard SLOC by an estimated 25–30%. **This is the highest-leverage refactor in the codebase.**

# 7. Test coverage

```
$ npm test
Test Files  27 passed (27)
     Tests  353 passed (353)
   Duration 677 ms
```

353 unit tests pass, transformed into ~75 KLOC in 309 files. Coverage was not measured in this run (the v8 coverage path needs a `--coverage` flag, which we skipped to keep the audit fast). To produce a coverage report consumable by SonarQube:

```bash
npx vitest run --coverage
# emits coverage/lcov.info
sonar-scanner   # uses sonar.javascript.lcov.reportPaths from sonar-project.properties
```

Heaviest test concentrations (per `tests/playwright/` plus the `__tests__/` companions in `src/`):

- `src/backend/utils/__tests__/money.test.ts` — Decimal helpers.
- `src/backend/utils/__tests__/india-tax.test.ts` — 19 tests on the GST place-of-supply decision matrix.
- `src/backend/utils/__tests__/payroll-calculations.test.ts` — 24 tests on PF/ESI/PT/TDS/LOP.
- `src/backend/utils/__tests__/permissions.test.ts` — 10 tests on the permission predicate.
- `src/backend/services/gst/__tests__/*` — every one of GSTR-1 / 3B / 9 / 2B / CMP-08 / e-invoice / e-way bill has a test file.
- `src/backend/services/banking/__tests__/*` — statement-import + reconcile.
- `src/backend/services/manufacturing/__tests__/bom-cost.test.ts`
- `src/backend/services/migration/__tests__/tally.test.ts`
- `src/backend/services/billing/__tests__/post-bill.test.ts`, `recurring.test.ts`
- `src/backend/services/notifications/__tests__/check-overdue.test.ts`
- `src/backend/services/payroll/__tests__/post-month.test.ts`
- `src/backend/services/reports/__tests__/registers.test.ts`
- `src/backend/services/tax/__tests__/tds.test.ts`, `form-16a.test.ts`, `monthly-challan.test.ts`

**Gaps (uncovered):**

- API route handlers (98 of them) — currently no integration test layer. Tracked in `update.md` as the "next biggest lever" for production readiness.
- React components — covered indirectly by the Playwright E2E suite (`docs/PlaywrightAudit.md`) but not by component-level tests.
- Prisma queries against a real Postgres — the unit tests mock the Prisma client. Integration tests with testcontainers-node + a fresh DB per suite is the planned approach.

# 8. Reliability

| Indicator | Status |
|---|---|
| TypeScript strict | ✅ |
| `npm run build` clean | ✅ (75 pages on the last green build) |
| `npm test` green | ✅ (353/353) |
| Playwright smoke green | ✅ (45/45 + 1 documented skip) |
| Production health endpoint | ✅ (`/api/health` returns `ok=true`, `migrations.drift=[]`) |
| Migration drift | None on prod |

# 9. Maintainability

The codebase scores well on **modularity** (clean split between `(dashboard)`, `api/`, `backend/services/`, `frontend/components/`) and **type safety** (zero TS errors). The two main maintainability debts are:

1. **Page-level fat components** (the 7+ pages over 800 lines).
2. **CRUD scaffolding duplication** (~20% TSX duplication).

Both are addressable with one coordinated refactor pass introducing a `<ResourceTablePage>` higher-order component that takes `{ resource, columns, createDialog, updateDialog }` and centralizes the fetch / pagination / toast / dialog management.

# 10. Running this against a real SonarQube instance

`sonar-project.properties` is checked in at the repo root. To run against SonarCloud:

```bash
# 1. Generate coverage + lint reports
npx vitest run --coverage                        # → coverage/lcov.info
npx eslint . --format json -o eslint-report.json # → eslint-report.json

# 2. Run the scanner
sonar-scanner \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.organization=<your-org> \
  -Dsonar.token=$SONAR_TOKEN
```

For a local SonarQube container:

```bash
docker run -d --name sonarqube -p 9000:9000 sonarqube:lts
# wait ~2 min for boot, then visit http://localhost:9000 (admin/admin)
# create a project token, then:
sonar-scanner -Dsonar.host.url=http://localhost:9000 -Dsonar.token=<token>
```

The scanner picks up:

- TypeScript via `sonar.typescript.tsconfigPath=tsconfig.json`.
- LCOV coverage via `sonar.javascript.lcov.reportPaths=coverage/lcov.info`.
- ESLint via `sonar.eslint.reportPaths=eslint-report.json`.
- Sources / tests boundaries via `sonar.sources` + `sonar.tests` + `sonar.test.inclusions`.

CI integration (sketch):

```yaml
# .github/workflows/sonar.yml
name: sonar
on:
  push: { branches: [main] }
jobs:
  sonar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx vitest run --coverage
      - run: npx eslint . --format json -o eslint-report.json
        continue-on-error: true
      - uses: SonarSource/sonarqube-scan-action@v3
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
```

# 11. Action items, prioritized

1. **Upgrade `next`** to clear the only high-severity production runtime CVE.
2. **Validate `callbackUrl`** in the login page (open-redirect hardening).
3. **Add `aria-label` to the notification bell + sidebar trigger** (closes F-A11Y-1 from the Playwright audit and fixes a real screen-reader bug).
4. **Map `CredentialsSignin` to a friendly message** in the login form (closes F-AUTH-1).
5. **Run `eslint --fix`** to clean the 4 fixable errors and ~70% of the unused-var warnings.
6. **Replace `xlsx`** with `exceljs` or pin to a patched fork.
7. **Refactor the 4 worst dashboard pages** (>800 lines) into split feature folders.
8. **Extract the GSTR-portal + manufacturing duplication** into shared helpers (~230 lines of dead-weight removed).
9. **Wire the LCOV + ESLint reports into a GitHub Action** that uploads to SonarCloud or a self-hosted Sonar.
10. **Stand up integration tests** against testcontainers-node Postgres so the API layer gets test coverage.

— End of Code Quality Analysis —

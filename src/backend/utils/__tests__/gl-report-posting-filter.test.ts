import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Every GL-derived report must read the same accounting population.
 *
 * The financial statements are all built by aggregating `VoucherEntry`
 * rows through their parent voucher. Trial balance required
 * `status: "APPROVED"` AND `isPosted: true`; balance sheet, P&L, cash flow
 * and the XLSX/CSV export required only `status: "APPROVED"`. A voucher in
 * one state and not the other would therefore appear in some statements
 * and not others, and the balance sheet's own `isBalanced` check could
 * fail against a trial balance that passed.
 *
 * Every writer keeps the pair in lockstep today — approving sets both,
 * unposting and cancelling clear both, and a groupBy over the live
 * database returned only (APPROVED, isPosted=true) — so this is a
 * divergence the reports *permit*, not one currently in the data. The
 * point of asserting it here is that the reports stop being able to
 * disagree if that invariant is ever broken by a new code path.
 *
 * Coverage boundary: this is a source-level structural assertion, not a
 * database round-trip. It cannot prove Postgres returns matching rows —
 * it proves the five reports ask the same question. A DB-backed test
 * would be strictly stronger and belongs with the integration harness
 * that this suite does not yet have. A structural test is used here
 * because the defect is precisely a mismatch *between files*, which no
 * single-route unit test would have caught.
 */

const REPORTS_ROOT = join(
  process.cwd(),
  "src/app/api/organizations/[orgId]/reports"
);

/** Reports whose figures come from aggregating voucher entries. */
const GL_REPORTS = [
  "trial-balance",
  "balance-sheet",
  "profit-loss",
  "cash-flow",
  "export",
];

function readReport(name: string): string {
  const p = join(REPORTS_ROOT, name, "route.ts");
  if (!existsSync(p)) throw new Error(`Report route missing: ${p}`);
  return readFileSync(p, "utf8");
}

/**
 * Count the voucher filters that name an APPROVED status, and how many of
 * those also assert `isPosted`. Prisma lets the two fields sit on separate
 * lines, so the whole file is scanned rather than a single expression.
 */
function postingFilterCounts(src: string) {
  const approved = (src.match(/status:\s*"APPROVED"/g) ?? []).length;
  const posted = (src.match(/isPosted:\s*true/g) ?? []).length;
  return { approved, posted };
}

describe("GL reports agree on the posted-books population", () => {
  it.each(GL_REPORTS)(
    "%s pairs every APPROVED voucher filter with isPosted: true",
    (report) => {
      const { approved, posted } = postingFilterCounts(readReport(report));
      expect(
        approved,
        `${report} has no APPROVED voucher filter — the report may have been ` +
          `restructured; re-check that it still reads the posted books.`
      ).toBeGreaterThan(0);
      expect(
        posted,
        `${report} has ${approved} APPROVED voucher filter(s) but ${posted} ` +
          `isPosted assertion(s). An approved-but-unposted voucher would be ` +
          `counted here while the trial balance excludes it, so the two ` +
          `statements would disagree.`
      ).toBe(approved);
    }
  );

  it("no GL report reads APPROVED vouchers without the posting flag", () => {
    const offenders = GL_REPORTS.filter((r) => {
      const { approved, posted } = postingFilterCounts(readReport(r));
      return approved !== posted;
    });
    expect(
      offenders,
      `These reports do not match trial-balance's filter: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("trial-balance remains the reference implementation", () => {
    // The other four were aligned *to* trial balance. If this ever stops
    // asserting both fields, the baseline itself has moved and the rest of
    // this file is checking against the wrong reference.
    const src = readReport("trial-balance");
    expect(src).toMatch(/status:\s*"APPROVED"/);
    expect(src).toMatch(/isPosted:\s*true/);
  });
});

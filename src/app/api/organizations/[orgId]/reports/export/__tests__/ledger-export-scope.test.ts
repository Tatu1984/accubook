import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression test for the ledger-export cross-tenant IDOR.
 *
 * `withOrgAuth` proves the caller belongs to the organization named in the
 * URL. It does not validate ids arriving in the request body. The "ledger"
 * export branch took `filters.ledgerId` straight from the body and queried
 * it with `findUnique({ where: { id } })` — no organizationId — then pulled
 * every voucher entry for that ledger the same way. Any member of any
 * organization could export another tenant's ledger, including its opening
 * balance and full voucher history.
 *
 * These tests assert the *query shape*, which is where the vulnerability
 * lived: the ledger lookup must be constrained by organizationId, and a
 * ledger belonging to another tenant must produce 404 rather than data.
 * Asserting the shape (rather than round-tripping a real database) keeps
 * this runnable in the existing pure-unit suite, which has no DB harness.
 */

const findFirst = vi.fn();
const findUnique = vi.fn();
const voucherEntryFindMany = vi.fn();

vi.mock("@/backend/database/client", () => ({
  prisma: {
    ledger: {
      get findFirst() {
        return findFirst;
      },
      get findUnique() {
        return findUnique;
      },
    },
    voucherEntry: {
      get findMany() {
        return voucherEntryFindMany;
      },
    },
    organization: { findUnique: vi.fn().mockResolvedValue({ name: "Acme" }) },
  },
}));

// withOrgAuth is exercised by its own tests; here it must simply hand the
// handler a fixed orgId so the body-supplied ledgerId is the only variable.
vi.mock("@/backend/utils/with-org-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    withOrgAuth:
      (handler: (req: unknown, ctx: unknown) => unknown) =>
      (req: unknown) =>
        handler(req, { orgId: CALLER_ORG_ID, userId: "user-1" }),
    badRequest: (message: string) =>
      NextResponse.json({ error: message }, { status: 400 }),
    notFound: (message = "Not found") =>
      NextResponse.json({ error: message }, { status: 404 }),
  };
});

vi.mock("@/backend/utils/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const CALLER_ORG_ID = "org-caller";
const VICTIM_ORG_ID = "org-victim";
const FOREIGN_LEDGER_ID = "ledger-owned-by-victim";

function exportRequest(ledgerId: string) {
  return new Request("http://localhost/api/organizations/org-caller/reports/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reportType: "ledger",
      format: "json",
      filters: { ledgerId },
    }),
  });
}

/**
 * Stand-in for the database: a ledger row is only visible when the query
 * names the organization that owns it. An unscoped query (no
 * organizationId) is what the vulnerability looked like, so it resolves to
 * the row — letting the test prove the route no longer issues one.
 */
function seedVictimLedger() {
  findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
    if (where.id !== FOREIGN_LEDGER_ID) return Promise.resolve(null);
    if (where.organizationId === VICTIM_ORG_ID) {
      return Promise.resolve(victimLedgerRow());
    }
    return Promise.resolve(null);
  });
  findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(where.id === FOREIGN_LEDGER_ID ? victimLedgerRow() : null)
  );
  voucherEntryFindMany.mockResolvedValue([]);
}

function victimLedgerRow() {
  return {
    id: FOREIGN_LEDGER_ID,
    name: "Victim Secret Bank A/c",
    openingBalance: "125000",
    openingBalanceType: "DR",
    group: { name: "Cash & Bank", nature: "ASSETS" },
  };
}

describe("ledger export — organization scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedVictimLedger();
  });

  it("refuses a ledgerId belonging to another organization", async () => {
    const { POST } = await import("../route");

    const response = (await POST(
      exportRequest(FOREIGN_LEDGER_ID) as never,
      { params: Promise.resolve({ orgId: CALLER_ORG_ID }) } as never
    )) as Response;

    expect(response.status).toBe(404);
    // The victim's ledger name must never reach the caller.
    expect(JSON.stringify(await response.json())).not.toContain("Victim Secret");
  });

  it("constrains the ledger lookup by organizationId", async () => {
    const { POST } = await import("../route");

    await POST(
      exportRequest(FOREIGN_LEDGER_ID) as never,
      { params: Promise.resolve({ orgId: CALLER_ORG_ID }) } as never
    );

    // The unscoped findUnique({ where: { id } }) was the vulnerability.
    expect(findUnique).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: FOREIGN_LEDGER_ID,
          organizationId: CALLER_ORG_ID,
        }),
      })
    );
  });

  it("exports a ledger the caller's own organization owns", async () => {
    const OWN_LEDGER_ID = "ledger-owned-by-caller";
    findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.id === OWN_LEDGER_ID && where.organizationId === CALLER_ORG_ID) {
        return Promise.resolve({
          id: OWN_LEDGER_ID,
          name: "Own Bank A/c",
          openingBalance: "1000",
          openingBalanceType: "DR",
          group: { name: "Cash & Bank", nature: "ASSETS" },
        });
      }
      return Promise.resolve(null);
    });

    const { POST } = await import("../route");
    const response = (await POST(
      exportRequest(OWN_LEDGER_ID) as never,
      { params: Promise.resolve({ orgId: CALLER_ORG_ID }) } as never
    )) as Response;

    expect(response.status).toBe(200);
    const body = (await response.json()) as { sheetName: string };
    expect(body.sheetName).toBe("Ledger - Own Bank A/c");
  });

  it("scopes the voucher-entry query to the caller's organization", async () => {
    const OWN_LEDGER_ID = "ledger-owned-by-caller";
    findFirst.mockResolvedValue({
      id: OWN_LEDGER_ID,
      name: "Own Bank A/c",
      openingBalance: "0",
      openingBalanceType: "DR",
      group: { name: "Cash & Bank", nature: "ASSETS" },
    });

    const { POST } = await import("../route");
    await POST(
      exportRequest(OWN_LEDGER_ID) as never,
      { params: Promise.resolve({ orgId: CALLER_ORG_ID }) } as never
    );

    expect(voucherEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          voucher: expect.objectContaining({ organizationId: CALLER_ORG_ID }),
        }),
      })
    );
  });
});

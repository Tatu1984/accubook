import { describe, expect, it } from "vitest";
import { hasPermission, type OrgUserForPermissionCheck } from "../permissions";
import { SYSTEM_ROLES } from "@/backend/services/organization/roles";
import { API_RESOURCE_MAP, methodToAction } from "@/backend/utils/api-scope";

const orgUserWithPerms = (permissions: unknown): OrgUserForPermissionCheck => ({
  role: { permissions },
});

describe("hasPermission", () => {
  it("grants when module + category + action all match exactly", () => {
    const u = orgUserWithPerms([
      { module: "inventory", category: "items", actions: ["read", "write"] },
    ]);
    expect(hasPermission(u, "inventory", "items", "read")).toBe(true);
    expect(hasPermission(u, "inventory", "items", "write")).toBe(true);
  });

  it("denies when action does not match", () => {
    const u = orgUserWithPerms([
      { module: "inventory", category: "items", actions: ["read"] },
    ]);
    expect(hasPermission(u, "inventory", "items", "delete")).toBe(false);
  });

  it("denies when module does not match", () => {
    const u = orgUserWithPerms([
      { module: "inventory", category: "items", actions: ["read"] },
    ]);
    expect(hasPermission(u, "organization", "users", "read")).toBe(false);
  });

  it("denies when the category does not match, even inside a granted module", () => {
    const u = orgUserWithPerms([
      { module: "organization", category: "audit-logs", actions: ["read"] },
    ]);
    expect(hasPermission(u, "organization", "audit-logs", "read")).toBe(true);
    expect(hasPermission(u, "organization", "users", "read")).toBe(false);
  });

  it("respects wildcard module", () => {
    const u = orgUserWithPerms([{ module: "*", category: "*", actions: ["read"] }]);
    expect(hasPermission(u, "inventory", "items", "read")).toBe(true);
    expect(hasPermission(u, "accounting", "vouchers", "read")).toBe(true);
  });

  it("respects wildcard category within a module", () => {
    const u = orgUserWithPerms([{ module: "sales", category: "*", actions: ["write"] }]);
    expect(hasPermission(u, "sales", "invoices", "write")).toBe(true);
    expect(hasPermission(u, "sales", "receipts", "write")).toBe(true);
    expect(hasPermission(u, "purchases", "bills", "write")).toBe(false);
  });

  it("respects wildcard action", () => {
    const u = orgUserWithPerms([
      { module: "organization", category: "users", actions: ["*"] },
    ]);
    expect(hasPermission(u, "organization", "users", "approve")).toBe(true);
    expect(hasPermission(u, "organization", "users", "anything-else")).toBe(true);
  });

  it("treats a grant with no category as module-wide, for older stored grants", () => {
    const u = orgUserWithPerms([{ module: "reports", actions: ["read"] }]);
    expect(hasPermission(u, "reports", "dashboard", "read")).toBe(true);
    expect(hasPermission(u, "reports", "reports", "read")).toBe(true);
  });

  describe("grants already stored in the database", () => {
    // Roles live in Postgres. The rows written before the vocabulary was
    // unified say "create"/"update" where a request now resolves to
    // "write". Without the alias, deploying would deny every write to
    // every existing user — starting with the seeded ADMIN.
    const legacyAdmin = orgUserWithPerms([
      { module: "*", actions: ["create", "read", "update", "delete", "approve", "export"] },
    ]);

    it("a legacy admin grant still satisfies write", () => {
      expect(hasPermission(legacyAdmin, "accounting", "vouchers", "write")).toBe(true);
      expect(hasPermission(legacyAdmin, "sales", "invoices", "write")).toBe(true);
    });

    it("a legacy admin grant still satisfies the actions it named directly", () => {
      expect(hasPermission(legacyAdmin, "accounting", "vouchers", "read")).toBe(true);
      expect(hasPermission(legacyAdmin, "accounting", "vouchers", "delete")).toBe(true);
      expect(hasPermission(legacyAdmin, "accounting", "vouchers", "approve")).toBe(true);
      expect(hasPermission(legacyAdmin, "reports", "reports", "export")).toBe(true);
    });

    it("only 'create' or 'update' satisfy write — the alias widens nothing else", () => {
      const readOnly = orgUserWithPerms([{ module: "*", actions: ["read"] }]);
      expect(hasPermission(readOnly, "sales", "invoices", "write")).toBe(false);
      expect(hasPermission(readOnly, "sales", "invoices", "delete")).toBe(false);
      expect(hasPermission(readOnly, "sales", "invoices", "approve")).toBe(false);

      const createOnly = orgUserWithPerms([{ module: "sales", actions: ["create"] }]);
      expect(hasPermission(createOnly, "sales", "invoices", "write")).toBe(true);
      expect(hasPermission(createOnly, "sales", "invoices", "delete")).toBe(false);
      expect(hasPermission(createOnly, "sales", "invoices", "read")).toBe(false);
    });
  });

  it("denies when permissions is null", () => {
    expect(hasPermission(orgUserWithPerms(null), "inventory", "items", "read")).toBe(false);
  });

  it("denies when permissions is malformed (not an array)", () => {
    expect(
      hasPermission(orgUserWithPerms({ not: "an array" }), "inventory", "items", "read")
    ).toBe(false);
  });

  it("denies when role is null", () => {
    const u: OrgUserForPermissionCheck = { role: null };
    expect(hasPermission(u, "inventory", "items", "read")).toBe(false);
  });

  it("ignores garbage entries within the array", () => {
    const u = orgUserWithPerms([
      { module: "inventory" }, // missing actions
      { actions: ["read"] }, // missing module
      "garbage",
      null,
      42,
    ]);
    expect(hasPermission(u, "inventory", "items", "read")).toBe(false);
  });

  it("evaluates multiple entries — any match grants", () => {
    const u = orgUserWithPerms([
      { module: "inventory", category: "items", actions: ["read"] },
      { module: "accounting", category: "vouchers", actions: ["read", "write"] },
    ]);
    expect(hasPermission(u, "accounting", "vouchers", "write")).toBe(true);
    expect(hasPermission(u, "inventory", "items", "read")).toBe(true);
    expect(hasPermission(u, "inventory", "items", "delete")).toBe(false);
  });
});

/**
 * These tie the seeded roles to the enforcement path. The bug they guard
 * against is the one that made the role model decorative: the seeded
 * ACCOUNTANT granted modules ("accounting", "banking", "reports") that
 * shared no vocabulary with what the route gates checked ("vouchers",
 * "payments", "settings"), so the role was denied everywhere it mattered
 * while an ungated route let anyone through regardless.
 */
describe("seeded roles against the real resource map", () => {
  const role = (name: string) => {
    const r = SYSTEM_ROLES.find((x) => x.name === name);
    if (!r) throw new Error(`no such role: ${name}`);
    return orgUserWithPerms(r.permissions);
  };

  it("every module named in a system role exists in API_RESOURCE_MAP", () => {
    const known = new Set(Object.values(API_RESOURCE_MAP).map((r) => r.module));
    known.add("*");
    for (const r of SYSTEM_ROLES) {
      for (const p of r.permissions) {
        expect(
          known.has(p.module),
          `role ${r.name} grants unknown module "${p.module}"`
        ).toBe(true);
      }
    }
  });

  it("every category named in a system role exists in API_RESOURCE_MAP", () => {
    const known = new Set(Object.values(API_RESOURCE_MAP).map((r) => r.category));
    known.add("*");
    known.add("profile"); // the /organizations/[orgId] record itself
    for (const r of SYSTEM_ROLES) {
      for (const p of r.permissions) {
        const cat = p.category ?? "*";
        expect(
          known.has(cat),
          `role ${r.name} grants unknown category "${cat}"`
        ).toBe(true);
      }
    }
  });

  it("ADMIN can reach every mapped resource with every method", () => {
    const admin = role("ADMIN");
    for (const target of Object.values(API_RESOURCE_MAP)) {
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
        expect(
          hasPermission(admin, target.module, target.category, methodToAction(method))
        ).toBe(true);
      }
    }
  });

  it("VIEWER can read everything and write nothing but its own notifications", () => {
    const viewer = role("VIEWER");
    for (const target of Object.values(API_RESOURCE_MAP)) {
      expect(hasPermission(viewer, target.module, target.category, "read")).toBe(true);
      expect(hasPermission(viewer, target.module, target.category, "approve")).toBe(false);

      // The single deliberate exception: dismissing your own notification
      // is not a write to the books, and the route filters to the calling
      // user's rows. Everything else must stay read-only.
      const isOwnNotifications =
        target.module === "organization" && target.category === "notifications";
      expect(hasPermission(viewer, target.module, target.category, "write")).toBe(
        isOwnNotifications
      );
      expect(hasPermission(viewer, target.module, target.category, "delete")).toBe(
        isOwnNotifications
      );
    }
  });

  it("VIEWER cannot post to the ledger through any mapped route", () => {
    const viewer = role("VIEWER");
    // The concrete capabilities the missing gates handed to read-only users.
    expect(hasPermission(viewer, "accounting", "vouchers", "write")).toBe(false);
    expect(hasPermission(viewer, "sales", "invoices", "write")).toBe(false);
    expect(hasPermission(viewer, "purchases", "payments", "write")).toBe(false);
    expect(hasPermission(viewer, "accounting", "ledgers", "delete")).toBe(false);
    expect(hasPermission(viewer, "inventory", "stock", "write")).toBe(false);
    expect(hasPermission(viewer, "hr", "payroll", "write")).toBe(false);
    expect(hasPermission(viewer, "taxation", "tax-config", "write")).toBe(false);
  });

  it("ACCOUNTANT can actually do the accounting job", () => {
    const acc = role("ACCOUNTANT");
    // The checks that used to fail because of the vocabulary mismatch.
    expect(hasPermission(acc, "accounting", "vouchers", "approve")).toBe(true);
    expect(hasPermission(acc, "purchases", "bills", "approve")).toBe(true);
    expect(hasPermission(acc, "purchases", "payments", "approve")).toBe(true);
    expect(hasPermission(acc, "sales", "receipts", "approve")).toBe(true);
    expect(hasPermission(acc, "sales", "invoices", "write")).toBe(true);
    expect(hasPermission(acc, "reports", "reports", "export")).toBe(true);
    expect(hasPermission(acc, "organization", "audit-logs", "read")).toBe(true);
  });

  it("ACCOUNTANT cannot administer the organization or grant itself power", () => {
    const acc = role("ACCOUNTANT");
    expect(hasPermission(acc, "organization", "users", "write")).toBe(false);
    expect(hasPermission(acc, "organization", "roles", "write")).toBe(false);
    expect(hasPermission(acc, "organization", "api-keys", "write")).toBe(false);
    expect(hasPermission(acc, "organization", "profile", "write")).toBe(false);
    expect(hasPermission(acc, "organization", "audit-logs", "delete")).toBe(false);
    // Payroll is HR, not accounting — a bookkeeper should not be able to
    // post salaries to the ledger without being granted HR.
    expect(hasPermission(acc, "hr", "payroll", "approve")).toBe(false);
  });
});

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

/**
 * The production database carries role rows in the pre-object vocabulary,
 * written by an older seed. `hasPermission` skipped them (strings are not
 * objects), so every check returned false and the holder was locked out of
 * their organization entirely once withOrgAuth began enforcing centrally.
 */
describe("legacy flat-string grants", () => {
  // Verbatim from the production `Admin` role row.
  const legacyAdmin = orgUserWithPerms([
    "manage_organization",
    "manage_users",
    "manage_roles",
    "view_all_data",
    "create_vouchers",
    "approve_vouchers",
    "manage_parties",
    "manage_inventory",
    "manage_banking",
    "view_reports",
    "manage_hr",
    "approve_leaves",
    "approve_expenses",
  ]);

  it("keeps a legacy admin working across every module", () => {
    expect(hasPermission(legacyAdmin, "sales", "invoices", "write")).toBe(true);
    expect(hasPermission(legacyAdmin, "sales", "invoices", "approve")).toBe(true);
    expect(hasPermission(legacyAdmin, "purchases", "bills", "write")).toBe(true);
    expect(hasPermission(legacyAdmin, "accounting", "vouchers", "approve")).toBe(true);
    expect(hasPermission(legacyAdmin, "organization", "users", "write")).toBe(true);
    expect(hasPermission(legacyAdmin, "hr", "payroll", "approve")).toBe(true);
    // Modules the old vocabulary has no word for must not be narrowed away.
    expect(hasPermission(legacyAdmin, "taxation", "gst-returns", "write")).toBe(true);
    expect(hasPermission(legacyAdmin, "manufacturing", "operations", "write")).toBe(true);
  });

  it("maps a non-admin legacy role to just what it named", () => {
    const clerk = orgUserWithPerms(["view_reports", "manage_inventory", "approve_leaves"]);
    expect(hasPermission(clerk, "reports", "reports", "read")).toBe(true);
    expect(hasPermission(clerk, "reports", "reports", "export")).toBe(true);
    expect(hasPermission(clerk, "inventory", "items", "delete")).toBe(true);
    expect(hasPermission(clerk, "hr", "leaves", "approve")).toBe(true);
    // Not named -> not granted. A legacy clerk is not an administrator.
    expect(hasPermission(clerk, "organization", "users", "write")).toBe(false);
    expect(hasPermission(clerk, "sales", "invoices", "write")).toBe(false);
    expect(hasPermission(clerk, "hr", "payroll", "approve")).toBe(false);
  });

  it("grants read-only across modules for view_all_data", () => {
    const viewer = orgUserWithPerms(["view_all_data"]);
    expect(hasPermission(viewer, "sales", "invoices", "read")).toBe(true);
    expect(hasPermission(viewer, "accounting", "ledgers", "read")).toBe(true);
    expect(hasPermission(viewer, "sales", "invoices", "write")).toBe(false);
    expect(hasPermission(viewer, "sales", "invoices", "delete")).toBe(false);
  });

  it("denies unknown legacy capability strings rather than erroring", () => {
    const odd = orgUserWithPerms(["something_we_never_shipped"]);
    expect(hasPermission(odd, "sales", "invoices", "read")).toBe(false);
    expect(hasPermission(orgUserWithPerms([]), "sales", "invoices", "read")).toBe(false);
  });

  it("still handles the current object vocabulary unchanged", () => {
    const admin = orgUserWithPerms([
      { module: "*", actions: ["create", "read", "update", "delete", "approve", "export"] },
    ]);
    expect(hasPermission(admin, "sales", "invoices", "write")).toBe(true);
    expect(hasPermission(admin, "sales", "invoices", "approve")).toBe(true);
  });
});

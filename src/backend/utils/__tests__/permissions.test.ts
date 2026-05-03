import { describe, expect, it } from "vitest";
import { hasPermission, type OrgUserForPermissionCheck } from "../permissions";

const orgUserWithPerms = (permissions: unknown): OrgUserForPermissionCheck => ({
  role: { permissions },
});

describe("hasPermission", () => {
  it("grants when module + action both match exactly", () => {
    const u = orgUserWithPerms([{ module: "items", actions: ["read", "create"] }]);
    expect(hasPermission(u, "items", "read")).toBe(true);
    expect(hasPermission(u, "items", "create")).toBe(true);
  });

  it("denies when action does not match", () => {
    const u = orgUserWithPerms([{ module: "items", actions: ["read"] }]);
    expect(hasPermission(u, "items", "delete")).toBe(false);
  });

  it("denies when module does not match", () => {
    const u = orgUserWithPerms([{ module: "items", actions: ["read"] }]);
    expect(hasPermission(u, "users", "read")).toBe(false);
  });

  it("respects wildcard module — admins get every module's named actions", () => {
    const u = orgUserWithPerms([
      { module: "*", actions: ["create", "read", "update", "delete"] },
    ]);
    expect(hasPermission(u, "items", "delete")).toBe(true);
    expect(hasPermission(u, "vouchers", "read")).toBe(true);
  });

  it("respects wildcard action", () => {
    const u = orgUserWithPerms([{ module: "users", actions: ["*"] }]);
    expect(hasPermission(u, "users", "manage")).toBe(true);
    expect(hasPermission(u, "users", "anything-else")).toBe(true);
  });

  it("denies when permissions is null", () => {
    const u = orgUserWithPerms(null);
    expect(hasPermission(u, "items", "read")).toBe(false);
  });

  it("denies when permissions is malformed (not an array)", () => {
    const u = orgUserWithPerms({ not: "an array" });
    expect(hasPermission(u, "items", "read")).toBe(false);
  });

  it("denies when role is null", () => {
    const u: OrgUserForPermissionCheck = { role: null };
    expect(hasPermission(u, "items", "read")).toBe(false);
  });

  it("ignores garbage entries within the array", () => {
    const u = orgUserWithPerms([
      { module: "items" }, // missing actions
      { actions: ["read"] }, // missing module
      "garbage",
      null,
      42,
    ]);
    expect(hasPermission(u, "items", "read")).toBe(false);
  });

  it("evaluates multiple entries — any match grants", () => {
    const u = orgUserWithPerms([
      { module: "items", actions: ["read"] },
      { module: "vouchers", actions: ["create", "read"] },
    ]);
    expect(hasPermission(u, "vouchers", "create")).toBe(true);
    expect(hasPermission(u, "items", "read")).toBe(true);
    expect(hasPermission(u, "items", "delete")).toBe(false);
  });
});

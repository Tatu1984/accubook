import { describe, expect, it } from "vitest";
import {
  isValidScopes,
  methodToAction,
  resolveScopeTarget,
  scopesCover,
  type ApiScope,
} from "../api-scope";

describe("methodToAction", () => {
  it("maps GET / HEAD / OPTIONS → read", () => {
    expect(methodToAction("GET")).toBe("read");
    expect(methodToAction("get")).toBe("read");
    expect(methodToAction("HEAD")).toBe("read");
    expect(methodToAction("OPTIONS")).toBe("read");
  });

  it("maps DELETE → delete", () => {
    expect(methodToAction("DELETE")).toBe("delete");
    expect(methodToAction("delete")).toBe("delete");
  });

  it("maps POST / PATCH / PUT → write", () => {
    expect(methodToAction("POST")).toBe("write");
    expect(methodToAction("PATCH")).toBe("write");
    expect(methodToAction("PUT")).toBe("write");
  });
});

describe("resolveScopeTarget", () => {
  it("maps invoices URL to (sales, invoices)", () => {
    const t = resolveScopeTarget(
      "/api/organizations/demo-org/invoices",
      "GET"
    );
    expect(t).toEqual({ module: "sales", category: "invoices", action: "read" });
  });

  it("maps invoice detail URL the same way", () => {
    const t = resolveScopeTarget(
      "/api/organizations/demo-org/invoices/abc123",
      "PATCH"
    );
    expect(t).toEqual({ module: "sales", category: "invoices", action: "write" });
  });

  it("maps bills DELETE → (purchases, bills, delete)", () => {
    const t = resolveScopeTarget(
      "/api/organizations/X/bills/Y",
      "DELETE"
    );
    expect(t).toEqual({ module: "purchases", category: "bills", action: "delete" });
  });

  it("maps banking/import-statement → (banking, import)", () => {
    const t = resolveScopeTarget(
      "/api/organizations/X/banking/import-statement",
      "POST"
    );
    expect(t).toEqual({ module: "banking", category: "import", action: "write" });
  });

  it("returns null for unmapped paths", () => {
    expect(resolveScopeTarget("/api/health", "GET")).toBeNull();
    expect(
      resolveScopeTarget("/api/organizations/X/unknown-resource", "GET")
    ).toBeNull();
    expect(resolveScopeTarget("/some/random", "GET")).toBeNull();
  });
});

describe("scopesCover", () => {
  const target = { module: "sales", category: "invoices", action: "read" } as const;

  it("returns true on exact match", () => {
    const scopes: ApiScope[] = [
      { module: "sales", category: "invoices", actions: ["read"] },
    ];
    expect(scopesCover(scopes, target)).toBe(true);
  });

  it("returns false when action is missing", () => {
    const scopes: ApiScope[] = [
      { module: "sales", category: "invoices", actions: ["write"] },
    ];
    expect(scopesCover(scopes, target)).toBe(false);
  });

  it("module wildcard matches anything", () => {
    const scopes: ApiScope[] = [
      { module: "*", category: "invoices", actions: ["read"] },
    ];
    expect(scopesCover(scopes, target)).toBe(true);
  });

  it("category wildcard matches anything in module", () => {
    const scopes: ApiScope[] = [
      { module: "sales", category: "*", actions: ["read"] },
    ];
    expect(scopesCover(scopes, target)).toBe(true);
    expect(
      scopesCover(scopes, { module: "purchases", category: "bills", action: "read" })
    ).toBe(false);
  });

  it("full wildcard ** matches everything", () => {
    // The runtime validator accepts "*" as an action wildcard; the static
    // type intentionally narrows to read/write/delete, so cast here.
    const scopes = [
      { module: "*", category: "*", actions: ["*"] },
    ] as unknown as ApiScope[];
    expect(scopesCover(scopes, target)).toBe(true);
    expect(
      scopesCover(scopes, { module: "purchases", category: "bills", action: "delete" })
    ).toBe(true);
  });

  it("first matching scope wins; later denials don't matter", () => {
    const scopes: ApiScope[] = [
      { module: "sales", category: "invoices", actions: ["read", "write"] },
      { module: "sales", category: "invoices", actions: [] },
    ];
    expect(scopesCover(scopes, target)).toBe(true);
  });

  it("empty actions array never matches", () => {
    const scopes: ApiScope[] = [
      { module: "sales", category: "invoices", actions: [] },
    ];
    expect(scopesCover(scopes, target)).toBe(false);
  });
});

describe("isValidScopes", () => {
  it("accepts a normal scopes array", () => {
    expect(
      isValidScopes([
        { module: "sales", category: "invoices", actions: ["read", "write"] },
      ])
    ).toBe(true);
  });

  it("rejects empty arrays + non-arrays", () => {
    expect(isValidScopes([])).toBe(false);
    expect(isValidScopes(null)).toBe(false);
    expect(isValidScopes({})).toBe(false);
    expect(isValidScopes("foo")).toBe(false);
  });

  it("rejects unknown action values", () => {
    expect(
      isValidScopes([
        { module: "sales", category: "invoices", actions: ["nuke"] },
      ])
    ).toBe(false);
  });

  it("accepts wildcards", () => {
    expect(
      isValidScopes([
        { module: "*", category: "*", actions: ["*"] },
      ])
    ).toBe(true);
  });

  it("requires actions to be an array", () => {
    expect(
      isValidScopes([
        { module: "sales", category: "invoices", actions: "read" },
      ])
    ).toBe(false);
  });
});

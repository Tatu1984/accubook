import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveScopeTarget } from "@/backend/utils/api-scope";

/**
 * `withOrgAuth` now resolves every request through `API_RESOURCE_MAP` and
 * refuses anything it cannot resolve. That fail-closed default is what
 * makes the role model trustworthy — but it also means adding a route
 * under a brand-new URL segment, and forgetting to register it, produces
 * a 403 that only shows up when someone uses the feature.
 *
 * This walks the actual route tree and asserts every org-scoped path
 * resolves, so the failure lands in CI instead.
 */

const API_ROOT = join(process.cwd(), "src/app/api/organizations/[orgId]");

function routeDirs(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    // Dynamic segments contribute a concrete-looking value to the URL.
    const segment = entry.startsWith("[") ? "sample-id" : entry;
    const path = `${prefix}/${segment}`;
    if (readdirSync(full).includes("route.ts")) out.push(path);
    out.push(...routeDirs(full, path));
  }
  return out;
}

describe("every org-scoped route resolves to a permission target", () => {
  const paths = routeDirs(API_ROOT).map((p) => `/api/organizations/org-id${p}`);

  it("found the route tree", () => {
    expect(paths.length).toBeGreaterThan(50);
  });

  it.each(paths)("%s resolves", (path) => {
    const target = resolveScopeTarget(path, "GET");
    expect(
      target,
      `No API_RESOURCE_MAP entry for "${path.split("/")[4]}". ` +
        `withOrgAuth will 403 this route for every caller until it is registered.`
    ).not.toBeNull();
  });

  it("the organization record itself resolves", () => {
    expect(resolveScopeTarget("/api/organizations/org-id", "GET")).toEqual({
      module: "organization",
      category: "profile",
      action: "read",
    });
    expect(resolveScopeTarget("/api/organizations/org-id", "PATCH")).toEqual({
      module: "organization",
      category: "profile",
      action: "write",
    });
  });

  it("does not resolve paths outside the org scope", () => {
    expect(resolveScopeTarget("/api/health", "GET")).toBeNull();
    expect(resolveScopeTarget("/api/auth/register", "POST")).toBeNull();
  });
});

/**
 * Permission checks against an OrgUser's role.permissions JSON.
 *
 * Pulled out of with-org-auth.ts so it can be unit-tested without
 * dragging the auth/next-auth import chain into the test runtime.
 *
 * Usage:
 *   if (!hasPermission(orgUser, "items", "delete")) {
 *     return forbidden("Cannot delete items");
 *   }
 *
 * Permission shape (in role.permissions): `{ module, actions }[]`
 *   - `module: "*"` matches every module.
 *   - `actions: ["*"]` matches every action.
 *   - Anything malformed is silently denied — never errors at runtime.
 */

export type Permission = {
  module: string;
  actions: string[];
};

/** Just the slice of OrgUser this helper needs. Decoupled from Prisma types. */
export type OrgUserForPermissionCheck = {
  role: {
    permissions: unknown;
  } | null;
};

export function hasPermission(
  orgUser: OrgUserForPermissionCheck,
  module: string,
  action: string
): boolean {
  const perms = orgUser.role?.permissions;
  if (!Array.isArray(perms)) return false;

  for (const raw of perms as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Partial<Permission>;
    const moduleMatch = p.module === module || p.module === "*";
    if (!moduleMatch) continue;
    if (!Array.isArray(p.actions)) continue;
    if (p.actions.includes(action) || p.actions.includes("*")) return true;
  }
  return false;
}

/**
 * Permission checks against an OrgUser's role.permissions JSON.
 *
 * Pulled out of with-org-auth.ts so it can be unit-tested without
 * dragging the auth/next-auth import chain into the test runtime.
 *
 * Usage:
 *   if (!hasPermission(orgUser, "inventory", "items", "delete")) {
 *     return forbidden("Cannot delete items");
 *   }
 *
 * Permission shape (in role.permissions): `{ module, category, actions }[]`
 *   - `module: "*"` matches every module.
 *   - `category: "*"`, or a missing `category`, matches every category.
 *   - `actions: ["*"]` matches every action.
 *   - Anything malformed is silently denied — never errors at runtime.
 *
 * `module` and `category` come from `API_RESOURCE_MAP` in api-scope.ts,
 * which is also what resolves a request URL. One table, so a grant and a
 * route cannot describe the same resource differently.
 *
 * Actions are the three HTTP-derived ones (`read` / `write` / `delete`)
 * plus business actions that no HTTP method implies: `approve` (post to
 * the ledger, sign off an approval step) and `export` (bulk extract).
 */

export type PermissionAction = "read" | "write" | "delete" | "approve" | "export" | "*";

/**
 * Action names that older stored grants used, mapped to the action they
 * satisfy today.
 *
 * Roles live in the database, and the rows already out there were written
 * with `create` / `update` rather than the single `write` that
 * `methodToAction` now derives from POST and PATCH. Without this, shipping
 * the unified vocabulary would deny every write to every existing user —
 * including the seeded ADMIN, whose grant reads
 * `["create", "read", "update", "delete", "approve", "export"]`.
 *
 * The mapping only ever accepts what the old name already meant, so it
 * widens nothing. Newly seeded roles use `write` directly; this exists so
 * a deploy does not require a data migration to stay usable.
 */
const LEGACY_ACTION_ALIASES: Record<string, string[]> = {
  write: ["create", "update"],
};

export type Permission = {
  module: string;
  /** Optional for backward compatibility with older stored grants. */
  category?: string;
  actions: PermissionAction[] | string[];
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
  category: string,
  action: string
): boolean {
  const perms = orgUser.role?.permissions;
  if (!Array.isArray(perms)) return false;

  for (const raw of perms as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Partial<Permission>;

    if (typeof p.module !== "string") continue;
    if (p.module !== module && p.module !== "*") continue;

    // A grant with no category is treated as organization-wide within its
    // module. Older grants were written that way, and widening rather than
    // narrowing keeps an upgrade from silently locking people out.
    const cat = typeof p.category === "string" ? p.category : "*";
    if (cat !== category && cat !== "*") continue;

    if (!Array.isArray(p.actions)) continue;
    const actions = p.actions as string[];
    if (actions.includes(action) || actions.includes("*")) return true;

    const aliases = LEGACY_ACTION_ALIASES[action];
    if (aliases && aliases.some((a) => actions.includes(a))) return true;
  }
  return false;
}

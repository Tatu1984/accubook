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

/** Every action a full administrator holds. */
const ALL_ACTIONS = ["create", "read", "update", "delete", "approve", "export"];

/**
 * The oldest stored grants are a flat array of capability strings rather
 * than `{ module, actions }` objects:
 *
 *   ["manage_organization", "manage_users", "view_reports", …]
 *
 * Those rows are still in production — the seed that wrote them predates
 * the `{module, category, actions}` shape — and `hasPermission` skipped
 * them entirely (they are strings, not objects), which denied every
 * request and locked the holder out of their organization completely.
 *
 * Translating them here rather than migrating the rows follows the same
 * reasoning as LEGACY_ACTION_ALIASES above: a deploy should not require a
 * data migration to stay usable, and any deployment of this code carrying
 * old rows gets the fix for free.
 */
const LEGACY_STRING_GRANTS: Record<string, Permission[]> = {
  view_all_data: [{ module: "*", actions: ["read"] }],
  view_reports: [{ module: "reports", actions: ["read", "export"] }],
  create_vouchers: [{ module: "accounting", category: "vouchers", actions: ["create", "update"] }],
  approve_vouchers: [{ module: "accounting", category: "vouchers", actions: ["approve"] }],
  manage_parties: [{ module: "parties", actions: ALL_ACTIONS }],
  manage_inventory: [{ module: "inventory", actions: ALL_ACTIONS }],
  manage_banking: [{ module: "banking", actions: ALL_ACTIONS }],
  manage_hr: [{ module: "hr", actions: ALL_ACTIONS }],
  approve_leaves: [{ module: "hr", category: "leaves", actions: ["approve"] }],
  approve_expenses: [{ module: "hr", category: "expense-claims", actions: ["approve"] }],
  manage_organization: [{ module: "organization", actions: ALL_ACTIONS }],
  manage_users: [{ module: "organization", category: "users", actions: ALL_ACTIONS }],
  manage_roles: [{ module: "organization", category: "roles", actions: ALL_ACTIONS }],
};

/**
 * A legacy role holding any of these was an administrator, and the code
 * that issued it enforced no per-route permissions at all — so in practice
 * the holder had unrestricted access.
 *
 * Mapping such a role string-by-string would *narrow* it (the old
 * vocabulary has no word for sales, purchases, taxation or manufacturing),
 * so an admin would silently lose the ability to raise an invoice. Grant
 * the full set instead: it preserves exactly the access the holder already
 * exercises, and widening on upgrade is the documented rule here.
 */
const LEGACY_ADMIN_MARKERS = ["manage_organization", "manage_users", "manage_roles"];

/** Translate a flat legacy capability array into the current grant shape. */
function normalizeLegacyStringGrants(capabilities: string[]): Permission[] {
  if (capabilities.some((c) => LEGACY_ADMIN_MARKERS.includes(c))) {
    return [{ module: "*", actions: ALL_ACTIONS }];
  }
  return capabilities.flatMap((c) => LEGACY_STRING_GRANTS[c] ?? []);
}

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
  const stored = orgUser.role?.permissions;
  if (!Array.isArray(stored)) return false;

  // Mixed arrays are not a shape anything wrote; the flat-string form is
  // all-or-nothing, so a single string element identifies it.
  const perms: unknown[] = stored.some((p) => typeof p === "string")
    ? normalizeLegacyStringGrants(stored.filter((p): p is string => typeof p === "string"))
    : (stored as unknown[]);

  for (const raw of perms) {
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

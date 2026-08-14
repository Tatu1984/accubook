import type { Prisma } from "@/generated/prisma";
import type { Permission } from "@/backend/utils/permissions";

type Tx = Prisma.TransactionClient;

/**
 * The system roles, expressed in the one permission vocabulary the app
 * actually enforces: `{ module, category, actions }`, matching
 * `API_RESOURCE_MAP` in `api-scope.ts`.
 *
 * There used to be four incompatible vocabularies in the codebase:
 *
 *   1. the structured `{ module, actions }` this seed emitted, using
 *      module names like "accounting" and "banking";
 *   2. the module names the route gates actually checked — "vouchers",
 *      "payments", "settings" — which shared *nothing* with (1), so the
 *      ACCOUNTANT role was denied by every gate that existed;
 *   3. a flat string list in `roles/route.ts` ("approve_vouchers", …)
 *      shown to users as if it meant something;
 *   4. another flat string list written by `POST /api/organizations`,
 *      which produced an "Admin" role that satisfied no check at all.
 *
 * Everything now derives from `API_RESOURCE_MAP`, so a permission grant
 * and a URL resolve through the same table.
 *
 * `SUPER_ADMIN` and `OWNER` are recognised as aliases of ADMIN by the
 * revocation endpoint; they are not seeded separately.
 */

export type SystemRoleName = "ADMIN" | "ACCOUNTANT" | "VIEWER";

export const SYSTEM_ROLES: {
  id: string;
  name: SystemRoleName;
  description: string;
  permissions: Permission[];
}[] = [
  {
    id: "admin-role",
    name: "ADMIN",
    description: "Full access to all features",
    permissions: [
      { module: "*", category: "*", actions: ["*"] },
    ],
  },
  {
    id: "accountant-role",
    name: "ACCOUNTANT",
    description:
      "Records and approves day-to-day transactions. Cannot administer the organization.",
    permissions: [
      // The books.
      { module: "accounting", category: "*", actions: ["read", "write", "delete", "approve"] },
      { module: "sales", category: "*", actions: ["read", "write", "delete", "approve"] },
      { module: "purchases", category: "*", actions: ["read", "write", "delete", "approve"] },
      { module: "parties", category: "*", actions: ["read", "write", "delete"] },
      { module: "banking", category: "*", actions: ["read", "write"] },
      { module: "taxation", category: "*", actions: ["read", "write"] },
      { module: "inventory", category: "*", actions: ["read", "write"] },
      { module: "reports", category: "*", actions: ["read", "export"] },
      // Visibility into org administration, but no changes: an accountant
      // needs to see who approved what without being able to grant
      // themselves the ability to approve it.
      { module: "organization", category: "approvals", actions: ["read", "write"] },
      { module: "organization", category: "audit-logs", actions: ["read"] },
      { module: "organization", category: "branches", actions: ["read"] },
      // Read-only on the org record, the user list and the role list. The
      // app shell loads all three to render itself, so withholding read
      // here breaks the UI rather than protecting anything.
      { module: "organization", category: "profile", actions: ["read"] },
      { module: "organization", category: "users", actions: ["read"] },
      { module: "organization", category: "roles", actions: ["read"] },
      // Own notifications. Every notification route filters by the calling
      // user's id, so write here only ever touches your own inbox.
      { module: "organization", category: "notifications", actions: ["read", "write", "delete"] },
    ],
  },
  {
    id: "viewer-role",
    name: "VIEWER",
    description: "Read-only access",
    permissions: [
      { module: "*", category: "*", actions: ["read", "export"] },
      // Dismissing your own notifications is not a write to the books.
      // Scoped to the caller's own rows by the route itself.
      { module: "organization", category: "notifications", actions: ["write", "delete"] },
    ],
  },
];

/**
 * Create or refresh the system roles.
 *
 * Idempotent, and deliberately *does* overwrite `permissions` on an
 * existing row: these are system roles whose definition lives in this
 * file, so a deploy that changes the grants should take effect. Custom
 * roles (anything not in SYSTEM_ROLES) are never touched.
 */
export async function ensureSystemRoles(tx: Tx): Promise<Record<SystemRoleName, string>> {
  const ids = {} as Record<SystemRoleName, string>;
  for (const role of SYSTEM_ROLES) {
    const row = await tx.role.upsert({
      where: { id: role.id },
      update: {
        name: role.name,
        description: role.description,
        permissions: role.permissions as unknown as Prisma.InputJsonValue,
        isSystem: true,
      },
      create: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions as unknown as Prisma.InputJsonValue,
        isSystem: true,
      },
      select: { id: true },
    });
    ids[role.name] = row.id;
  }
  return ids;
}

/**
 * The admin role id, creating the system roles first if this environment
 * has never been seeded. Registration used to 500 with "System not
 * configured" when the seed had not run — which is every production
 * environment, since the seed correctly refuses to run there.
 */
export async function getOrCreateAdminRoleId(tx: Tx): Promise<string> {
  const existing = await tx.role.findFirst({
    where: { name: "ADMIN", isSystem: true },
    select: { id: true },
  });
  if (existing) return existing.id;
  const ids = await ensureSystemRoles(tx);
  return ids.ADMIN;
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, forbidden, notFound } from "@/backend/utils/with-org-auth";
import { hasPermission } from "@/backend/utils/permissions";
import { logger } from "@/backend/utils/logger";
import { SCOPE_TREE } from "@/backend/utils/api-scope";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The permission vocabulary, for anything that renders a role editor.
 *
 * This used to be a flat list of invented strings ("approve_vouchers",
 * "manage_taxes", …) that nothing enforced — a UI could offer them, a
 * role could store them, and no check would ever consult them. It is now
 * the same `SCOPE_TREE` the API-key scope picker uses, which is derived
 * from `API_RESOURCE_MAP`, which is what request URLs resolve through.
 * One vocabulary end to end.
 */
export const AVAILABLE_ACTIONS = ["read", "write", "delete", "approve", "export"] as const;

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const includeUserCount = searchParams.get("includeUserCount") === "true";

    // Get all system roles
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
    });

    if (includeUserCount) {
      // Get user counts per role for this organization
      const roleCounts = await prisma.organizationUser.groupBy({
        by: ["roleId"],
        where: { organizationId: orgId },
        _count: { roleId: true },
      });

      const countMap = new Map(
        roleCounts.map((rc) => [rc.roleId, rc._count.roleId])
      );

      const rolesWithCount = roles.map((role) => ({
        ...role,
        userCount: countMap.get(role.id) || 0,
      }));

      return NextResponse.json({
        data: rolesWithCount,
        availablePermissions: SCOPE_TREE,
        availableActions: AVAILABLE_ACTIONS,
      });
    }

    return NextResponse.json({
      data: roles,
      availablePermissions: SCOPE_TREE,
      availableActions: AVAILABLE_ACTIONS,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching roles");
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 }
    );
  }
});

/**
 * Role authoring.
 *
 * The Users → Roles screen offered "Create Role" plus Edit and Delete on every
 * card, and this route exported only GET — the create dialog's submit button
 * simply closed the dialog and the two card buttons did nothing at all.
 *
 * Permission strings are validated against the same SCOPE_TREE vocabulary the
 * API-key scope picker uses, so a role can never be saved granting something
 * no check will ever consult.
 */

/**
 * A grant is `{ module, category, actions }` — the same shape `hasPermission`
 * reads. Modules and categories are checked against SCOPE_TREE so a role can
 * never be saved granting something no check will ever consult; "*" is allowed
 * on either field to mean "everything at this level".
 */
const MODULE_CATEGORIES = new Map<string, Set<string>>(
  SCOPE_TREE.map((group) => [
    group.module,
    new Set(group.categories.map((c) => c.category)),
  ])
);

const permissionSchema = z
  .object({
    module: z.string().min(1),
    category: optional(z.string().min(1)),
    actions: z.array(z.enum([...AVAILABLE_ACTIONS, "*"])).min(1),
  })
  .refine(
    (grant) => {
      if (grant.module === "*") return true;
      const categories = MODULE_CATEGORIES.get(grant.module);
      if (!categories) return false;
      if (!grant.category || grant.category === "*") return true;
      return categories.has(grant.category);
    },
    { message: "Unknown module or category for this permission grant" }
  );

const roleBodySchema = z.object({
  name: z.string().min(1, "Role name is required").max(60),
  description: optional(z.string().max(200)),
  permissions: z.array(permissionSchema).default([]),
});

export const POST = withOrgAuth(async (request, { orgUser }) => {
  try {
    if (!hasPermission(orgUser, "organization", "users", "write")) {
      return forbidden("You don't have permission to manage roles");
    }

    const body = await request.json();
    const data = roleBodySchema.parse(body);

    const clash = await prisma.role.findFirst({
      where: { name: data.name },
      select: { id: true },
    });
    if (clash) return badRequest(`A role named "${data.name}" already exists`);

    const role = await prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions,
        isSystem: false,
      },
    });

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating role");
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
});

export const PATCH = withOrgAuth(async (request, { orgUser }) => {
  try {
    if (!hasPermission(orgUser, "organization", "users", "write")) {
      return forbidden("You don't have permission to manage roles");
    }

    const body = await request.json();
    const { roleId, ...rest } = body as { roleId?: string };
    if (!roleId) return badRequest("Role ID is required");

    const data = roleBodySchema.partial().parse(rest);

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return notFound("Role not found");
    // System roles back the permission checks themselves; editing them would
    // change what every organization on the deployment can do.
    if (role.isSystem) return forbidden("System roles cannot be edited");

    if (data.name && data.name !== role.name) {
      const clash = await prisma.role.findFirst({
        where: { name: data.name, NOT: { id: roleId } },
        select: { id: true },
      });
      if (clash) return badRequest(`A role named "${data.name}" already exists`);
    }

    const updated = await prisma.role.update({
      where: { id: roleId },
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating role");
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
});

export const DELETE = withOrgAuth(async (request, { orgUser }) => {
  try {
    if (!hasPermission(orgUser, "organization", "users", "delete")) {
      return forbidden("You don't have permission to manage roles");
    }

    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get("roleId");
    if (!roleId) return badRequest("Role ID is required");

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { _count: { select: { organizationUsers: true } } },
    });
    if (!role) return notFound("Role not found");
    if (role.isSystem) return forbidden("System roles cannot be deleted");
    if (role._count.organizationUsers > 0) {
      return badRequest(
        `${role._count.organizationUsers} user(s) still hold this role — reassign them first`
      );
    }

    await prisma.role.delete({ where: { id: roleId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting role");
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 });
  }
});

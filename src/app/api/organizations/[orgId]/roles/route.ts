import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
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

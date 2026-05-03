import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, forbidden, hasPermission } from "@/backend/utils/with-org-auth";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (request, { orgId, orgUser }) => {
  try {
    if (!hasPermission(orgUser, "audit-logs", "read")) {
      return forbidden("You don't have permission to view audit logs");
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const entityType = searchParams.get("entityType");
    const userId = searchParams.get("userId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
      }
      if (endDate) {
        (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Get unique entity types and actions for filters
    const [entityTypes, actions] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ["entityType"],
        where: { organizationId: orgId },
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        where: { organizationId: orgId },
      }),
    ]);

    return NextResponse.json({
      data: logs,
      filters: {
        entityTypes: entityTypes.map((e) => e.entityType),
        actions: actions.map((a) => a.action),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
});

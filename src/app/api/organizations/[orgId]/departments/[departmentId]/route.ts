import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateDepartmentSchema = z.object({
  name: optional(z.string().min(1)),
  code: optional(z.string()),
  description: optional(z.string()),
  headId: optional(z.string()),
  isActive: optional(z.boolean()),
});

/** A department is reachable by this org when it holds one of their employees (or none at all). */
async function assertVisible(departmentId: string, orgId: string) {
  return prisma.department.findFirst({
    where: {
      id: departmentId,
      OR: [
        { employees: { some: { organizationId: orgId } } },
        { employees: { none: {} } },
      ],
    },
    include: { _count: { select: { employees: true } } },
  });
}

export const PATCH = withOrgAuth<{ departmentId: string }>(
  async (request, { orgId, params }) => {
    try {
      const body = await request.json();
      const data = updateDepartmentSchema.parse(body);

      const existing = await assertVisible(params.departmentId, orgId);
      if (!existing) return notFound("Department not found");

      if (data.code && data.code !== existing.code) {
        const clash = await prisma.department.findFirst({
          where: { code: data.code, NOT: { id: params.departmentId } },
          select: { id: true },
        });
        if (clash) return badRequest(`Department code ${data.code} already exists`);
      }

      if (data.headId) {
        const head = await prisma.employee.findFirst({
          where: { id: data.headId, organizationId: orgId },
          select: { id: true },
        });
        if (!head) return badRequest("The selected department head was not found");
      }

      const department = await prisma.department.update({
        where: { id: params.departmentId },
        data,
      });
      return NextResponse.json(department);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return badRequest("Validation failed", error.issues);
      }
      logger.error({ err: error }, "Error updating department");
      return NextResponse.json(
        { error: "Failed to update department" },
        { status: 500 }
      );
    }
  }
);

/**
 * Deleting a department that still has staff would orphan their records, so a
 * populated department is deactivated instead and the response says which
 * happened.
 */
export const DELETE = withOrgAuth<{ departmentId: string }>(
  async (_request, { orgId, params }) => {
    try {
      const existing = await assertVisible(params.departmentId, orgId);
      if (!existing) return notFound("Department not found");

      if (existing._count.employees > 0) {
        await prisma.department.update({
          where: { id: params.departmentId },
          data: { isActive: false },
        });
        return NextResponse.json({ success: true, softDeleted: true });
      }

      await prisma.department.delete({ where: { id: params.departmentId } });
      return NextResponse.json({ success: true, softDeleted: false });
    } catch (error) {
      logger.error({ err: error }, "Error deleting department");
      return NextResponse.json(
        { error: "Failed to delete department" },
        { status: 500 }
      );
    }
  }
);

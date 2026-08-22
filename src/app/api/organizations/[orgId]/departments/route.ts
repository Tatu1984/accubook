import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Departments.
 *
 * The HR departments screen called this endpoint and handled the 404 by
 * quietly leaving the list empty; its "Create Department" handler skipped the
 * network entirely and popped a success toast, so departments appeared to save
 * and never existed.
 *
 * Department is a global table in the schema (no organizationId column), so
 * scoping is by the employees attached to it: a department is visible to an
 * organization when it has no employees yet, or has at least one of theirs.
 */

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const departments = await prisma.department.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        OR: [
          { employees: { some: { organizationId: orgId } } },
          { employees: { none: {} } },
        ],
      },
      include: {
        employees: {
          where: { organizationId: orgId },
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const headIds = departments
      .map((d) => d.headId)
      .filter((id): id is string => !!id);
    const heads = headIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: headIds }, organizationId: orgId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const headById = new Map(heads.map((h) => [h.id, h]));

    return NextResponse.json({
      data: departments.map((d) => {
        const head = d.headId ? headById.get(d.headId) : undefined;
        return {
          id: d.id,
          name: d.name,
          code: d.code,
          description: d.description,
          headId: d.headId,
          headName: head
            ? [head.firstName, head.lastName].filter(Boolean).join(" ")
            : null,
          employeeCount: d.employees.length,
          isActive: d.isActive,
        };
      }),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching departments");
    return NextResponse.json(
      { error: "Failed to fetch departments" },
      { status: 500 }
    );
  }
});

const createDepartmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: optional(z.string()),
  description: optional(z.string()),
  headId: optional(z.string()),
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const data = createDepartmentSchema.parse(body);

    if (data.code) {
      const clash = await prisma.department.findFirst({
        where: { code: data.code },
        select: { id: true },
      });
      if (clash) {
        return badRequest(`Department code ${data.code} already exists`);
      }
    }

    if (data.headId) {
      const head = await prisma.employee.findFirst({
        where: { id: data.headId, organizationId: orgId },
        select: { id: true },
      });
      if (!head) return badRequest("The selected department head was not found");
    }

    const department = await prisma.department.create({ data });
    return NextResponse.json(department, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating department");
    return NextResponse.json(
      { error: "Failed to create department" },
      { status: 500 }
    );
  }
});

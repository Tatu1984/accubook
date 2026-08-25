import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Leave types.
 *
 * `POST /leaves` requires a `leaveTypeId`, but nothing exposed the list of
 * types, so the "Apply for Leave" form shipped with four hardcoded options
 * ("Casual Leave (9 available)") that mapped to no row in the database and
 * could never produce a valid request.
 *
 * LeaveType was a global catalogue rather than an org-scoped table until
 * migration 17, and this route read it with no scoping at all — so every
 * organization saw, and could edit against, every other organization's leave
 * types. Each org now owns its own set.
 */

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const leaveTypes = await prisma.leaveType.findMany({
      where: {
        organizationId: orgId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: leaveTypes });
  } catch (error) {
    logger.error({ err: error }, "Error fetching leave types");
    return NextResponse.json(
      { error: "Failed to fetch leave types" },
      { status: 500 }
    );
  }
});

const createLeaveTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  annualQuota: z.number().min(0),
  carryForward: z.boolean().default(false),
  maxCarryForward: optional(z.number().min(0)),
  encashable: z.boolean().default(false),
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const data = createLeaveTypeSchema.parse(body);

    const existing = await prisma.leaveType.findFirst({
      where: { organizationId: orgId, code: data.code },
      select: { id: true },
    });
    if (existing) {
      return badRequest(`Leave type code ${data.code} already exists`);
    }

    const leaveType = await prisma.leaveType.create({
      data: { ...data, organizationId: orgId },
    });
    return NextResponse.json(leaveType, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating leave type");
    return NextResponse.json(
      { error: "Failed to create leave type" },
      { status: 500 }
    );
  }
});

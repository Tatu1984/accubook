import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateBranchSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  gstNo: z.string().optional(),
  isHeadOffice: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const GET = withOrgAuth<{ branchId: string }>(async (_request, { orgId, params }) => {
  try {
    const { branchId } = params;

    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        organizationId: orgId,
      },
    });

    if (!branch) {
      return notFound("Branch not found");
    }

    return NextResponse.json(branch);
  } catch (error) {
    logger.error({ err: error }, "Error fetching branch");
    return NextResponse.json(
      { error: "Failed to fetch branch" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth<{ branchId: string }>(async (request, { orgId, params }) => {
  try {
    const { branchId } = params;
    const body = await request.json();
    const validatedData = updateBranchSchema.parse(body);

    // If this is set as head office, unset others
    if (validatedData.isHeadOffice) {
      await prisma.branch.updateMany({
        where: {
          organizationId: orgId,
          isHeadOffice: true,
          NOT: { id: branchId },
        },
        data: {
          isHeadOffice: false,
        },
      });
    }

    const branch = await prisma.branch.update({
      where: {
        id: branchId,
        organizationId: orgId,
      },
      data: {
        ...validatedData,
        email: validatedData.email || null,
      },
    });

    return NextResponse.json(branch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating branch");
    return NextResponse.json(
      { error: "Failed to update branch" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth<{ branchId: string }>(async (_request, { orgId, params }) => {
  try {
    const { branchId } = params;

    // Soft delete by setting isActive to false
    await prisma.branch.update({
      where: {
        id: branchId,
        organizationId: orgId,
      },
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting branch");
    return NextResponse.json(
      { error: "Failed to delete branch" },
      { status: 500 }
    );
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBranchSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  address: optional(z.string()),
  city: optional(z.string()),
  state: optional(z.string()),
  country: z.string().default("IN"),
  postalCode: optional(z.string()),
  phone: optional(z.string()),
  email: optional(z.string().email()).or(z.literal("")),
  gstNo: optional(z.string()),
  isHeadOffice: z.boolean().default(false),
});

export const GET = withOrgAuth(async (_request, { orgId }) => {
  try {
    const branches = await prisma.branch.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
      },
      orderBy: [
        { isHeadOffice: "desc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(branches);
  } catch (error) {
    logger.error({ err: error }, "Error fetching branches");
    return NextResponse.json(
      { error: "Failed to fetch branches" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createBranchSchema.parse(body);

    // If this is set as head office, unset others
    if (validatedData.isHeadOffice) {
      await prisma.branch.updateMany({
        where: {
          organizationId: orgId,
          isHeadOffice: true,
        },
        data: {
          isHeadOffice: false,
        },
      });
    }

    const branch = await prisma.branch.create({
      data: {
        organizationId: orgId,
        ...validatedData,
        email: validatedData.email || null,
      },
    });

    return NextResponse.json(branch, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating branch");
    return NextResponse.json(
      { error: "Failed to create branch" },
      { status: 500 }
    );
  }
});

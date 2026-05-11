import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { z } from "zod";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createCostCenterSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    code: z.string().optional(),
    parentId: z.string().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

const updateCostCenterSchema = z
  .object({
    id: z.string().min(1, "Cost center ID is required"),
    name: z.string().min(1).optional(),
    code: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");
    const flat = searchParams.get("flat") === "true";

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    if (flat) {
      // Return flat list
      const costCenters = await prisma.costCenter.findMany({
        where,
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ data: costCenters });
    }

    // Return hierarchical structure
    const costCenters = await prisma.costCenter.findMany({
      where: {
        ...where,
        parentId: null,
      },
      include: {
        children: {
          include: {
            children: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: costCenters });
  } catch (error) {
    logger.error({ err: error }, "Error fetching cost centers");
    return NextResponse.json(
      { error: "Failed to fetch cost centers" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createCostCenterSchema.parse(body);

    // Check for duplicate name
    const existing = await prisma.costCenter.findUnique({
      where: {
        organizationId_name: {
          organizationId: orgId,
          name: validatedData.name,
        },
      },
    });

    if (existing) {
      return badRequest("Cost center with this name already exists");
    }

    const costCenter = await prisma.costCenter.create({
      data: {
        organizationId: orgId,
        name: validatedData.name,
        code: validatedData.code,
        parentId: validatedData.parentId,
        isActive: validatedData.isActive,
      },
    });

    return NextResponse.json(costCenter, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating cost center");
    return NextResponse.json(
      { error: "Failed to create cost center" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { id, ...updateData } = updateCostCenterSchema.parse(body);

    const existing = await prisma.costCenter.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) return notFound("Cost center not found");

    // Refuse to move a cost center under a parent from another org.
    if (updateData.parentId) {
      const parent = await prisma.costCenter.findFirst({
        where: { id: updateData.parentId, organizationId: orgId },
        select: { id: true },
      });
      if (!parent) return badRequest("Parent cost center not found in this organization");
    }

    const costCenter = await prisma.costCenter.update({
      where: { id, organizationId: orgId },
      data: updateData,
    });

    return NextResponse.json(costCenter);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating cost center");
    return NextResponse.json(
      { error: "Failed to update cost center" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return badRequest("Cost center ID is required");
    }

    const existing = await prisma.costCenter.findFirst({
      where: { id, organizationId: orgId },
      include: {
        _count: { select: { voucherEntries: true, children: true } },
      },
    });
    if (!existing) return notFound("Cost center not found");

    // Soft-delete if referenced by voucher entries or has children — never break books.
    if (existing._count.voucherEntries > 0 || existing._count.children > 0) {
      await prisma.costCenter.update({
        where: { id, organizationId: orgId },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, softDeleted: true });
    }

    await prisma.costCenter.delete({
      where: { id, organizationId: orgId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting cost center");
    return NextResponse.json(
      { error: "Failed to delete cost center" },
      { status: 500 }
    );
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createWarehouseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().optional(),
  branchId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const whereClause: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (branchId) {
      whereClause.branchId = branchId;
    }

    if (!includeInactive) {
      whereClause.isActive = true;
    }

    const warehouses = await prisma.warehouse.findMany({
      where: whereClause,
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            stocks: true,
          },
        },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(warehouses);
  } catch (error) {
    logger.error({ err: error }, "Error fetching warehouses");
    return NextResponse.json(
      { error: "Failed to fetch warehouses" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createWarehouseSchema.parse(body);

    // Check for unique name within organization
    const existingWarehouse = await prisma.warehouse.findFirst({
      where: {
        organizationId: orgId,
        name: validatedData.name,
      },
    });

    if (existingWarehouse) {
      return badRequest("A warehouse with this name already exists");
    }

    // If this warehouse is set as default, unset other defaults
    if (validatedData.isDefault) {
      await prisma.warehouse.updateMany({
        where: {
          organizationId: orgId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        organizationId: orgId,
        ...validatedData,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(warehouse, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating warehouse");
    return NextResponse.json(
      { error: "Failed to create warehouse" },
      { status: 500 }
    );
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateWarehouseSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const GET = withOrgAuth<{ warehouseId: string }>(async (_request, { orgId, params }) => {
  try {
    const { warehouseId } = params;

    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId: orgId,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        stocks: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
          },
        },
      },
    });

    if (!warehouse) {
      return notFound("Warehouse not found");
    }

    return NextResponse.json(warehouse);
  } catch (error) {
    logger.error({ err: error }, "Error fetching warehouse");
    return NextResponse.json(
      { error: "Failed to fetch warehouse" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth<{ warehouseId: string }>(async (request, { orgId, params }) => {
  try {
    const { warehouseId } = params;
    const body = await request.json();
    const validatedData = updateWarehouseSchema.parse(body);

    // Check if warehouse exists
    const existingWarehouse = await prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId: orgId,
      },
    });

    if (!existingWarehouse) {
      return notFound("Warehouse not found");
    }

    // Check for name uniqueness if name is being changed
    if (validatedData.name && validatedData.name !== existingWarehouse.name) {
      const nameExists = await prisma.warehouse.findFirst({
        where: {
          organizationId: orgId,
          name: validatedData.name,
          NOT: { id: warehouseId },
        },
      });

      if (nameExists) {
        return badRequest("A warehouse with this name already exists");
      }
    }

    // If setting as default, unset other defaults
    if (validatedData.isDefault) {
      await prisma.warehouse.updateMany({
        where: {
          organizationId: orgId,
          isDefault: true,
          NOT: { id: warehouseId },
        },
        data: {
          isDefault: false,
        },
      });
    }

    const warehouse = await prisma.warehouse.update({
      where: { id: warehouseId },
      data: validatedData,
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(warehouse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating warehouse");
    return NextResponse.json(
      { error: "Failed to update warehouse" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth<{ warehouseId: string }>(async (_request, { orgId, params }) => {
  try {
    const { warehouseId } = params;

    // Check if warehouse exists
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId: orgId,
      },
    });

    if (!warehouse) {
      return notFound("Warehouse not found");
    }

    // Check if warehouse has stock
    const hasStock = await prisma.stock.findFirst({
      where: { warehouseId },
    });

    if (hasStock) {
      // Soft delete
      await prisma.warehouse.update({
        where: { id: warehouseId },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, softDeleted: true });
    }

    // Hard delete
    await prisma.warehouse.delete({
      where: { id: warehouseId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting warehouse");
    return NextResponse.json(
      { error: "Failed to delete warehouse" },
      { status: 500 }
    );
  }
});

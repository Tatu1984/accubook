import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

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
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; warehouseId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, warehouseId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
    }

    return NextResponse.json(warehouse);
  } catch (error) {
    console.error("Error fetching warehouse:", error);
    return NextResponse.json(
      { error: "Failed to fetch warehouse" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; warehouseId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, warehouseId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
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
        return NextResponse.json(
          { error: "A warehouse with this name already exists" },
          { status: 400 }
        );
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
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating warehouse:", error);
    return NextResponse.json(
      { error: "Failed to update warehouse" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; warehouseId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, warehouseId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if warehouse exists
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId: orgId,
      },
    });

    if (!warehouse) {
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
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
    console.error("Error deleting warehouse:", error);
    return NextResponse.json(
      { error: "Failed to delete warehouse" },
      { status: 500 }
    );
  }
}

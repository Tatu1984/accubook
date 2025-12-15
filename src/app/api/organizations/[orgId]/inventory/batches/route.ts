import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBatchSchema = z.object({
  itemId: z.string(),
  warehouseId: z.string(),
  batchNumber: z.string().min(1),
  serialNumber: z.string().optional(),
  manufacturingDate: z.string().transform(s => new Date(s)).optional(),
  expiryDate: z.string().transform(s => new Date(s)).optional(),
  quantity: z.number().positive(),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative().optional(),
});

const updateBatchSchema = z.object({
  quantity: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "CONSUMED"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");
    const warehouseId = searchParams.get("warehouseId");
    const status = searchParams.get("status");
    const expiringWithin = searchParams.get("expiringWithin"); // days
    const view = searchParams.get("view") || "list";

    // Build where clause
    const where: Record<string, unknown> = {
      item: { organizationId: orgId },
    };

    if (itemId) where.itemId = itemId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;

    if (expiringWithin) {
      const days = parseInt(expiringWithin);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      where.expiryDate = { lte: futureDate, gte: new Date() };
      where.status = "ACTIVE";
    }

    if (view === "expiring") {
      // Get batches expiring in next 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const expiringBatches = await prisma.batch.findMany({
        where: {
          item: { organizationId: orgId },
          expiryDate: { lte: thirtyDaysFromNow, gte: new Date() },
          status: "ACTIVE",
          quantity: { gt: 0 },
        },
        include: {
          item: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
        orderBy: { expiryDate: "asc" },
      });

      return NextResponse.json({
        batches: expiringBatches.map(b => ({
          id: b.id,
          batchNumber: b.batchNumber,
          itemId: b.itemId,
          itemName: b.item.name,
          itemSku: b.item.sku,
          warehouseId: b.warehouseId,
          warehouseName: b.warehouse.name,
          expiryDate: b.expiryDate,
          daysUntilExpiry: b.expiryDate
            ? Math.ceil((b.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null,
          quantity: Number(b.quantity),
          value: Number(b.quantity) * Number(b.costPrice),
        })),
        summary: {
          totalBatches: expiringBatches.length,
          totalQuantity: expiringBatches.reduce((sum, b) => sum + Number(b.quantity), 0),
          totalValue: expiringBatches.reduce((sum, b) => sum + Number(b.quantity) * Number(b.costPrice), 0),
        },
      });
    }

    if (view === "expired") {
      // Get expired batches
      const expiredBatches = await prisma.batch.findMany({
        where: {
          item: { organizationId: orgId },
          OR: [
            { status: "EXPIRED" },
            { expiryDate: { lt: new Date() }, status: "ACTIVE" },
          ],
        },
        include: {
          item: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
        orderBy: { expiryDate: "desc" },
      });

      return NextResponse.json({
        batches: expiredBatches.map(b => ({
          id: b.id,
          batchNumber: b.batchNumber,
          itemId: b.itemId,
          itemName: b.item.name,
          warehouseId: b.warehouseId,
          warehouseName: b.warehouse.name,
          expiryDate: b.expiryDate,
          quantity: Number(b.quantity),
          status: b.status,
          value: Number(b.quantity) * Number(b.costPrice),
        })),
        summary: {
          totalBatches: expiredBatches.length,
          totalQuantity: expiredBatches.reduce((sum, b) => sum + Number(b.quantity), 0),
          totalValue: expiredBatches.reduce((sum, b) => sum + Number(b.quantity) * Number(b.costPrice), 0),
        },
      });
    }

    // Default list view
    const batches = await prisma.batch.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, sku: true, trackExpiry: true, trackSerial: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    // Get summary stats
    const stats = await prisma.batch.groupBy({
      by: ["status"],
      where: { item: { organizationId: orgId } },
      _count: true,
      _sum: { quantity: true },
    });

    return NextResponse.json({
      batches: batches.map(b => ({
        id: b.id,
        itemId: b.itemId,
        itemName: b.item.name,
        itemSku: b.item.sku,
        warehouseId: b.warehouseId,
        warehouseName: b.warehouse.name,
        batchNumber: b.batchNumber,
        serialNumber: b.serialNumber,
        manufacturingDate: b.manufacturingDate,
        expiryDate: b.expiryDate,
        quantity: Number(b.quantity),
        costPrice: Number(b.costPrice),
        sellingPrice: b.sellingPrice ? Number(b.sellingPrice) : null,
        status: b.status,
        value: Number(b.quantity) * Number(b.costPrice),
        createdAt: b.createdAt,
      })),
      stats: {
        total: batches.length,
        byStatus: Object.fromEntries(
          stats.map(s => [s.status, { count: s._count, quantity: Number(s._sum.quantity || 0) }])
        ),
      },
    });
  } catch (error) {
    console.error("Error fetching batches:", error);
    return NextResponse.json({ error: "Failed to fetch batches" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = createBatchSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verify item belongs to org and has batch tracking enabled
    const item = await prisma.item.findFirst({
      where: { id: data.itemId, organizationId: orgId },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (!item.trackBatch) {
      return NextResponse.json({ error: "Item does not have batch tracking enabled" }, { status: 400 });
    }

    // Verify warehouse belongs to org
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: data.warehouseId, organizationId: orgId },
    });

    if (!warehouse) {
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
    }

    // Check for duplicate batch number
    const existingBatch = await prisma.batch.findUnique({
      where: {
        itemId_warehouseId_batchNumber: {
          itemId: data.itemId,
          warehouseId: data.warehouseId,
          batchNumber: data.batchNumber,
        },
      },
    });

    if (existingBatch) {
      return NextResponse.json({ error: "Batch number already exists for this item in this warehouse" }, { status: 400 });
    }

    // Determine initial status
    let status = "ACTIVE";
    if (data.expiryDate && data.expiryDate < new Date()) {
      status = "EXPIRED";
    }

    // Create batch
    const batch = await prisma.batch.create({
      data: {
        itemId: data.itemId,
        warehouseId: data.warehouseId,
        batchNumber: data.batchNumber,
        serialNumber: data.serialNumber,
        manufacturingDate: data.manufacturingDate,
        expiryDate: data.expiryDate,
        quantity: data.quantity,
        costPrice: data.costPrice,
        sellingPrice: data.sellingPrice,
        status,
      },
      include: {
        item: { select: { name: true, sku: true } },
        warehouse: { select: { name: true } },
      },
    });

    // Update stock
    await prisma.stock.upsert({
      where: {
        itemId_warehouseId: {
          itemId: data.itemId,
          warehouseId: data.warehouseId,
        },
      },
      update: {
        quantity: { increment: data.quantity },
      },
      create: {
        itemId: data.itemId,
        warehouseId: data.warehouseId,
        quantity: data.quantity,
        avgCost: data.costPrice,
      },
    });

    return NextResponse.json({
      id: batch.id,
      batchNumber: batch.batchNumber,
      itemName: batch.item.name,
      warehouseName: batch.warehouse.name,
      quantity: Number(batch.quantity),
      status: batch.status,
      message: "Batch created successfully",
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating batch:", error);
    return NextResponse.json({ error: "Failed to create batch" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { batchId, ...updateData } = body;

    if (!batchId) {
      return NextResponse.json({ error: "Batch ID required" }, { status: 400 });
    }

    const validationResult = updateBatchSchema.safeParse(updateData);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    // Verify batch belongs to org
    const batch = await prisma.batch.findFirst({
      where: {
        id: batchId,
        item: { organizationId: orgId },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const data = validationResult.data;
    const oldQuantity = Number(batch.quantity);

    // Update batch
    const updatedBatch = await prisma.batch.update({
      where: { id: batchId },
      data,
    });

    // Update stock if quantity changed
    if (data.quantity !== undefined && data.quantity !== oldQuantity) {
      const quantityDiff = data.quantity - oldQuantity;
      await prisma.stock.update({
        where: {
          itemId_warehouseId: {
            itemId: batch.itemId,
            warehouseId: batch.warehouseId,
          },
        },
        data: {
          quantity: { increment: quantityDiff },
        },
      });
    }

    return NextResponse.json({
      id: updatedBatch.id,
      message: "Batch updated successfully",
    });
  } catch (error) {
    console.error("Error updating batch:", error);
    return NextResponse.json({ error: "Failed to update batch" }, { status: 500 });
  }
}

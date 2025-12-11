import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const stockMovementSchema = z.object({
  itemId: z.string().min(1, "Item is required"),
  movementType: z.enum(["PURCHASE", "SALE", "TRANSFER", "ADJUSTMENT", "RETURN", "GRN", "ISSUE"]),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  rate: z.number().min(0).default(0),
  fromWarehouseId: z.string().optional(),
  toWarehouseId: z.string().optional(),
  unitId: z.string().min(1, "Unit is required"),
  batchId: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  narration: z.string().optional(),
  date: z.string().transform((val) => new Date(val)),
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
    const view = searchParams.get("view") || "summary";
    const warehouseId = searchParams.get("warehouseId");
    const itemId = searchParams.get("itemId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (view === "movements") {
      // Get stock movements
      const where: Record<string, unknown> = {
        item: { organizationId: orgId },
      };

      if (warehouseId) {
        where.OR = [
          { fromWarehouseId: warehouseId },
          { toWarehouseId: warehouseId },
        ];
      }

      if (itemId) {
        where.itemId = itemId;
      }

      const [movements, total] = await Promise.all([
        prisma.stockMovement.findMany({
          where,
          include: {
            item: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
            fromWarehouse: {
              select: {
                id: true,
                name: true,
              },
            },
            toWarehouse: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { date: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.stockMovement.count({ where }),
      ]);

      return NextResponse.json({
        data: movements,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } else {
      // Get stock summary
      const where: Record<string, unknown> = {
        item: { organizationId: orgId },
      };

      if (warehouseId) {
        where.warehouseId = warehouseId;
      }

      if (itemId) {
        where.itemId = itemId;
      }

      const [stocks, total] = await Promise.all([
        prisma.stock.findMany({
          where,
          include: {
            item: {
              select: {
                id: true,
                name: true,
                sku: true,
                sellingPrice: true,
                purchasePrice: true,
                minStock: true,
                reorderLevel: true,
                primaryUnit: {
                  select: {
                    name: true,
                    symbol: true,
                  },
                },
              },
            },
            warehouse: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [
            { item: { name: "asc" } },
            { warehouse: { name: "asc" } },
          ],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.stock.count({ where }),
      ]);

      // Calculate stock value
      const stocksWithValue = stocks.map((stock) => ({
        ...stock,
        stockValue: Number(stock.quantity) * Number(stock.avgCost || 0),
      }));

      return NextResponse.json({
        data: stocksWithValue,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
  } catch (error) {
    console.error("Error fetching stock:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock" },
      { status: 500 }
    );
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
    const validatedData = stockMovementSchema.parse(body);

    // Verify item belongs to organization
    const item = await prisma.item.findFirst({
      where: {
        id: validatedData.itemId,
        organizationId: orgId,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      );
    }

    // Verify warehouses belong to organization
    if (validatedData.fromWarehouseId) {
      const fromWarehouse = await prisma.warehouse.findFirst({
        where: {
          id: validatedData.fromWarehouseId,
          organizationId: orgId,
        },
      });

      if (!fromWarehouse) {
        return NextResponse.json(
          { error: "Source warehouse not found" },
          { status: 404 }
        );
      }
    }

    if (validatedData.toWarehouseId) {
      const toWarehouse = await prisma.warehouse.findFirst({
        where: {
          id: validatedData.toWarehouseId,
          organizationId: orgId,
        },
      });

      if (!toWarehouse) {
        return NextResponse.json(
          { error: "Destination warehouse not found" },
          { status: 404 }
        );
      }
    }

    const totalValue = validatedData.quantity * validatedData.rate;

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create stock movement record
      const movement = await tx.stockMovement.create({
        data: {
          itemId: validatedData.itemId,
          fromWarehouseId: validatedData.fromWarehouseId,
          toWarehouseId: validatedData.toWarehouseId,
          unitId: validatedData.unitId,
          movementType: validatedData.movementType,
          quantity: validatedData.quantity,
          rate: validatedData.rate,
          totalValue,
          batchId: validatedData.batchId,
          referenceType: validatedData.referenceType,
          referenceId: validatedData.referenceId,
          narration: validatedData.narration,
          date: validatedData.date,
        },
      });

      // Update stock in source warehouse (decrease)
      if (validatedData.fromWarehouseId) {
        const currentStock = await tx.stock.findUnique({
          where: {
            itemId_warehouseId: {
              itemId: validatedData.itemId,
              warehouseId: validatedData.fromWarehouseId,
            },
          },
        });

        await tx.stock.upsert({
          where: {
            itemId_warehouseId: {
              itemId: validatedData.itemId,
              warehouseId: validatedData.fromWarehouseId,
            },
          },
          update: {
            quantity: {
              decrement: validatedData.quantity,
            },
          },
          create: {
            itemId: validatedData.itemId,
            warehouseId: validatedData.fromWarehouseId,
            quantity: -validatedData.quantity,
            avgCost: validatedData.rate,
          },
        });
      }

      // Update stock in destination warehouse (increase)
      if (validatedData.toWarehouseId) {
        await tx.stock.upsert({
          where: {
            itemId_warehouseId: {
              itemId: validatedData.itemId,
              warehouseId: validatedData.toWarehouseId,
            },
          },
          update: {
            quantity: {
              increment: validatedData.quantity,
            },
          },
          create: {
            itemId: validatedData.itemId,
            warehouseId: validatedData.toWarehouseId,
            quantity: validatedData.quantity,
            avgCost: validatedData.rate,
          },
        });
      }

      return { movement };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error processing stock movement:", error);
    return NextResponse.json(
      { error: "Failed to process stock movement" },
      { status: 500 }
    );
  }
}

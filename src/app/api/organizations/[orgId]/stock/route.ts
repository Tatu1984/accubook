import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { D, mul, toNumber } from "@/backend/utils/money";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stockMovementSchema = z.object({
  itemId: z.string().min(1, "Item is required"),
  movementType: z.enum(["PURCHASE", "SALE", "TRANSFER", "ADJUSTMENT", "RETURN", "GRN", "ISSUE"]),
  quantity: z.union([z.number().positive(), z.string()]).transform((v) => D(v)),
  rate: z.union([z.number().min(0), z.string()]).default(0).transform((v) => D(v)),
  fromWarehouseId: z.string().optional(),
  toWarehouseId: z.string().optional(),
  unitId: z.string().min(1, "Unit is required"),
  batchId: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  narration: z.string().optional(),
  date: z.string().transform((val) => new Date(val)),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
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

      // Stock value via Decimal — never JS float multiplication.
      const stocksWithValue = stocks.map((stock) => ({
        ...stock,
        stockValue: toNumber(mul(stock.quantity, stock.avgCost ?? 0)),
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
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
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
      return notFound("Item not found");
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
        return notFound("Source warehouse not found");
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
        return notFound("Destination warehouse not found");
      }
    }

    const qty = D(validatedData.quantity);
    const rate = D(validatedData.rate);
    const totalValue = qty.times(rate);

    // Movements that *increase* stock at the destination should also recompute
    // the weighted-average cost. Sales/issues/transfers consume; receipts revalue.
    const isIncomingMovement =
      validatedData.movementType === "PURCHASE" ||
      validatedData.movementType === "GRN" ||
      validatedData.movementType === "RETURN";

    const result = await prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          itemId: validatedData.itemId,
          fromWarehouseId: validatedData.fromWarehouseId,
          toWarehouseId: validatedData.toWarehouseId,
          unitId: validatedData.unitId,
          movementType: validatedData.movementType,
          quantity: qty,
          rate,
          totalValue,
          batchId: validatedData.batchId,
          referenceType: validatedData.referenceType,
          referenceId: validatedData.referenceId,
          narration: validatedData.narration,
          date: validatedData.date,
        },
      });

      // SOURCE warehouse: decrement only if there is enough stock.
      // updateMany lets us add a `quantity >= qty` predicate atomically.
      // If count is 0, stock was insufficient → reject.
      if (validatedData.fromWarehouseId) {
        const updated = await tx.stock.updateMany({
          where: {
            itemId: validatedData.itemId,
            warehouseId: validatedData.fromWarehouseId,
            quantity: { gte: qty },
          },
          data: { quantity: { decrement: qty } },
        });
        if (updated.count === 0) {
          // Either no stock row exists, or insufficient quantity. Either way, reject.
          throw new InsufficientStockError(
            `Insufficient stock in source warehouse for this item`
          );
        }
      }

      // DESTINATION warehouse: upsert.
      //   - On create: quantity = qty, avgCost = rate.
      //   - On update for incoming movements: weighted-average recompute.
      //   - On update for non-incoming (e.g. transfer): just increment qty,
      //     avgCost stays as it was for that warehouse.
      if (validatedData.toWarehouseId) {
        const existing = await tx.stock.findUnique({
          where: {
            itemId_warehouseId: {
              itemId: validatedData.itemId,
              warehouseId: validatedData.toWarehouseId,
            },
          },
          select: { quantity: true, avgCost: true },
        });

        if (!existing) {
          await tx.stock.create({
            data: {
              itemId: validatedData.itemId,
              warehouseId: validatedData.toWarehouseId,
              quantity: qty,
              avgCost: rate,
            },
          });
        } else if (isIncomingMovement) {
          // newAvg = (oldQty*oldAvg + incomingQty*incomingRate) / (oldQty + incomingQty)
          // Falls back to the incoming rate when oldQty is 0.
          const oldQty = D(existing.quantity);
          const oldAvg = D(existing.avgCost ?? 0);
          const newQty = oldQty.plus(qty);
          const newAvg = newQty.isZero()
            ? rate
            : oldQty.times(oldAvg).plus(qty.times(rate)).dividedBy(newQty);
          await tx.stock.update({
            where: {
              itemId_warehouseId: {
                itemId: validatedData.itemId,
                warehouseId: validatedData.toWarehouseId,
              },
            },
            data: { quantity: newQty, avgCost: newAvg },
          });
        } else {
          // Transfer-in or similar: don't revalue; just increment.
          await tx.stock.update({
            where: {
              itemId_warehouseId: {
                itemId: validatedData.itemId,
                warehouseId: validatedData.toWarehouseId,
              },
            },
            data: { quantity: { increment: qty } },
          });
        }
      }

      return { movement };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (error instanceof InsufficientStockError) {
      return badRequest(error.message);
    }
    console.error("Error processing stock movement:", error);
    return NextResponse.json(
      { error: "Failed to process stock movement" },
      { status: 500 }
    );
  }
});

class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

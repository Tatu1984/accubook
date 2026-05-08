import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D, sum } from "@/backend/utils/money";
import { writeAudit } from "@/backend/utils/audit";
import { postWorkOrderJv } from "@/backend/services/manufacturing/post-wo-journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const issueSchema = z.object({
  /** Optional override of the WO's default warehouse for component issue. */
  warehouseId: z.string().optional(),
  /** Optional override of the issue date (defaults to today). */
  date: z.string().optional().transform((v) => (v ? new Date(v) : new Date())),
});

class InsufficientStockError extends Error {
  constructor(message: string, public details: { itemId: string; itemName: string; required: string; available: string }[]) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

/**
 * Issue raw materials to a work order.
 *
 * Computes required quantities from the BOM scaled by the WO's planned
 * quantity (required = component.qty * plannedQuantity / bom.outputQuantity).
 * Atomically decrements the issuing warehouse's stock for every
 * component (via `updateMany` with a `quantity: { gte: required }`
 * predicate — the Postgres row lock prevents over-issue under
 * concurrent issues).
 *
 * Each component generates a StockMovement (movementType="ISSUE",
 * referenceType="WORK_ORDER") at the current avgCost. The aggregate
 * material value is then posted as Dr Work in Progress / Cr Stock-in-
 * Hand. WO transitions DRAFT → IN_PROGRESS.
 *
 * Returns 409 if the WO is not in DRAFT status, 400 with structured
 * `details` if any component is short, 404 if the WO doesn't exist.
 */
export const POST = withOrgAuth<{ workOrderId: string }>(async (request, { orgId, userId, params }) => {
  try {
    const { workOrderId } = params;
    const validated = issueSchema.parse(await request.json().catch(() => ({})));

    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId: orgId },
      include: {
        bom: {
          include: {
            components: { include: { item: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    if (!workOrder) return notFound("Work order not found");
    if (workOrder.status !== "DRAFT") {
      return NextResponse.json(
        { error: `Work order is in ${workOrder.status} state; only DRAFT WOs can be issued.` },
        { status: 409 }
      );
    }

    const issueWarehouseId = validated.warehouseId ?? workOrder.warehouseId;
    if (!issueWarehouseId) {
      return badRequest("warehouseId is required (work order has no default warehouse)");
    }
    const wh = await prisma.warehouse.findFirst({
      where: { id: issueWarehouseId, organizationId: orgId },
      select: { id: true },
    });
    if (!wh) return notFound("Warehouse not found");

    const planned = D(workOrder.plannedQuantity);
    const bomOut = D(workOrder.bom.outputQuantity);
    if (bomOut.isZero()) {
      return badRequest("BOM output quantity is zero; refusing to issue.");
    }

    // Compute required quantity per component, then look up current stock
    // + avgCost. We do the read-side check upfront so we can return a
    // structured shortage list to the UI before any tx is opened.
    const requirements = workOrder.bom.components.map((c) => ({
      itemId: c.itemId,
      itemName: c.item.name,
      unitId: c.unitId,
      requiredQty: D(c.quantity).times(planned).dividedBy(bomOut),
    }));

    const stockRows = await prisma.stock.findMany({
      where: {
        itemId: { in: requirements.map((r) => r.itemId) },
        warehouseId: issueWarehouseId,
      },
      select: { itemId: true, quantity: true, avgCost: true },
    });
    const stockMap = new Map(
      stockRows.map((s) => [s.itemId, { quantity: D(s.quantity), avgCost: D(s.avgCost) }])
    );

    const shortages: { itemId: string; itemName: string; required: string; available: string }[] = [];
    for (const r of requirements) {
      const stock = stockMap.get(r.itemId);
      const available = stock?.quantity ?? D(0);
      if (available.lessThan(r.requiredQty)) {
        shortages.push({
          itemId: r.itemId,
          itemName: r.itemName,
          required: r.requiredQty.toString(),
          available: available.toString(),
        });
      }
    }
    if (shortages.length > 0) {
      return NextResponse.json(
        {
          error: "Insufficient stock for one or more components",
          details: shortages,
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Decrement source stock atomically per component. Even though
      //    we already did a read-side shortage check, do the gte-guarded
      //    updateMany again so a concurrent issue can't sneak past us.
      const movements: Array<{
        itemId: string;
        unitId: string;
        quantity: import("@/generated/prisma").Prisma.Decimal;
        rate: import("@/generated/prisma").Prisma.Decimal;
        totalValue: import("@/generated/prisma").Prisma.Decimal;
      }> = [];
      for (const r of requirements) {
        const updated = await tx.stock.updateMany({
          where: {
            itemId: r.itemId,
            warehouseId: issueWarehouseId,
            quantity: { gte: r.requiredQty },
          },
          data: { quantity: { decrement: r.requiredQty } },
        });
        if (updated.count === 0) {
          // Concurrent issue depleted stock between our pre-check and now.
          throw new InsufficientStockError(
            `Concurrent issue depleted stock for ${r.itemName}`,
            [
              {
                itemId: r.itemId,
                itemName: r.itemName,
                required: r.requiredQty.toString(),
                available: "0",
              },
            ]
          );
        }
        const rate = stockMap.get(r.itemId)!.avgCost;
        const totalValue = r.requiredQty.times(rate);
        await tx.stockMovement.create({
          data: {
            itemId: r.itemId,
            fromWarehouseId: issueWarehouseId,
            unitId: r.unitId,
            movementType: "ISSUE",
            quantity: r.requiredQty,
            rate,
            totalValue,
            referenceType: "WORK_ORDER",
            referenceId: workOrder.id,
            narration: `Issue to WO ${workOrder.workOrderNumber}`,
            date: validated.date,
          },
        });
        movements.push({
          itemId: r.itemId,
          unitId: r.unitId,
          quantity: r.requiredQty,
          rate,
          totalValue,
        });
      }

      const totalIssueValue = sum(movements.map((m) => m.totalValue));

      // 2. Post the JV: Dr Work in Progress / Cr Stock-in-Hand.
      const { voucherId } = await postWorkOrderJv({
        tx,
        orgId,
        userId,
        date: validated.date,
        amount: totalIssueValue,
        kind: "ISSUE",
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.workOrderNumber,
        narration: `Material issue to WO ${workOrder.workOrderNumber}`,
        extraMetadata: { componentCount: movements.length },
      });

      // 3. Transition WO to IN_PROGRESS.
      const updated = await tx.workOrder.update({
        where: { id: workOrder.id },
        data: {
          status: "IN_PROGRESS",
          startDate: workOrder.startDate ?? validated.date,
        },
      });

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "ISSUE",
        entityType: "WorkOrder",
        entityId: workOrder.id,
        newData: {
          workOrderNumber: workOrder.workOrderNumber,
          voucherId,
          warehouseId: issueWarehouseId,
          totalIssueValue: totalIssueValue.toString(),
          componentCount: movements.length,
        },
      });

      return { workOrder: updated, voucherId, totalIssueValue, movements };
    });

    return NextResponse.json(
      {
        workOrder: result.workOrder,
        voucherId: result.voucherId,
        totalIssueValue: result.totalIssueValue.toString(),
        components: result.movements.map((m) => ({
          itemId: m.itemId,
          quantity: m.quantity.toString(),
          rate: m.rate.toString(),
          totalValue: m.totalValue.toString(),
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 400 }
      );
    }
    if (error instanceof Error && /not configured|No fiscal year/i.test(error.message)) {
      return badRequest(error.message);
    }
    logger.error({ err: error }, "Error issuing work order");
    return NextResponse.json({ error: "Failed to issue work order" }, { status: 500 });
  }
});

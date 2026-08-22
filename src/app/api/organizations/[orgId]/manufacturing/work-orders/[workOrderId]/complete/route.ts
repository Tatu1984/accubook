import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D, sum } from "@/backend/utils/money";
import { writeAudit } from "@/backend/utils/audit";
import { postWorkOrderJv } from "@/backend/services/manufacturing/post-wo-journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const completeSchema = z.object({
  /**
   * Quantity of finished good actually produced. Must be > 0 and the
   * sum (completed + scrap) cannot exceed the WO's planned quantity.
   */
  completedQuantity: z.union([z.number().positive(), z.string()]).transform((v) => D(v)),
  /** Optional scrap (defective output that goes nowhere). Defaults to 0. */
  scrapQuantity: z
    .union([z.number().nonnegative(), z.string()])
    .nullish()
    .transform((v) => (v == null ? D(0) : D(v))),
  /** Optional override of the WO's default warehouse for receiving the FG. */
  warehouseId: optional(z.string()),
  /** Optional override of the completion date (defaults to today). */
  date: optional(z.string()).transform((v) => (v ? new Date(v) : new Date())),
});

/**
 * Complete a work order: book the finished good into stock and reverse
 * the WIP that was capitalised at issue time.
 *
 * The WIP value to capitalise is the sum of every prior ISSUE
 * StockMovement linked to this work order (referenceType="WORK_ORDER",
 * referenceId=wo.id). Scrap is absorbed into the FG cost — i.e. all
 * issue value is allocated to the completed units, raising their unit
 * cost. (This matches conventional Indian SMB practice; a future
 * "scrap recovery" enhancement could split it into a separate
 * Cost-of-Scrap expense.)
 *
 * Stock receipt: a GRN-type StockMovement on the FG item at the
 * destination warehouse, with weighted-average cost recompute (mirrors
 * the pattern in stock/route.ts).
 *
 * GL posting: Dr Stock-in-Hand / Cr Work in Progress for the full WIP
 * value. WO transitions IN_PROGRESS → COMPLETED.
 *
 * Returns 409 if the WO is not in IN_PROGRESS state, 400 if quantities
 * are invalid, 404 if the WO doesn't exist.
 */
/**
 * Raised when a concurrent request completed the work order first.
 *
 * Surfaces as the same 409 the sequential guard returns for a work order
 * that is not IN_PROGRESS, rather than a 500 — the caller's request was
 * valid, it simply arrived second.
 */
class WorkOrderAlreadyCompletedError extends Error {
  constructor(public readonly workOrderNumber: string) {
    super(
      `Work order ${workOrderNumber} was completed by a concurrent request. ` +
        `No materials were relieved by this one.`
    );
    this.name = "WorkOrderAlreadyCompletedError";
  }
}

export const POST = withOrgAuth<{ workOrderId: string }>(async (request, { orgId, userId, params }) => {
  try {
    const { workOrderId } = params;
    const validated = completeSchema.parse(await request.json());

    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        workOrderNumber: true,
        bomId: true,
        itemId: true,
        plannedQuantity: true,
        completedQuantity: true,
        scrapQuantity: true,
        warehouseId: true,
        status: true,
        startDate: true,
        item: { select: { id: true, name: true, primaryUnitId: true } },
      },
    });
    if (!workOrder) return notFound("Work order not found");
    if (workOrder.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: `Work order is in ${workOrder.status} state; only IN_PROGRESS WOs can be completed.` },
        { status: 409 }
      );
    }

    const completed = D(validated.completedQuantity);
    const scrap = D(validated.scrapQuantity);
    const totalOutput = completed.plus(scrap);
    if (totalOutput.greaterThan(D(workOrder.plannedQuantity))) {
      return badRequest(
        `Output (${totalOutput.toString()}) exceeds planned quantity (${workOrder.plannedQuantity.toString()})`
      );
    }

    const grnWarehouseId = validated.warehouseId ?? workOrder.warehouseId;
    if (!grnWarehouseId) {
      return badRequest("warehouseId is required (work order has no default warehouse)");
    }
    const wh = await prisma.warehouse.findFirst({
      where: { id: grnWarehouseId, organizationId: orgId },
      select: { id: true },
    });
    if (!wh) return notFound("Warehouse not found");

    // Sum the issue value already booked against this WO. This is what
    // we capitalise into FG. If a WO was issued multiple times the sum
    // covers all of them.
    const issueMovements = await prisma.stockMovement.findMany({
      where: {
        referenceType: "WORK_ORDER",
        referenceId: workOrder.id,
        movementType: "ISSUE",
      },
      select: { totalValue: true },
    });
    if (issueMovements.length === 0) {
      return badRequest("Work order has no issued materials to capitalise. Issue first, then complete.");
    }
    const wipValue = sum(issueMovements.map((m) => D(m.totalValue)));
    if (completed.isZero()) {
      return badRequest("completedQuantity must be greater than zero");
    }
    const fgUnitCost = wipValue.dividedBy(completed);

    const result = await prisma.$transaction(async (tx) => {
      // 1. GRN the finished good. Mirrors the weighted-avg recompute in
      //    stock/route.ts.
      await tx.stockMovement.create({
        data: {
          itemId: workOrder.itemId,
          toWarehouseId: grnWarehouseId,
          unitId: workOrder.item.primaryUnitId,
          movementType: "GRN",
          quantity: completed,
          rate: fgUnitCost,
          totalValue: wipValue,
          referenceType: "WORK_ORDER",
          referenceId: workOrder.id,
          narration: `Completion of WO ${workOrder.workOrderNumber}`,
          date: validated.date,
        },
      });

      const existing = await tx.stock.findUnique({
        where: { itemId_warehouseId: { itemId: workOrder.itemId, warehouseId: grnWarehouseId } },
        select: { quantity: true, avgCost: true },
      });
      if (!existing) {
        await tx.stock.create({
          data: {
            itemId: workOrder.itemId,
            warehouseId: grnWarehouseId,
            quantity: completed,
            avgCost: fgUnitCost,
          },
        });
      } else {
        const oldQty = D(existing.quantity);
        const oldAvg = D(existing.avgCost ?? 0);
        const newQty = oldQty.plus(completed);
        const newAvg = newQty.isZero()
          ? fgUnitCost
          : oldQty.times(oldAvg).plus(completed.times(fgUnitCost)).dividedBy(newQty);
        await tx.stock.update({
          where: { itemId_warehouseId: { itemId: workOrder.itemId, warehouseId: grnWarehouseId } },
          data: { quantity: newQty, avgCost: newAvg },
        });
      }

      // 2. Post the JV: Dr Stock-in-Hand / Cr Work in Progress (reverses
      //    the WIP capitalisation booked at issue).
      const { voucherId } = await postWorkOrderJv({
        tx,
        orgId,
        userId,
        date: validated.date,
        amount: wipValue,
        kind: "COMPLETE",
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.workOrderNumber,
        narration: `Completion of WO ${workOrder.workOrderNumber} — ${completed.toString()} units of ${workOrder.item.name}`,
        extraMetadata: {
          completedQuantity: completed.toString(),
          scrapQuantity: scrap.toString(),
          fgUnitCost: fgUnitCost.toString(),
        },
      });

      // 3. Transition WO to COMPLETED.
      // Claim the work order, re-asserting the status the guard above
      // established. That guard reads at route level, before this
      // transaction opens, so two requests arriving together both see
      // IN_PROGRESS and both complete it.
      //
      // Unlike the payroll races there is no depleting resource to lean
      // on. `wipValue` is recomputed each time by summing the WO's ISSUE
      // movements, and nothing consumes or marks them; the finished-goods
      // receipt only ever increments. WO *issue* is safe by accident —
      // its stock decrement carries `quantity: { gte: required }`, so a
      // second issue finds nothing to take — but completion adds on both
      // sides, so run twice it simply succeeds twice. `status` is the only
      // state that can be claimed, so the claim is made here with
      // `updateMany`, which reports how many rows actually matched.
      // `update` cannot express the condition: it throws when the record
      // is absent rather than when it fails a predicate.
      const claimed = await tx.workOrder.updateMany({
        where: { id: workOrder.id, status: "IN_PROGRESS" },
        data: {
          status: "COMPLETED",
          completedQuantity: completed,
          scrapQuantity: scrap,
          endDate: validated.date,
        },
      });

      if (claimed.count !== 1) {
        // Another request completed this work order between our guard and
        // this write. Throwing unwinds the whole transaction — the GRN
        // movement, the finished-goods receipt and the WIP relief posted
        // above all roll back — so the material is relieved exactly once.
        throw new WorkOrderAlreadyCompletedError(workOrder.workOrderNumber);
      }

      const updated = await tx.workOrder.findUniqueOrThrow({
        where: { id: workOrder.id },
      });

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "COMPLETE",
        entityType: "WorkOrder",
        entityId: workOrder.id,
        newData: {
          workOrderNumber: workOrder.workOrderNumber,
          voucherId,
          warehouseId: grnWarehouseId,
          completedQuantity: completed.toString(),
          scrapQuantity: scrap.toString(),
          wipValue: wipValue.toString(),
          fgUnitCost: fgUnitCost.toString(),
        },
      });

      return { workOrder: updated, voucherId, wipValue, fgUnitCost };
    });

    return NextResponse.json(
      {
        workOrder: result.workOrder,
        voucherId: result.voucherId,
        completedQuantity: completed.toString(),
        scrapQuantity: scrap.toString(),
        wipValue: result.wipValue.toString(),
        fgUnitCost: result.fgUnitCost.toString(),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    // Lost the race to a concurrent request. The transaction rolled back,
    // so no GRN, no finished goods and no WIP relief were written —
    // report the same 409 the sequential status guard returns.
    if (error instanceof WorkOrderAlreadyCompletedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && /not configured|No fiscal year/i.test(error.message)) {
      return badRequest(error.message);
    }
    logger.error({ err: error }, "Error completing work order");
    return NextResponse.json({ error: "Failed to complete work order" }, { status: 500 });
  }
});

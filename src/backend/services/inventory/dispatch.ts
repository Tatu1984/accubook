import { prisma } from "@/backend/database/client";
import { writeAudit } from "@/backend/utils/audit";
import { D, toNumber } from "@/backend/utils/money";
import { loadPendingLines, pendingByInvoiceItem } from "./pending-dispatch";

/**
 * Confirming that goods have physically left the warehouse.
 *
 * The sale was recognised when the invoice was issued, so the revenue side of
 * the books is already correct and untouched here. What this changes is the
 * physical position: a SALE movement is written against the invoice, the source
 * warehouse is decremented, and the item stops being "invoiced but still on the
 * shelf".
 *
 * Lives as a service rather than inline in the route so the transactional
 * behaviour — re-deriving pending under the write's own snapshot, and the
 * guarded decrement — can be tested against a real database.
 */

export class DispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchError";
  }
}

export interface DispatchLineInput {
  invoiceId: string;
  itemId: string;
  warehouseId: string;
  quantity: number;
}

export interface DispatchedLine {
  invoiceId: string;
  invoiceNumber: string;
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  movementId: string;
  /** Unit cost the stock was relieved at, for the COGS entry. */
  unitCost: number;
}

export interface DispatchResult {
  lines: DispatchedLine[];
  units: number;
  invoiceNumbers: string[];
}

/** Merge duplicate (invoice, item, warehouse) triples so a double-click cannot double-ship. */
function mergeLines(lines: DispatchLineInput[]): DispatchLineInput[] {
  const merged = new Map<string, DispatchLineInput>();
  for (const line of lines) {
    const key = `${line.invoiceId}:${line.itemId}:${line.warehouseId}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += line.quantity;
    else merged.set(key, { ...line });
  }
  return [...merged.values()];
}

export async function postDispatch(
  orgId: string,
  userId: string,
  input: {
    lines: DispatchLineInput[];
    date?: Date;
    narration?: string;
  }
): Promise<DispatchResult> {
  const lines = mergeLines(input.lines);
  if (lines.length === 0) {
    throw new DispatchError("At least one line is required");
  }
  for (const line of lines) {
    if (!(line.quantity > 0)) {
      throw new DispatchError("Quantity must be greater than zero");
    }
  }

  const dispatchDate = input.date ?? new Date();
  const invoiceIds = [...new Set(lines.map((l) => l.invoiceId))];
  const warehouseIds = [...new Set(lines.map((l) => l.warehouseId))];

  const warehouses = await prisma.warehouse.findMany({
    where: { id: { in: warehouseIds }, organizationId: orgId },
    select: { id: true, name: true },
  });
  if (warehouses.length !== warehouseIds.length) {
    throw new DispatchError("One or more warehouses were not found");
  }
  const warehouseNameById = new Map(warehouses.map((w) => [w.id, w.name]));

  return prisma.$transaction(async (tx) => {
    // Re-derived under this transaction's snapshot: a stale queue in another
    // tab must not be able to ship the same line twice.
    const pendingLines = await loadPendingLines(orgId, tx, { invoiceIds });
    const pending = pendingByInvoiceItem(pendingLines);

    const foundInvoices = new Set(pendingLines.map((l) => l.invoiceId));
    for (const invoiceId of invoiceIds) {
      if (!foundInvoices.has(invoiceId)) {
        throw new DispatchError(
          "An invoice in this dispatch is not issued, has already shipped in full, or does not belong to this organization"
        );
      }
    }

    const unitByItem = new Map(pendingLines.map((l) => [l.itemId, l.unitId] as const));
    const nameByItem = new Map(pendingLines.map((l) => [l.itemId, l.itemName] as const));
    const numberByInvoice = new Map(
      pendingLines.map((l) => [l.invoiceId, l.invoiceNumber] as const)
    );

    const posted: DispatchedLine[] = [];

    for (const line of lines) {
      const key = `${line.invoiceId}:${line.itemId}`;
      const pendingQty = pending.get(key) ?? 0;

      if (pendingQty <= 0) {
        throw new DispatchError(
          `${numberByInvoice.get(line.invoiceId) ?? "Invoice"} has nothing pending for this item — it may have shipped already`
        );
      }
      // Tolerance for float noise arriving from the client.
      if (line.quantity > pendingQty + 1e-9) {
        throw new DispatchError(
          `Cannot dispatch ${line.quantity} against ${numberByInvoice.get(line.invoiceId) ?? "the invoice"} — only ${pendingQty} is pending`
        );
      }

      const unitId = unitByItem.get(line.itemId);
      if (!unitId) {
        throw new DispatchError(
          "The item being dispatched has no unit of measure configured"
        );
      }

      const stockRow = await tx.stock.findUnique({
        where: {
          itemId_warehouseId: {
            itemId: line.itemId,
            warehouseId: line.warehouseId,
          },
        },
        select: { quantity: true, avgCost: true },
      });

      const unitCost = toNumber(stockRow?.avgCost ?? 0);
      const qty = D(line.quantity);

      /*
       * The `quantity >= qty` predicate is the concurrency guard: two
       * simultaneous dispatches cannot both pass an availability check and
       * drive the shelf negative, because the second one matches no row.
       */
      const updated = await tx.stock.updateMany({
        where: {
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          quantity: { gte: qty },
        },
        data: { quantity: { decrement: qty } },
      });

      if (updated.count === 0) {
        const held = toNumber(stockRow?.quantity ?? 0);
        throw new DispatchError(
          `${warehouseNameById.get(line.warehouseId) ?? "The warehouse"} holds ${held} of this item — not enough to dispatch ${line.quantity}`
        );
      }

      const movement = await tx.stockMovement.create({
        data: {
          itemId: line.itemId,
          fromWarehouseId: line.warehouseId,
          unitId,
          movementType: "SALE",
          quantity: qty,
          rate: D(unitCost),
          totalValue: qty.times(D(unitCost)),
          referenceType: "INVOICE",
          referenceId: line.invoiceId,
          narration:
            input.narration ??
            `Dispatched against ${numberByInvoice.get(line.invoiceId) ?? "invoice"}`,
          date: dispatchDate,
        },
      });

      // Keep the running total in step so several lines in one batch against
      // the same invoice+item cannot together exceed what is pending.
      pending.set(key, pendingQty - line.quantity);

      posted.push({
        invoiceId: line.invoiceId,
        invoiceNumber: numberByInvoice.get(line.invoiceId) ?? "",
        itemId: line.itemId,
        itemName: nameByItem.get(line.itemId) ?? "",
        warehouseId: line.warehouseId,
        warehouseName: warehouseNameById.get(line.warehouseId) ?? "",
        quantity: line.quantity,
        movementId: movement.id,
        unitCost,
      });
    }

    // One audit row per invoice — the dispatch is the auditable event and the
    // invoice is what a reader would look it up by.
    for (const invoiceId of invoiceIds) {
      const forInvoice = posted.filter((p) => p.invoiceId === invoiceId);
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "ISSUE",
        entityType: "Invoice",
        entityId: invoiceId,
        newData: {
          event: "GOODS_DISPATCHED",
          invoiceNumber: numberByInvoice.get(invoiceId),
          date: dispatchDate.toISOString(),
          lines: forInvoice.map((p) => ({
            itemId: p.itemId,
            itemName: p.itemName,
            warehouseId: p.warehouseId,
            warehouseName: p.warehouseName,
            quantity: p.quantity,
            unitCost: p.unitCost,
            movementId: p.movementId,
          })),
        },
      });
    }

    return {
      lines: posted,
      units: posted.reduce((sum, p) => sum + p.quantity, 0),
      invoiceNumbers: [...new Set(posted.map((p) => p.invoiceNumber))],
    };
  });
}

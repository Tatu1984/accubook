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

/** One item's share of a "the whole invoice has left" dispatch. */
export interface DispatchPlanLine {
  itemId: string;
  itemName: string;
  sku: string | null;
  unit: string | null;
  quantity: number;
  warehouseId: string;
  warehouseName: string;
  /** What that warehouse holds right now, for the confirm screen. */
  onHand: number;
}

export interface DispatchPlan {
  invoiceId: string;
  invoiceNumber: string;
  partyName: string;
  invoiceDate: Date;
  lines: DispatchPlanLine[];
  units: number;
  /** Items the shelves cannot cover. Non-empty means the invoice cannot complete. */
  shortfalls: {
    itemId: string;
    itemName: string;
    unit: string | null;
    pending: number;
    available: number;
  }[];
}

/**
 * Where each pending item would be picked from if the whole invoice went out now.
 *
 * The warehouse manager marking an invoice complete is saying "this order has
 * left the building", not "line 3 leaves from the Andheri godown" — so the
 * source warehouse is chosen here rather than asked for: the caller's preferred
 * warehouse if it can cover the line, else the default warehouse, else the
 * warehouse holding most, splitting across several only when no single one is
 * enough.
 *
 * Returned rather than posted so the same allocation can be shown for
 * confirmation and then executed, instead of the screen guessing at one
 * allocation and the server performing another.
 */
export async function planInvoiceDispatch(
  orgId: string,
  invoiceId: string,
  preferredWarehouseId?: string
): Promise<DispatchPlan> {
  const pendingLines = await loadPendingLines(orgId, prisma, {
    invoiceIds: [invoiceId],
  });

  if (pendingLines.length === 0) {
    throw new DispatchError(
      "This invoice has nothing left to dispatch — it has already gone out in full, is not issued, or does not belong to this organization"
    );
  }

  const head = pendingLines[0];
  const itemIds = [...new Set(pendingLines.map((l) => l.itemId))];

  const stocks = await prisma.stock.findMany({
    where: {
      itemId: { in: itemIds },
      item: { organizationId: orgId },
      warehouse: { organizationId: orgId },
    },
    select: {
      itemId: true,
      quantity: true,
      warehouse: { select: { id: true, name: true, isDefault: true, isActive: true } },
    },
  });

  const shelvesByItem = new Map<
    string,
    { warehouseId: string; warehouseName: string; quantity: number; isDefault: boolean }[]
  >();
  for (const stock of stocks) {
    const quantity = toNumber(stock.quantity);
    if (quantity <= 0 || !stock.warehouse.isActive) continue;
    const list = shelvesByItem.get(stock.itemId) ?? [];
    list.push({
      warehouseId: stock.warehouse.id,
      warehouseName: stock.warehouse.name,
      quantity,
      isDefault: stock.warehouse.isDefault,
    });
    shelvesByItem.set(stock.itemId, list);
  }

  const lines: DispatchPlanLine[] = [];
  const shortfalls: DispatchPlan["shortfalls"] = [];
  const totals = pendingByInvoiceItem(pendingLines);
  const metaByItem = new Map(pendingLines.map((l) => [l.itemId, l] as const));

  for (const itemId of itemIds) {
    const meta = metaByItem.get(itemId)!;
    let remaining = totals.get(`${invoiceId}:${itemId}`) ?? 0;
    if (remaining <= 0) continue;

    const shelves = [...(shelvesByItem.get(itemId) ?? [])].sort((a, b) => {
      if (a.warehouseId === preferredWarehouseId) return -1;
      if (b.warehouseId === preferredWarehouseId) return 1;
      // A single warehouse that covers the line beats a bigger one that also
      // would, only insofar as the default is the house's usual answer.
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return b.quantity - a.quantity;
    });

    const available = shelves.reduce((sum, s) => sum + s.quantity, 0);

    for (const shelf of shelves) {
      if (remaining <= 1e-9) break;
      const take = Math.min(shelf.quantity, remaining);
      if (take <= 0) continue;
      lines.push({
        itemId,
        itemName: meta.itemName,
        sku: meta.sku,
        unit: meta.unit,
        quantity: take,
        warehouseId: shelf.warehouseId,
        warehouseName: shelf.warehouseName,
        onHand: shelf.quantity,
      });
      remaining -= take;
    }

    if (remaining > 1e-9) {
      shortfalls.push({
        itemId,
        itemName: meta.itemName,
        unit: meta.unit,
        pending: totals.get(`${invoiceId}:${itemId}`) ?? 0,
        available,
      });
    }
  }

  return {
    invoiceId,
    invoiceNumber: head.invoiceNumber,
    partyName: head.partyName,
    invoiceDate: head.invoiceDate,
    lines,
    units: lines.reduce((sum, l) => sum + l.quantity, 0),
    shortfalls,
  };
}

/**
 * Mark an invoice complete: everything still pending on it leaves the warehouse
 * now.
 *
 * Refuses a partial completion — if the shelves cannot cover every line, the
 * invoice is not complete, and saying otherwise would leave stock the books
 * think has shipped. Those cases belong in the dispatch queue, line by line.
 */
export async function completeInvoiceDispatch(
  orgId: string,
  userId: string,
  input: {
    invoiceId: string;
    warehouseId?: string;
    date?: Date;
    narration?: string;
  }
): Promise<DispatchResult & { plan: DispatchPlan }> {
  const plan = await planInvoiceDispatch(
    orgId,
    input.invoiceId,
    input.warehouseId
  );

  if (plan.shortfalls.length > 0) {
    const worst = plan.shortfalls[0];
    throw new DispatchError(
      `${plan.invoiceNumber} cannot be completed — ${worst.itemName} needs ${worst.pending}${worst.unit ? ` ${worst.unit}` : ""} but only ${worst.available} is on hand${plan.shortfalls.length > 1 ? `, and ${plan.shortfalls.length - 1} other item${plan.shortfalls.length > 2 ? "s are" : " is"} short too` : ""}. Receive the stock first, or dispatch what you have from the queue.`
    );
  }

  const result = await postDispatch(orgId, userId, {
    lines: plan.lines.map((line) => ({
      invoiceId: plan.invoiceId,
      itemId: line.itemId,
      warehouseId: line.warehouseId,
      quantity: line.quantity,
    })),
    date: input.date,
    narration:
      input.narration ?? `${plan.invoiceNumber} dispatched in full`,
  });

  return { ...result, plan };
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

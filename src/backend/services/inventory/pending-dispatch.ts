import type { Tx } from "@/backend/utils/posting";
import { prisma } from "@/backend/database/client";
import { toNumber } from "@/backend/utils/money";

/**
 * What has been sold on paper but not yet physically shipped.
 *
 * Raising an invoice does not move stock anywhere in this codebase, so
 * `Stock.quantity` is the *physical* count and the accounting position has to
 * be derived. That derivation is this module, and both the read side (the
 * stock positions screen) and the write side (confirming a dispatch) go
 * through it — if they disagreed about what "pending" means, a dispatch could
 * ship more than was ever sold.
 *
 * Pending is computed as invoiced quantity minus whatever stock movements
 * already reference that invoice, so a part-shipped line resolves correctly and
 * the figure shrinks naturally as dispatches post.
 */

/** Invoice states where the sale is on the books and goods are owed to a customer. */
export const ISSUED_INVOICE_STATUSES = ["SENT", "PARTIAL", "PAID", "OVERDUE"];

export interface PendingLine {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  status: string;
  partyId: string;
  partyName: string;
  lineId: string;
  itemId: string;
  itemName: string;
  sku: string | null;
  unit: string | null;
  unitId: string | null;
  invoicedQty: number;
  dispatchedQty: number;
  pendingQty: number;
}

/**
 * @param client  a transaction client when validating inside a write, so the
 *                pending figure is read under the same snapshot that will
 *                perform the decrement.
 */
export async function loadPendingLines(
  orgId: string,
  client: Tx | typeof prisma = prisma,
  options: { invoiceIds?: string[] } = {}
): Promise<PendingLine[]> {
  const invoices = await client.invoice.findMany({
    where: {
      organizationId: orgId,
      type: "INVOICE",
      status: { in: ISSUED_INVOICE_STATUSES },
      ...(options.invoiceIds ? { id: { in: options.invoiceIds } } : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      date: true,
      dueDate: true,
      status: true,
      party: { select: { id: true, name: true } },
      items: {
        where: { itemId: { not: null } },
        select: {
          id: true,
          itemId: true,
          quantity: true,
          item: {
            select: {
              id: true,
              name: true,
              sku: true,
              primaryUnitId: true,
              primaryUnit: { select: { symbol: true } },
            },
          },
        },
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: { date: "asc" },
  });

  if (invoices.length === 0) return [];

  // One query for every dispatch movement across the invoices in play.
  const movements = await client.stockMovement.findMany({
    where: {
      referenceType: "INVOICE",
      referenceId: { in: invoices.map((i) => i.id) },
    },
    select: { referenceId: true, itemId: true, quantity: true },
  });

  const dispatchedByInvoiceItem = new Map<string, number>();
  for (const movement of movements) {
    const key = `${movement.referenceId}:${movement.itemId}`;
    dispatchedByInvoiceItem.set(
      key,
      (dispatchedByInvoiceItem.get(key) ?? 0) + toNumber(movement.quantity)
    );
  }

  const lines: PendingLine[] = [];

  for (const invoice of invoices) {
    // An invoice may list the same item on several lines. Movements only carry
    // the item, so the shipped quantity is allocated across those lines in
    // sequence rather than credited in full against each of them.
    const creditRemaining = new Map<string, number>();

    for (const line of invoice.items) {
      if (!line.itemId || !line.item) continue;
      const key = `${invoice.id}:${line.itemId}`;
      if (!creditRemaining.has(key)) {
        creditRemaining.set(key, dispatchedByInvoiceItem.get(key) ?? 0);
      }

      const invoicedQty = toNumber(line.quantity);
      const available = creditRemaining.get(key) ?? 0;
      const dispatchedQty = Math.min(invoicedQty, available);
      creditRemaining.set(key, available - dispatchedQty);

      const pendingQty = invoicedQty - dispatchedQty;
      if (pendingQty <= 0) continue;

      lines.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.date,
        dueDate: invoice.dueDate,
        status: invoice.status,
        partyId: invoice.party.id,
        partyName: invoice.party.name,
        lineId: line.id,
        itemId: line.itemId,
        itemName: line.item.name,
        sku: line.item.sku,
        unit: line.item.primaryUnit?.symbol ?? null,
        unitId: line.item.primaryUnitId,
        invoicedQty,
        dispatchedQty,
        pendingQty,
      });
    }
  }

  return lines;
}

/** Pending quantity keyed `invoiceId:itemId`, for validating a dispatch request. */
export function pendingByInvoiceItem(lines: PendingLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const key = `${line.invoiceId}:${line.itemId}`;
    totals.set(key, (totals.get(key) ?? 0) + line.pendingQty);
  }
  return totals;
}

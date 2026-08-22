import { prisma } from "@/backend/database/client";
import { D, toNumber } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";
import { loadPendingLines } from "./pending-dispatch";

/**
 * Closing stock valuation.
 *
 * COSTING MODEL — PERIODIC, with derived closing stock.
 *
 * Purchases are expensed when the bill is posted (`Dr Purchase Accounts`, a
 * group flagged `affectsGrossProfit`), and sales post no cost side at all. That
 * is the periodic model — but only its first half was ever implemented. Without
 * the closing-stock adjustment that completes it, the balance sheet carried no
 * Stock-in-Hand at all and the P&L charged the entire period's purchases
 * against the period's sales, overstating cost of goods sold by the value of
 * everything still unsold.
 *
 * Closing stock is derived here rather than posted as a voucher, which is how
 * Tally — the system this product targets and imports from — presents it: the
 * figure appears on the P&L (reducing cost of goods sold) and on the balance
 * sheet (as a current asset), computed from the inventory rather than entered
 * by hand. Deriving it also means no historical bill or invoice has to be
 * restated to make the reports correct.
 *
 * WHICH QUANTITY IS VALUED: the accounting position, not the shelf count.
 * Goods that have been invoiced but not yet physically dispatched have already
 * had their revenue recognised, so their cost must not also sit in closing
 * stock — that would count the same goods as both sold and held. Closing stock
 * is therefore `physical − inProgress`, the same accounting position the stock
 * screen shows.
 *
 * WHICH UNIT COST: whatever `Item.valuationMethod` says. The field has existed
 * on every item since the schema was written, is offered in the item form and
 * included in exports, and until now was read by nothing — an item marked FIFO
 * was valued at weighted average like everything else.
 */

export type ValuationMethod = "FIFO" | "LIFO" | "WEIGHTED_AVERAGE";

export interface ItemValuation {
  itemId: string;
  itemName: string;
  sku: string | null;
  valuationMethod: ValuationMethod;
  /** Shelf count across every warehouse. */
  physicalQty: number;
  /** Invoiced but not yet dispatched. */
  inProgressQty: number;
  /** physical − inProgress: what is still owned and unsold. */
  quantity: number;
  unitCost: number;
  value: number;
}

export interface ClosingStockValuation {
  asOf: Date;
  items: ItemValuation[];
  total: number;
}

function normaliseMethod(raw: string | null | undefined): ValuationMethod {
  const value = (raw ?? "").toUpperCase().replace(/[\s-]/g, "_");
  if (value === "FIFO") return "FIFO";
  if (value === "LIFO") return "LIFO";
  return "WEIGHTED_AVERAGE";
}

/** Movement types that bring goods in at a cost worth remembering. */
const INBOUND = new Set(["PURCHASE", "GRN", "RETURN", "ADJUSTMENT", "TRANSFER"]);

/**
 * Cost the remaining quantity from the inbound movement history.
 *
 * FIFO values what is left from the *most recent* receipts (the earliest ones
 * having been consumed first); LIFO values it from the earliest. Where history
 * does not cover the whole quantity — stock that predates the movement log, or
 * an opening balance — the remainder falls back to the item's average cost so
 * the valuation never silently under-reports.
 */
function costFromLayers(
  quantity: number,
  layers: { quantity: number; rate: number }[],
  method: ValuationMethod,
  fallbackRate: number
): number {
  if (quantity <= 0) return 0;

  const ordered =
    method === "FIFO"
      ? [...layers].reverse() // newest first: oldest units are the ones sold
      : [...layers]; // LIFO: oldest units remain

  let remaining = quantity;
  let value = D(0);

  for (const layer of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, layer.quantity);
    value = value.plus(D(take).times(D(layer.rate)));
    remaining -= take;
  }

  if (remaining > 0) {
    value = value.plus(D(remaining).times(D(fallbackRate)));
  }

  return toNumber(value);
}

export async function valueClosingStock(
  orgId: string,
  asOf: Date = new Date(),
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<ClosingStockValuation> {
  const stocks = await client.stock.findMany({
    where: { item: { organizationId: orgId } },
    select: {
      itemId: true,
      quantity: true,
      avgCost: true,
      item: {
        select: { id: true, name: true, sku: true, valuationMethod: true },
      },
    },
  });

  // Physical count and a quantity-weighted average cost per item.
  const byItem = new Map<
    string,
    {
      itemId: string;
      itemName: string;
      sku: string | null;
      method: ValuationMethod;
      physicalQty: number;
      weightedCost: Prisma.Decimal;
    }
  >();

  for (const stock of stocks) {
    const quantity = toNumber(stock.quantity);
    const existing = byItem.get(stock.itemId);
    if (existing) {
      existing.physicalQty += quantity;
      existing.weightedCost = existing.weightedCost.plus(
        D(quantity).times(D(stock.avgCost ?? 0))
      );
    } else {
      byItem.set(stock.itemId, {
        itemId: stock.itemId,
        itemName: stock.item.name,
        sku: stock.item.sku,
        method: normaliseMethod(stock.item.valuationMethod),
        physicalQty: quantity,
        weightedCost: D(quantity).times(D(stock.avgCost ?? 0)),
      });
    }
  }

  // Subtract what has been sold but not yet shipped.
  const pending = await loadPendingLines(orgId, client);
  const inProgressByItem = new Map<string, number>();
  for (const line of pending) {
    inProgressByItem.set(
      line.itemId,
      (inProgressByItem.get(line.itemId) ?? 0) + line.pendingQty
    );
  }

  // Receipt history, for the items that actually need layer costing.
  const layeredItemIds = [...byItem.values()]
    .filter((entry) => entry.method !== "WEIGHTED_AVERAGE")
    .map((entry) => entry.itemId);

  const layersByItem = new Map<string, { quantity: number; rate: number }[]>();
  if (layeredItemIds.length > 0) {
    const movements = await client.stockMovement.findMany({
      where: {
        itemId: { in: layeredItemIds },
        date: { lte: asOf },
        movementType: { in: [...INBOUND] },
        toWarehouseId: { not: null },
      },
      select: { itemId: true, quantity: true, rate: true },
      orderBy: { date: "asc" },
    });
    for (const movement of movements) {
      const rate = toNumber(movement.rate);
      // A zero-rate receipt carries no cost information; including it would
      // dilute the layers and undervalue the stock.
      if (rate <= 0) continue;
      const existing = layersByItem.get(movement.itemId);
      const layer = { quantity: toNumber(movement.quantity), rate };
      if (existing) existing.push(layer);
      else layersByItem.set(movement.itemId, [layer]);
    }
  }

  const items: ItemValuation[] = [];

  for (const entry of byItem.values()) {
    const inProgressQty = inProgressByItem.get(entry.itemId) ?? 0;
    // An oversold item holds nothing it still owns; it cannot carry a negative
    // asset, so it contributes zero rather than a credit balance.
    const quantity = Math.max(0, entry.physicalQty - inProgressQty);

    const averageCost =
      entry.physicalQty > 0
        ? toNumber(entry.weightedCost.dividedBy(D(entry.physicalQty)))
        : 0;

    const value =
      entry.method === "WEIGHTED_AVERAGE"
        ? toNumber(D(quantity).times(D(averageCost)))
        : costFromLayers(
            quantity,
            layersByItem.get(entry.itemId) ?? [],
            entry.method,
            averageCost
          );

    items.push({
      itemId: entry.itemId,
      itemName: entry.itemName,
      sku: entry.sku,
      valuationMethod: entry.method,
      physicalQty: entry.physicalQty,
      inProgressQty,
      quantity,
      unitCost: quantity > 0 ? toNumber(D(value).dividedBy(D(quantity))) : 0,
      value,
    });
  }

  items.sort((a, b) => b.value - a.value);

  return {
    asOf,
    items,
    total: toNumber(sumValues(items)),
  };
}

function sumValues(items: ItemValuation[]): Prisma.Decimal {
  return items.reduce((acc, item) => acc.plus(D(item.value)), D(0));
}

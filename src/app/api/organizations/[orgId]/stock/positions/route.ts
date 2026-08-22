import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D, toNumber } from "@/backend/utils/money";
import {
  loadPendingLines,
  type PendingLine,
} from "@/backend/services/inventory/pending-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The three stock positions, and the dispatch queue behind the middle one.
 *
 *   physical    what a warehouse count finds on the shelf
 *   inProgress  invoiced to a customer, not yet physically shipped
 *   accounting  what the books say is still owned:  physical − inProgress
 *
 * Why the numbers are derived rather than stored: raising an invoice does not
 * touch stock anywhere in this codebase (`/invoices` creates no StockMovement),
 * so `Stock.quantity` has only ever tracked receipts, transfers and manual
 * adjustments. That makes it the *physical* count, and leaves the accounting
 * position with nowhere to live. Deriving both from the invoice lines that have
 * no dispatch movement against them yet gives a truthful reading today, and
 * keeps working unchanged once dispatch starts posting those movements — the
 * pending quantity simply shrinks as they appear.
 *
 * `Stock.reservedQty` exists in the schema and is written by nothing; it is the
 * natural home for the in-progress figure once dispatch is wired.
 *
 * WAREHOUSE ATTRIBUTION: no sales document carries a warehouse — `Invoice`,
 * `InvoiceItem`, `SalesOrder` and `SalesOrderItem` all lack one, and only
 * `Stock` is warehouse-scoped. In-progress is therefore an item-level figure,
 * and which warehouse the goods leave from is a decision taken at dispatch
 * time. The positions view groups by item for that reason, carrying the
 * per-warehouse split of the physical count as a detail.
 */

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "positions";

    const pendingLines = await loadPendingLines(orgId);

    if (view === "dispatch-queue") {
      // The warehouse works invoice by invoice — a pick list, not a stock report.
      const byInvoice = new Map<
        string,
        {
          invoiceId: string;
          invoiceNumber: string;
          invoiceDate: Date;
          dueDate: Date;
          status: string;
          partyName: string;
          lines: PendingLine[];
        }
      >();

      for (const line of pendingLines) {
        const existing = byInvoice.get(line.invoiceId);
        if (existing) {
          existing.lines.push(line);
        } else {
          byInvoice.set(line.invoiceId, {
            invoiceId: line.invoiceId,
            invoiceNumber: line.invoiceNumber,
            invoiceDate: line.invoiceDate,
            dueDate: line.dueDate,
            status: line.status,
            partyName: line.partyName,
            lines: [line],
          });
        }
      }

      // Stock on hand per item, so a picker can see whether the shelf can cover
      // the line and from which warehouse.
      const itemIds = [...new Set(pendingLines.map((l) => l.itemId))];
      const stocks = itemIds.length
        ? await prisma.stock.findMany({
            where: { itemId: { in: itemIds }, item: { organizationId: orgId } },
            select: {
              itemId: true,
              quantity: true,
              warehouse: { select: { id: true, name: true } },
            },
          })
        : [];

      const availabilityByItem: Record<
        string,
        { warehouseId: string; warehouseName: string; quantity: number }[]
      > = {};
      for (const stock of stocks) {
        (availabilityByItem[stock.itemId] ??= []).push({
          warehouseId: stock.warehouse.id,
          warehouseName: stock.warehouse.name,
          quantity: toNumber(stock.quantity),
        });
      }

      const queue = [...byInvoice.values()].sort(
        (a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime()
      );

      return NextResponse.json({
        data: queue,
        availability: availabilityByItem,
        summary: {
          invoices: queue.length,
          lines: pendingLines.length,
          units: pendingLines.reduce((sum, l) => sum + l.pendingQty, 0),
        },
      });
    }

    // ---- positions ----------------------------------------------------
    const stocks = await prisma.stock.findMany({
      where: { item: { organizationId: orgId } },
      select: {
        quantity: true,
        avgCost: true,
        item: {
          select: {
            id: true,
            name: true,
            sku: true,
            reorderLevel: true,
            minStock: true,
            primaryUnit: { select: { symbol: true } },
            category: { select: { name: true } },
          },
        },
        warehouse: { select: { id: true, name: true } },
      },
    });

    type Position = {
      itemId: string;
      itemName: string;
      sku: string | null;
      unit: string | null;
      category: string | null;
      reorderLevel: number | null;
      physical: number;
      inProgress: number;
      accounting: number;
      avgCost: number;
      warehouses: { warehouseId: string; warehouseName: string; quantity: number }[];
      openInvoices: number;
    };

    const byItem = new Map<string, Position>();

    for (const stock of stocks) {
      const item = stock.item;
      const existing = byItem.get(item.id);
      const quantity = toNumber(stock.quantity);
      const entry = {
        warehouseId: stock.warehouse.id,
        warehouseName: stock.warehouse.name,
        quantity,
      };

      if (existing) {
        existing.physical += quantity;
        existing.warehouses.push(entry);
        // Weighted average cost across the warehouses holding this item.
        existing.avgCost =
          existing.physical > 0
            ? toNumber(
                D(existing.avgCost)
                  .times(existing.physical - quantity)
                  .plus(D(stock.avgCost ?? 0).times(quantity))
                  .dividedBy(existing.physical)
              )
            : toNumber(stock.avgCost ?? 0);
      } else {
        byItem.set(item.id, {
          itemId: item.id,
          itemName: item.name,
          sku: item.sku,
          unit: item.primaryUnit?.symbol ?? null,
          category: item.category?.name ?? null,
          reorderLevel:
            item.reorderLevel != null ? toNumber(item.reorderLevel) : null,
          physical: quantity,
          inProgress: 0,
          accounting: 0,
          avgCost: toNumber(stock.avgCost ?? 0),
          warehouses: [entry],
          openInvoices: 0,
        });
      }
    }

    // Fold in-progress onto the positions. An item can be owed to a customer
    // while holding no stock row at all (oversold, or invoiced before receipt),
    // so a line with no matching position still has to appear.
    const invoicesSeenPerItem = new Map<string, Set<string>>();

    for (const line of pendingLines) {
      let position = byItem.get(line.itemId);
      if (!position) {
        position = {
          itemId: line.itemId,
          itemName: line.itemName,
          sku: line.sku,
          unit: line.unit,
          category: null,
          reorderLevel: null,
          physical: 0,
          inProgress: 0,
          accounting: 0,
          avgCost: 0,
          warehouses: [],
          openInvoices: 0,
        };
        byItem.set(line.itemId, position);
      }
      position.inProgress += line.pendingQty;

      const seen = invoicesSeenPerItem.get(line.itemId) ?? new Set<string>();
      seen.add(line.invoiceId);
      invoicesSeenPerItem.set(line.itemId, seen);
    }

    const positions = [...byItem.values()].map((position) => ({
      ...position,
      openInvoices: invoicesSeenPerItem.get(position.itemId)?.size ?? 0,
      accounting: position.physical - position.inProgress,
      stockValue: toNumber(D(position.physical).times(D(position.avgCost))),
    }));

    positions.sort((a, b) => {
      // Items awaiting dispatch first — that is the column someone came to act on.
      if (a.inProgress !== b.inProgress) return b.inProgress - a.inProgress;
      return a.itemName.localeCompare(b.itemName);
    });

    const totals = positions.reduce(
      (acc, p) => ({
        physical: acc.physical + p.physical,
        inProgress: acc.inProgress + p.inProgress,
        accounting: acc.accounting + p.accounting,
        value: acc.value + p.stockValue,
      }),
      { physical: 0, inProgress: 0, accounting: 0, value: 0 }
    );

    return NextResponse.json({
      data: positions,
      summary: {
        ...totals,
        itemsAwaitingDispatch: positions.filter((p) => p.inProgress > 0).length,
        /** Items whose books show less than nothing — invoiced beyond what is held. */
        oversold: positions.filter((p) => p.accounting < 0).length,
        pendingInvoices: new Set(pendingLines.map((l) => l.invoiceId)).size,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error computing stock positions");
    return NextResponse.json(
      { error: "Failed to compute stock positions" },
      { status: 500 }
    );
  }
});

import { describe, expect, it } from "vitest";
import { prisma } from "@/backend/database/client";
import {
  completeInvoiceDispatch,
  planInvoiceDispatch,
  postDispatch,
  DispatchError,
} from "@/backend/services/inventory/dispatch";
import { loadPendingLines } from "@/backend/services/inventory/pending-dispatch";
import {
  createIssuedInvoice,
  createItem,
  createTestOrg,
  seedStock,
} from "./factories";

/**
 * "The order has left the building" — the warehouse manager closing an invoice
 * out in one action instead of picking it apart line by line.
 *
 * What is worth proving here is the allocation: nobody chooses a warehouse, so
 * the service has to choose one that actually holds the goods, split when no
 * single warehouse can cover a line, and refuse outright rather than half-ship
 * an invoice it then calls complete.
 */
describe("completing an invoice in one action", () => {
  it("ships every pending line and leaves nothing in progress", async () => {
    const org = await createTestOrg();
    const [nuts, bolts] = await Promise.all([createItem(org), createItem(org)]);
    await seedStock(nuts.id, org.warehouseId, 100, 20);
    await seedStock(bolts.id, org.warehouseId, 100, 30);

    const invoice = await createIssuedInvoice(org, [
      { itemId: nuts.id, quantity: 40, unitPrice: 100 },
      { itemId: bolts.id, quantity: 25, unitPrice: 100 },
    ]);

    const result = await completeInvoiceDispatch(org.orgId, org.userId, {
      invoiceId: invoice.id,
    });

    expect(result.units).toBe(65);
    expect(await loadPendingLines(org.orgId)).toHaveLength(0);

    const stocks = await prisma.stock.findMany({
      where: { itemId: { in: [nuts.id, bolts.id] }, warehouseId: org.warehouseId },
      select: { itemId: true, quantity: true },
    });
    const held = new Map(stocks.map((s) => [s.itemId, Number(s.quantity)]));
    expect(held.get(nuts.id)).toBe(60);
    expect(held.get(bolts.id)).toBe(75);
  });

  it("finishes an invoice that was already part-shipped", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 100);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 100 },
    ]);

    await postDispatch(org.orgId, org.userId, {
      lines: [
        {
          invoiceId: invoice.id,
          itemId: item.id,
          warehouseId: org.warehouseId,
          quantity: 12,
        },
      ],
    });

    const result = await completeInvoiceDispatch(org.orgId, org.userId, {
      invoiceId: invoice.id,
    });

    // Only the remaining 18 leave — the 12 already gone are not shipped twice.
    expect(result.units).toBe(18);
    expect(await loadPendingLines(org.orgId)).toHaveLength(0);

    const stock = await prisma.stock.findUniqueOrThrow({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock.quantity)).toBe(70);
  });

  it("splits a line across warehouses when no single one can cover it", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 20);
    await seedStock(item.id, org.secondWarehouseId, 15);

    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 100 },
    ]);

    const plan = await planInvoiceDispatch(org.orgId, invoice.id);
    expect(plan.shortfalls).toHaveLength(0);
    expect(plan.lines).toHaveLength(2);
    // Default warehouse first, then the overflow covers the balance.
    expect(plan.lines[0].warehouseId).toBe(org.warehouseId);
    expect(plan.lines[0].quantity).toBe(20);
    expect(plan.lines[1].warehouseId).toBe(org.secondWarehouseId);
    expect(plan.lines[1].quantity).toBe(10);

    await completeInvoiceDispatch(org.orgId, org.userId, { invoiceId: invoice.id });

    const stocks = await prisma.stock.findMany({
      where: { itemId: item.id },
      select: { warehouseId: true, quantity: true },
    });
    const held = new Map(stocks.map((s) => [s.warehouseId, Number(s.quantity)]));
    expect(held.get(org.warehouseId)).toBe(0);
    expect(held.get(org.secondWarehouseId)).toBe(5);
  });

  it("honours a preferred warehouse that can cover the line", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 100);
    await seedStock(item.id, org.secondWarehouseId, 100);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 10, unitPrice: 100 },
    ]);

    const plan = await planInvoiceDispatch(
      org.orgId,
      invoice.id,
      org.secondWarehouseId
    );
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].warehouseId).toBe(org.secondWarehouseId);
  });

  it("refuses to complete an invoice the shelves cannot cover, and ships nothing", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 12);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 100 },
    ]);

    await expect(
      completeInvoiceDispatch(org.orgId, org.userId, { invoiceId: invoice.id })
    ).rejects.toThrow(DispatchError);

    // A refused completion is not a part shipment: the shelf is untouched.
    const stock = await prisma.stock.findUniqueOrThrow({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock.quantity)).toBe(12);
    expect(await loadPendingLines(org.orgId)).toHaveLength(1);

    // The plan still says what is missing, so the screen can explain it.
    const plan = await planInvoiceDispatch(org.orgId, invoice.id);
    expect(plan.shortfalls).toEqual([
      expect.objectContaining({ itemId: item.id, pending: 30, available: 12 }),
    ]);
  });

  it("refuses an invoice belonging to another organization", async () => {
    const [mine, theirs] = await Promise.all([createTestOrg(), createTestOrg()]);
    const item = await createItem(theirs);
    await seedStock(item.id, theirs.warehouseId, 100);
    const invoice = await createIssuedInvoice(theirs, [
      { itemId: item.id, quantity: 5, unitPrice: 100 },
    ]);

    await expect(
      planInvoiceDispatch(mine.orgId, invoice.id)
    ).rejects.toThrow(DispatchError);
  });

  it("refuses an invoice that has already gone out in full", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 100);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 10, unitPrice: 100 },
    ]);

    await completeInvoiceDispatch(org.orgId, org.userId, { invoiceId: invoice.id });

    await expect(
      completeInvoiceDispatch(org.orgId, org.userId, { invoiceId: invoice.id })
    ).rejects.toThrow(DispatchError);

    const movements = await prisma.stockMovement.findMany({
      where: { referenceType: "INVOICE", referenceId: invoice.id },
    });
    expect(movements).toHaveLength(1);
  });
});

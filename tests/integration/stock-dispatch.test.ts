import { describe, expect, it } from "vitest";
import { prisma } from "@/backend/database/client";
import {
  loadPendingLines,
  pendingByInvoiceItem,
} from "@/backend/services/inventory/pending-dispatch";
import {
  createIssuedInvoice,
  createItem,
  createTestOrg,
  seedStock,
} from "./factories";

/**
 * The three stock positions and the dispatch that reconciles them.
 *
 * These run against a real database because the behaviour under test is
 * transactional: the pending quantity is re-derived inside the same
 * transaction that decrements the shelf, and the decrement carries a
 * `quantity >= qty` guard. A mocked client would return whatever it was told
 * to and prove none of it.
 */

describe("pending dispatch derivation", () => {
  it("counts an issued invoice as pending and leaves physical stock alone", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 150);
    await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 150 },
    ]);

    const lines = await loadPendingLines(org.orgId);

    expect(lines).toHaveLength(1);
    expect(lines[0].pendingQty).toBe(30);
    expect(lines[0].dispatchedQty).toBe(0);

    // Invoicing must not have moved the shelf.
    const stock = await prisma.stock.findUniqueOrThrow({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock.quantity)).toBe(150);
  });

  it("ignores draft and cancelled invoices", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await createIssuedInvoice(org, [{ itemId: item.id, quantity: 5, unitPrice: 10 }], {
      status: "DRAFT",
    });
    await createIssuedInvoice(org, [{ itemId: item.id, quantity: 7, unitPrice: 10 }], {
      status: "CANCELLED",
    });

    expect(await loadPendingLines(org.orgId)).toHaveLength(0);
  });

  it("nets off quantity already dispatched", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 150 },
    ]);

    await prisma.stockMovement.create({
      data: {
        itemId: item.id,
        fromWarehouseId: org.warehouseId,
        unitId: org.unitId,
        movementType: "SALE",
        quantity: 12,
        rate: 100,
        totalValue: 1200,
        referenceType: "INVOICE",
        referenceId: invoice.id,
        date: new Date(),
      },
    });

    const lines = await loadPendingLines(org.orgId);
    expect(lines[0].dispatchedQty).toBe(12);
    expect(lines[0].pendingQty).toBe(18);
  });

  it("allocates a part shipment across repeated lines of the same item", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 10, unitPrice: 150 },
      { itemId: item.id, quantity: 10, unitPrice: 150 },
    ]);

    // 15 shipped against an invoice listing the same item twice: the first
    // line is satisfied in full, the second keeps the remainder.
    await prisma.stockMovement.create({
      data: {
        itemId: item.id,
        fromWarehouseId: org.warehouseId,
        unitId: org.unitId,
        movementType: "SALE",
        quantity: 15,
        rate: 100,
        totalValue: 1500,
        referenceType: "INVOICE",
        referenceId: invoice.id,
        date: new Date(),
      },
    });

    const lines = await loadPendingLines(org.orgId);
    const totals = pendingByInvoiceItem(lines);
    expect(totals.get(`${invoice.id}:${item.id}`)).toBe(5);
  });

  it("does not leak pending lines across organizations", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);
    const itemA = await createItem(orgA);
    await createIssuedInvoice(orgA, [
      { itemId: itemA.id, quantity: 9, unitPrice: 100 },
    ]);

    expect(await loadPendingLines(orgA.orgId)).toHaveLength(1);
    expect(await loadPendingLines(orgB.orgId)).toHaveLength(0);
  });
});

describe("stock positions", () => {
  it("splits physical into accounting plus in-progress", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 150);
    await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 150 },
    ]);

    const lines = await loadPendingLines(org.orgId);
    const inProgress = lines.reduce((sum, l) => sum + l.pendingQty, 0);
    const physical = 150;

    expect(inProgress).toBe(30);
    expect(physical - inProgress).toBe(120);
  });

  it("reports a negative accounting position when oversold", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 25);
    await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 40, unitPrice: 150 },
    ]);

    const lines = await loadPendingLines(org.orgId);
    const inProgress = lines.reduce((sum, l) => sum + l.pendingQty, 0);
    expect(25 - inProgress).toBe(-15);
  });
});

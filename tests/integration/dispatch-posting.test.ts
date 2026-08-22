import { describe, expect, it } from "vitest";
import { prisma } from "@/backend/database/client";
import { postDispatch, DispatchError } from "@/backend/services/inventory/dispatch";
import { loadPendingLines } from "@/backend/services/inventory/pending-dispatch";
import {
  createIssuedInvoice,
  createItem,
  createTestOrg,
  seedStock,
} from "./factories";

describe("posting a dispatch", () => {
  it("relieves physical stock and clears the in-progress quantity", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 150, 100);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 150 },
    ]);

    const result = await postDispatch(org.orgId, org.userId, {
      lines: [
        {
          invoiceId: invoice.id,
          itemId: item.id,
          warehouseId: org.warehouseId,
          quantity: 30,
        },
      ],
    });

    expect(result.units).toBe(30);

    const stock = await prisma.stock.findUniqueOrThrow({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock.quantity)).toBe(120);

    // Nothing pending any more, so physical now equals accounting.
    expect(await loadPendingLines(org.orgId)).toHaveLength(0);
  });

  it("writes a SALE movement referencing the invoice, valued at average cost", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 100, 42);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 10, unitPrice: 150 },
    ]);

    await postDispatch(org.orgId, org.userId, {
      lines: [
        {
          invoiceId: invoice.id,
          itemId: item.id,
          warehouseId: org.warehouseId,
          quantity: 10,
        },
      ],
    });

    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { referenceType: "INVOICE", referenceId: invoice.id },
    });
    expect(movement.movementType).toBe("SALE");
    expect(movement.fromWarehouseId).toBe(org.warehouseId);
    expect(Number(movement.quantity)).toBe(10);
    expect(Number(movement.rate)).toBe(42);
    expect(Number(movement.totalValue)).toBe(420);
  });

  it("supports a part shipment and leaves the remainder pending", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 100);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 150 },
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

    const pending = await loadPendingLines(org.orgId);
    expect(pending).toHaveLength(1);
    expect(pending[0].pendingQty).toBe(18);
    expect(pending[0].dispatchedQty).toBe(12);
  });

  it("refuses to ship more than the invoice still owes", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 500);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 150 },
    ]);

    await expect(
      postDispatch(org.orgId, org.userId, {
        lines: [
          {
            invoiceId: invoice.id,
            itemId: item.id,
            warehouseId: org.warehouseId,
            quantity: 31,
          },
        ],
      })
    ).rejects.toThrow(DispatchError);

    // The failed attempt must not have moved anything.
    const stock = await prisma.stock.findUniqueOrThrow({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock.quantity)).toBe(500);
  });

  it("refuses to ship more than the warehouse holds", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 5);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 150 },
    ]);

    await expect(
      postDispatch(org.orgId, org.userId, {
        lines: [
          {
            invoiceId: invoice.id,
            itemId: item.id,
            warehouseId: org.warehouseId,
            quantity: 30,
          },
        ],
      })
    ).rejects.toThrow(/not enough/i);
  });

  it("rolls the whole batch back when one line fails", async () => {
    const org = await createTestOrg();
    const [good, bad] = await Promise.all([createItem(org), createItem(org)]);
    await seedStock(good.id, org.warehouseId, 100);
    await seedStock(bad.id, org.warehouseId, 1);
    const invoice = await createIssuedInvoice(org, [
      { itemId: good.id, quantity: 10, unitPrice: 150 },
      { itemId: bad.id, quantity: 10, unitPrice: 150 },
    ]);

    await expect(
      postDispatch(org.orgId, org.userId, {
        lines: [
          {
            invoiceId: invoice.id,
            itemId: good.id,
            warehouseId: org.warehouseId,
            quantity: 10,
          },
          {
            invoiceId: invoice.id,
            itemId: bad.id,
            warehouseId: org.warehouseId,
            quantity: 10,
          },
        ],
      })
    ).rejects.toThrow(DispatchError);

    // The first line succeeded inside the transaction; it must be undone.
    const stock = await prisma.stock.findUniqueOrThrow({
      where: { itemId_warehouseId: { itemId: good.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock.quantity)).toBe(100);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("cannot dispatch another organization's invoice", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);
    const item = await createItem(orgA);
    await seedStock(item.id, orgA.warehouseId, 100);
    const invoice = await createIssuedInvoice(orgA, [
      { itemId: item.id, quantity: 10, unitPrice: 150 },
    ]);

    await expect(
      postDispatch(orgB.orgId, orgB.userId, {
        lines: [
          {
            invoiceId: invoice.id,
            itemId: item.id,
            warehouseId: orgA.warehouseId,
            quantity: 10,
          },
        ],
      })
    ).rejects.toThrow(DispatchError);
  });

  it("collapses a duplicated line instead of shipping it twice", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 100);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 150 },
    ]);

    // The same line submitted twice — a double-clicked Confirm.
    await expect(
      postDispatch(org.orgId, org.userId, {
        lines: [
          {
            invoiceId: invoice.id,
            itemId: item.id,
            warehouseId: org.warehouseId,
            quantity: 20,
          },
          {
            invoiceId: invoice.id,
            itemId: item.id,
            warehouseId: org.warehouseId,
            quantity: 20,
          },
        ],
      })
    ).rejects.toThrow(/only 30 is pending/i);
  });

  it("writes an audit row naming the invoice and the goods", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 100);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 10, unitPrice: 150 },
    ]);

    await postDispatch(org.orgId, org.userId, {
      lines: [
        {
          invoiceId: invoice.id,
          itemId: item.id,
          warehouseId: org.warehouseId,
          quantity: 10,
        },
      ],
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "Invoice", entityId: invoice.id },
    });
    expect(audit.organizationId).toBe(org.orgId);
    expect(audit.userId).toBe(org.userId);
    expect(audit.action).toBe("ISSUE");
    expect(JSON.stringify(audit.newData)).toContain("GOODS_DISPATCHED");
  });

  it("does not let two concurrent dispatches oversell the shelf", async () => {
    const org = await createTestOrg();
    const item = await createItem(org);
    await seedStock(item.id, org.warehouseId, 10);

    // Two separate invoices, 10 each, against a shelf holding 10.
    const [first, second] = await Promise.all([
      createIssuedInvoice(org, [{ itemId: item.id, quantity: 10, unitPrice: 150 }]),
      createIssuedInvoice(org, [{ itemId: item.id, quantity: 10, unitPrice: 150 }]),
    ]);

    const attempts = await Promise.allSettled([
      postDispatch(org.orgId, org.userId, {
        lines: [
          {
            invoiceId: first.id,
            itemId: item.id,
            warehouseId: org.warehouseId,
            quantity: 10,
          },
        ],
      }),
      postDispatch(org.orgId, org.userId, {
        lines: [
          {
            invoiceId: second.id,
            itemId: item.id,
            warehouseId: org.warehouseId,
            quantity: 10,
          },
        ],
      }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const stock = await prisma.stock.findUniqueOrThrow({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock.quantity)).toBe(0);
  });
});

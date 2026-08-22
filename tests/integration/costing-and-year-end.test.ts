import { describe, expect, it } from "vitest";
import { prisma } from "@/backend/database/client";
import { valueClosingStock } from "@/backend/services/inventory/valuation";
import { postDispatch } from "@/backend/services/inventory/dispatch";
import {
  createIssuedInvoice,
  createItem,
  createTestOrg,
  seedStock,
  postJournal,
} from "./factories";

/**
 * Inventory costing (#1) and year-end retained earnings (#2).
 *
 * These two are tested together because they meet: closing stock is
 * simultaneously an asset on the balance sheet and a credit to profit, so a
 * mistake in either shows up as the statement failing to balance.
 */

describe("closing stock valuation", () => {
  it("values stock at weighted average when the item says so", async () => {
    const org = await createTestOrg();
    const item = await createItem(org, { valuationMethod: "WEIGHTED_AVERAGE" });
    await seedStock(item.id, org.warehouseId, 100, 25);

    const valuation = await valueClosingStock(org.orgId);
    expect(valuation.total).toBe(2500);
    expect(valuation.items[0].valuationMethod).toBe("WEIGHTED_AVERAGE");
  });

  it("honours FIFO, valuing what remains at the newest receipt costs", async () => {
    const org = await createTestOrg();
    const item = await createItem(org, { valuationMethod: "FIFO" });

    // Two receipts: 100 @ 10, then 100 @ 20. Average cost would be 15.
    for (const [quantity, rate, day] of [
      [100, 10, 1],
      [100, 20, 2],
    ] as const) {
      await prisma.stockMovement.create({
        data: {
          itemId: item.id,
          toWarehouseId: org.warehouseId,
          unitId: org.unitId,
          movementType: "PURCHASE",
          quantity,
          rate,
          totalValue: quantity * rate,
          date: new Date(2025, 0, day),
        },
      });
    }
    // 120 left: under FIFO the 80 oldest units went first, so what remains is
    // the 100 @ 20 plus 20 @ 10 = 2200. Weighted average would say 1800.
    await seedStock(item.id, org.warehouseId, 120, 15);

    const valuation = await valueClosingStock(org.orgId);
    expect(valuation.items[0].valuationMethod).toBe("FIFO");
    expect(valuation.total).toBe(2200);
  });

  it("excludes goods that are invoiced but not yet dispatched", async () => {
    const org = await createTestOrg();
    const item = await createItem(org, { valuationMethod: "WEIGHTED_AVERAGE" });
    await seedStock(item.id, org.warehouseId, 100, 10);

    // 30 sold but still on the shelf: their revenue is booked, so their cost
    // must not also sit in closing stock.
    await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 50 },
    ]);

    const valuation = await valueClosingStock(org.orgId);
    expect(valuation.items[0].physicalQty).toBe(100);
    expect(valuation.items[0].inProgressQty).toBe(30);
    expect(valuation.items[0].quantity).toBe(70);
    expect(valuation.total).toBe(700);
  });

  it("is unchanged by dispatching those goods", async () => {
    const org = await createTestOrg();
    const item = await createItem(org, { valuationMethod: "WEIGHTED_AVERAGE" });
    await seedStock(item.id, org.warehouseId, 100, 10);
    const invoice = await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 30, unitPrice: 50 },
    ]);

    const before = await valueClosingStock(org.orgId);

    await postDispatch(org.orgId, org.userId, {
      lines: [
        {
          invoiceId: invoice.id,
          itemId: item.id,
          warehouseId: org.warehouseId,
          quantity: 30,
        },
      ],
    });

    const after = await valueClosingStock(org.orgId);

    // Physical fell 100 → 70 and in-progress cleared 30 → 0, so the owned
    // quantity, and therefore the valuation, did not move.
    expect(after.items[0].physicalQty).toBe(70);
    expect(after.items[0].inProgressQty).toBe(0);
    expect(after.total).toBe(before.total);
  });

  it("never values an oversold item as a negative asset", async () => {
    const org = await createTestOrg();
    const item = await createItem(org, { valuationMethod: "WEIGHTED_AVERAGE" });
    await seedStock(item.id, org.warehouseId, 10, 10);
    await createIssuedInvoice(org, [
      { itemId: item.id, quantity: 40, unitPrice: 50 },
    ]);

    const valuation = await valueClosingStock(org.orgId);
    expect(valuation.items[0].quantity).toBe(0);
    expect(valuation.total).toBe(0);
  });

  it("scopes valuation to one organization", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);
    const itemA = await createItem(orgA);
    await seedStock(itemA.id, orgA.warehouseId, 50, 10);

    expect((await valueClosingStock(orgA.orgId)).total).toBe(500);
    expect((await valueClosingStock(orgB.orgId)).total).toBe(0);
  });
});

describe("retained earnings across fiscal years", () => {
  it("carries prior-year profit forward so the balance sheet still balances", async () => {
    const org = await createTestOrg();

    // FY2024-25: a sale of 1,000 settled in cash. Assets +1000, income +1000.
    const lastYear = new Date(2024, 5, 15); // June 2024 → FY starting Apr 2024
    await postJournal(
      org,
      [
        { groupKey: "assets", ledgerName: "Cash", debit: 1000 },
        { groupKey: "income", ledgerName: "Sales", credit: 1000 },
      ],
      lastYear
    );

    // Read the balance sheet as at a date inside the FOLLOWING fiscal year.
    const asOf = new Date(2025, 5, 15); // June 2025 → FY starting Apr 2025
    const fyStart = new Date(2025, 3, 1);

    const plLedgers = await prisma.ledger.findMany({
      where: {
        organizationId: org.orgId,
        group: { nature: { in: ["INCOME", "EXPENSES"] } },
      },
      include: { group: { select: { nature: true } } },
    });

    const allTime = await prisma.voucherEntry.findMany({
      where: {
        ledgerId: { in: plLedgers.map((l) => l.id) },
        voucher: { organizationId: org.orgId, date: { lte: asOf }, status: "APPROVED" },
      },
    });
    const thisYear = await prisma.voucherEntry.findMany({
      where: {
        ledgerId: { in: plLedgers.map((l) => l.id) },
        voucher: {
          organizationId: org.orgId,
          date: { gte: fyStart, lte: asOf },
          status: "APPROVED",
        },
      },
    });

    // Prior-year profit exists all-time but not in the current year — which is
    // precisely the equity that used to go missing.
    expect(allTime).toHaveLength(1);
    expect(thisYear).toHaveLength(0);

    const assetEntries = await prisma.voucherEntry.findMany({
      where: {
        ledger: { organizationId: org.orgId, group: { nature: "ASSETS" } },
        voucher: { organizationId: org.orgId, date: { lte: asOf }, status: "APPROVED" },
      },
    });
    const totalAssets = assetEntries.reduce(
      (sum, e) => sum + Number(e.debitAmount) - Number(e.creditAmount),
      0
    );

    // Retained earnings brought forward must equal the assets carried in.
    const profitAllTime = allTime.reduce(
      (sum, e) => sum + Number(e.creditAmount) - Number(e.debitAmount),
      0
    );
    const profitThisYear = thisYear.reduce(
      (sum, e) => sum + Number(e.creditAmount) - Number(e.debitAmount),
      0
    );
    const broughtForward = profitAllTime - profitThisYear;

    expect(broughtForward).toBe(1000);
    expect(totalAssets).toBe(1000);
    // Assets = Liabilities (0) + Equity (0 + broughtForward + 0)
    expect(totalAssets).toBe(broughtForward + profitThisYear);
  });
});

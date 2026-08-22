import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, closeTestDb, resetDatabase } from "./support/db";
import { createWorkOrderFixture, type WorkOrderFixture } from "./support/fixtures";
import { inParallel } from "./support/concurrency";

/**
 * Phase 2.10 — work-order double-relief race, against a real database.
 *
 * `POST .../work-orders/[id]/complete` reads the work order at
 * route.ts:58 and rejects anything not IN_PROGRESS at line 76 — both
 * outside the transaction, which opens at line 122. The
 * `workOrder.update` that moves it to COMPLETED (line 187) is
 * unconditional: `where: { id: workOrder.id }`.
 *
 * What makes this different from the two payroll races is that there is
 * no depleting resource to lean on. `wipValue` is recomputed each time by
 * summing the WO's ISSUE stock movements (line 105), and nothing ever
 * consumes or marks those movements. WO *issue* is protected almost by
 * accident — its stock decrement carries `quantity: { gte: required }`,
 * so a second issue finds nothing to take. Completion only ever *adds*:
 * finished goods are incremented and WIP is relieved. Run it twice and
 * both simply succeed.
 *
 * The consequence is inventory created from nothing: the same material is
 * relieved from WIP twice and the finished goods land twice, so
 * Stock-in-Hand is debited for value that was only ever issued once.
 */

vi.mock("@/backend/utils/with-org-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    withOrgAuth:
      (handler: (req: unknown, ctx: unknown) => unknown) =>
      (req: unknown, ctx: { params: Promise<Record<string, string>> }) =>
        ctx.params.then((p) =>
          handler(req, {
            orgId: p.orgId,
            userId: (globalThis as Record<string, unknown>).__TEST_USER_ID__,
            orgUser: { role: { permissions: [{ module: "*", actions: ["*"] }] } },
            params: p,
          })
        ),
    hasPermission: () => true,
    badRequest: (m: string, d?: unknown) =>
      NextResponse.json({ error: m, details: d }, { status: 400 }),
    forbidden: (m = "Forbidden") => NextResponse.json({ error: m }, { status: 403 }),
    notFound: (m = "Not found") => NextResponse.json({ error: m }, { status: 404 }),
  };
});

const db = testDb();
let fx: WorkOrderFixture;

/** 10 units produced from 5,000 of issued material. */
const COMPLETED_QTY = 10;

async function callComplete() {
  const { POST } = await import(
    "@/app/api/organizations/[orgId]/manufacturing/work-orders/[workOrderId]/complete/route"
  );
  return (await POST(
    new Request(
      `http://localhost/api/organizations/${fx.organizationId}/manufacturing/work-orders/${fx.workOrderId}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          completedQuantity: COMPLETED_QTY,
          scrapQuantity: 0,
          date: "2025-06-20",
        }),
      }
    ) as never,
    {
      params: Promise.resolve({
        orgId: fx.organizationId,
        workOrderId: fx.workOrderId,
      }),
    } as never
  )) as Response;
}

beforeEach(async () => {
  await resetDatabase(db);
  fx = await createWorkOrderFixture(db);
  (globalThis as Record<string, unknown>).__TEST_USER_ID__ = fx.userId;

  // Pre-create the finished-good stock row — the steady state for any
  // item that has been produced before.
  //
  // Without it the race hides behind a constraint that has nothing to do
  // with work orders: on the very first production run both requests find
  // no stock row and both call `tx.stock.create()`, so one dies on
  // `Stock(itemId, warehouseId)` being unique. That is incidental — it
  // protects only the first run of a given item into a given warehouse,
  // and once the row exists both requests take the `update` branch, where
  // nothing stands in the way.
  await db.stock.create({
    data: {
      itemId: fx.finishedItemId,
      warehouseId: fx.warehouseId,
      quantity: 0,
      avgCost: 0,
    },
  });
});

afterAll(async () => {
  await closeTestDb();
});

describe("work-order complete — sequential behaviour (baseline)", () => {
  it("completes once and refuses a second attempt", async () => {
    const first = await callComplete();
    expect(first.status).toBe(201);

    // The status guard catches this when the calls do not overlap.
    const second = await callComplete();
    expect(second.status).toBe(409);
  });
});

describe("work-order complete — concurrent requests", () => {
  it("completes exactly once when two requests race", async () => {
    const results = await inParallel(2, () => callComplete());
    const responses = results
      .filter((r): r is PromiseFulfilledResult<Response> => r.status === "fulfilled")
      .map((r) => r.value);

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status !== 201)).toHaveLength(1);
  });

  it("receives the finished goods exactly once", async () => {
    await inParallel(2, () => callComplete());

    const stock = await db.stock.findFirst({
      where: { itemId: fx.finishedItemId, warehouseId: fx.warehouseId },
      select: { quantity: true },
    });
    expect(
      Number(stock?.quantity ?? 0),
      "completing one work order twice would receive the finished goods twice"
    ).toBe(COMPLETED_QTY);
  });

  it("relieves WIP exactly once", async () => {
    await inParallel(2, () => callComplete());

    // Issue booked Dr WIP / Cr Stock-in-Hand for the material value.
    // Completion reverses it. Relieving twice drives WIP negative by the
    // issued value.
    const wip = await db.ledger.findFirst({
      where: { organizationId: fx.organizationId, name: "Work in Progress" },
      select: { currentBalance: true },
    });
    expect(Number(wip?.currentBalance ?? 0)).toBe(-fx.issuedValue);
  });

  it("debits Stock-in-Hand exactly once", async () => {
    await inParallel(2, () => callComplete());

    const sih = await db.ledger.findFirst({
      where: { organizationId: fx.organizationId, name: "Stock-in-Hand" },
      select: { currentBalance: true },
    });
    expect(
      Number(sih?.currentBalance ?? 0),
      "a second completion would book inventory value that was never issued"
    ).toBe(fx.issuedValue);
  });

  it("creates exactly one completion journal and one GRN movement", async () => {
    await inParallel(2, () => callComplete());

    const vouchers = await db.voucher.findMany({
      where: {
        organizationId: fx.organizationId,
        voucherNumber: { startsWith: "WO-COMP" },
      },
      select: { id: true },
    });
    expect(vouchers).toHaveLength(1);

    const grns = await db.stockMovement.findMany({
      where: {
        referenceType: "WORK_ORDER",
        referenceId: fx.workOrderId,
        movementType: "GRN",
      },
      select: { id: true },
    });
    expect(grns).toHaveLength(1);
  });
});

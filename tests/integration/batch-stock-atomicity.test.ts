import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/backend/database/client";
import { createTestOrg, createItem } from "./factories";
import { inParallel } from "./support/concurrency";

/**
 * A batch and the stock it represents are one fact.
 *
 * `POST /inventory/batches` wrote `batch.create` and then `stock.upsert` as two
 * separate statements with no transaction around them. A failure in between
 * left a batch row nobody could account for and a warehouse short by exactly
 * its quantity, with nothing in the books to say why. `PATCH` had the same
 * split on a quantity correction. Neither wrote an audit entry, so the one
 * table that could have explained the discrepancy said nothing.
 */

const sessionMock = vi.hoisted(() => ({
  value: null as { user: { id: string; email: string } } | null,
}));

vi.mock("@/backend/services/auth.service", () => ({
  auth: async () => sessionMock.value,
}));

beforeEach(() => {
  sessionMock.value = null;
});

function request(method: string, body: unknown) {
  return new NextRequest("https://example.test/api/organizations/x/inventory/batches", {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      host: "example.test",
    },
    body: JSON.stringify(body),
  });
}

async function batchTrackedItem(org: Awaited<ReturnType<typeof createTestOrg>>) {
  const item = await createItem(org);
  await prisma.item.update({ where: { id: item.id }, data: { trackBatch: true } });
  return item;
}

describe("batch creation", () => {
  it("writes the batch, the stock and the audit entry together", async () => {
    const org = await createTestOrg();
    const item = await batchTrackedItem(org);

    sessionMock.value = { user: { id: org.userId, email: "own@example.test" } };
    const { POST } = await import(
      "@/app/api/organizations/[orgId]/inventory/batches/route"
    );

    const response = await POST(
      request("POST", {
        itemId: item.id,
        warehouseId: org.warehouseId,
        batchNumber: "B-001",
        quantity: 40,
        costPrice: 25,
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );

    expect(response.status).toBe(201);

    const stock = await prisma.stock.findUnique({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock?.quantity)).toBe(40);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: org.orgId, entityType: "Batch", action: "CREATE" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.userId).toBe(org.userId);
  });

  it("leaves no batch behind when the write cannot complete", async () => {
    const org = await createTestOrg();
    const item = await batchTrackedItem(org);

    sessionMock.value = { user: { id: org.userId, email: "own@example.test" } };
    const { POST } = await import(
      "@/app/api/organizations/[orgId]/inventory/batches/route"
    );

    // Make the stock write fail after the batch row is already inserted, which
    // is precisely the window the missing transaction left open. Without the
    // transaction the batch survives and stock is never incremented.
    const spy = vi
      .spyOn(prisma, "$executeRaw")
      .mockImplementationOnce((() => {
        throw new Error("stock write failed");
      }) as unknown as typeof prisma.$executeRaw);

    const response = await POST(
      request("POST", {
        itemId: item.id,
        warehouseId: org.warehouseId,
        batchNumber: "B-DOOMED",
        quantity: 40,
        costPrice: 25,
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    spy.mockRestore();

    expect(response.status).toBe(500);

    await expect(
      prisma.batch.count({ where: { itemId: item.id, batchNumber: "B-DOOMED" } })
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { organizationId: org.orgId, entityType: "Batch" },
      })
    ).resolves.toBe(0);
    await expect(
      prisma.stock.count({
        where: { itemId: item.id, warehouseId: org.warehouseId },
      })
    ).resolves.toBe(0);
  });

  it("answers a lost duplicate race with 409, not 500", async () => {
    const org = await createTestOrg();
    const item = await batchTrackedItem(org);

    sessionMock.value = { user: { id: org.userId, email: "own@example.test" } };
    const { POST } = await import(
      "@/app/api/organizations/[orgId]/inventory/batches/route"
    );

    // Concurrent identical creates: each passes its own existence check before
    // any of them commits, so the pre-check cannot be what saves this.
    const results = await inParallel(4, () =>
      POST(
        request("POST", {
          itemId: item.id,
          warehouseId: org.warehouseId,
          batchNumber: "B-RACE",
          quantity: 10,
          costPrice: 5,
        }),
        { params: Promise.resolve({ orgId: org.orgId }) }
      )
    );

    const statuses = results
      .filter((r): r is PromiseFulfilledResult<Response> => r.status === "fulfilled")
      .map((r) => r.value.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 500)).toHaveLength(0);
    expect(statuses.every((s) => s === 201 || s === 409 || s === 400)).toBe(true);

    // Whatever the callers were told, the books hold one batch and its stock.
    await expect(
      prisma.batch.count({ where: { itemId: item.id, batchNumber: "B-RACE" } })
    ).resolves.toBe(1);
    const stock = await prisma.stock.findUnique({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock?.quantity)).toBe(10);
  });

  it("accumulates concurrent batches of the same item into one stock row", async () => {
    const org = await createTestOrg();
    const item = await batchTrackedItem(org);

    sessionMock.value = { user: { id: org.userId, email: "own@example.test" } };
    const { POST } = await import(
      "@/app/api/organizations/[orgId]/inventory/batches/route"
    );

    // Distinct batch numbers, same item and warehouse, no stock row yet. Under
    // `stock.upsert` the pg driver adapter resolves this as select-then-insert,
    // so the losers raise P2002 and take their own batch down with them.
    const results = await inParallel(5, (i) =>
      POST(
        request("POST", {
          itemId: item.id,
          warehouseId: org.warehouseId,
          batchNumber: `B-CONC-${i}`,
          quantity: 10,
          costPrice: 5,
        }),
        { params: Promise.resolve({ orgId: org.orgId }) }
      )
    );

    const created = results.filter(
      (r): r is PromiseFulfilledResult<Response> =>
        r.status === "fulfilled" && r.value.status === 201
    );
    expect(created).toHaveLength(5);

    const stock = await prisma.stock.findUnique({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock?.quantity)).toBe(50);
  });
});

describe("batch correction", () => {
  it("moves stock with the batch and records what changed", async () => {
    const org = await createTestOrg();
    const item = await batchTrackedItem(org);

    sessionMock.value = { user: { id: org.userId, email: "own@example.test" } };
    const { POST, PATCH } = await import(
      "@/app/api/organizations/[orgId]/inventory/batches/route"
    );

    const created = await POST(
      request("POST", {
        itemId: item.id,
        warehouseId: org.warehouseId,
        batchNumber: "B-EDIT",
        quantity: 40,
        costPrice: 25,
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    const { id: batchId } = (await created.json()) as { id: string };

    const response = await PATCH(request("PATCH", { batchId, quantity: 25 }), {
      params: Promise.resolve({ orgId: org.orgId }),
    });
    expect(response.status).toBe(200);

    const stock = await prisma.stock.findUnique({
      where: { itemId_warehouseId: { itemId: item.id, warehouseId: org.warehouseId } },
    });
    expect(Number(stock?.quantity)).toBe(25);

    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: org.orgId,
        entityType: "Batch",
        action: "UPDATE",
        entityId: batchId,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.oldData).toMatchObject({ quantity: 40 });
  });
});

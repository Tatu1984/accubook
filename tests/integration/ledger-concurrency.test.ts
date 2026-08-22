import { describe, expect, it } from "vitest";
import { prisma } from "@/backend/database/client";
import {
  getOrCreateNamedLedger,
  getOrCreatePartyLedger,
  getCashLedger,
} from "@/backend/utils/posting";
import { createTestOrg } from "./factories";

/**
 * The `getOrCreate*` time-of-check / time-of-use race (#3).
 *
 * These helpers ran `findFirst` then `create`. At Postgres's default READ
 * COMMITTED isolation two concurrent transactions both see no ledger, both
 * insert, and `@@unique([organizationId, name])` rejects the loser with P2002 —
 * which in Postgres poisons that entire transaction, so the invoice or payment
 * being posted around it fails outright.
 *
 * Only a real database can demonstrate this: a mocked client has no isolation
 * level, no constraint and no concurrency.
 */

/** Fire N transactions at once, each doing find-or-create for the same ledger. */
async function raceFor<T>(
  count: number,
  work: () => Promise<T>
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(Array.from({ length: count }, () => work()));
}

describe("concurrent ledger creation", () => {
  it("survives ten transactions creating the same named ledger at once", async () => {
    const org = await createTestOrg();

    const results = await raceFor(10, () =>
      prisma.$transaction((tx) =>
        getOrCreateNamedLedger(tx, org.orgId, "Sales - Goods", "Sales Accounts")
      )
    );

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(0);

    // Exactly one ledger, and everybody got the same id.
    const ledgers = await prisma.ledger.findMany({
      where: { organizationId: org.orgId, name: "Sales - Goods" },
    });
    expect(ledgers).toHaveLength(1);

    const ids = new Set(
      results
        .filter((r): r is PromiseFulfilledResult<{ id: string }> => r.status === "fulfilled")
        .map((r) => r.value.id)
    );
    expect(ids.size).toBe(1);
  });

  it("survives concurrent party-ledger creation for a first invoice", async () => {
    const org = await createTestOrg();
    const party = await prisma.party.findFirstOrThrow({
      where: { id: org.customerId },
    });

    const results = await raceFor(8, () =>
      prisma.$transaction((tx) =>
        getOrCreatePartyLedger(tx, org.orgId, party.id, party.name, party.type)
      )
    );

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);

    const ledgers = await prisma.ledger.findMany({
      where: { organizationId: org.orgId, name: party.name },
    });
    expect(ledgers).toHaveLength(1);
    // The winner still linked the party, so billwise tracking works.
    expect(ledgers[0].partyId).toBe(party.id);
  });

  it("survives concurrent cash-ledger creation", async () => {
    const org = await createTestOrg();
    await prisma.ledgerGroup.create({
      data: { organizationId: org.orgId, name: "Cash & Bank", nature: "ASSETS" },
    });

    const results = await raceFor(8, () =>
      prisma.$transaction((tx) => getCashLedger(tx, org.orgId))
    );

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);
    expect(
      await prisma.ledger.count({
        where: { organizationId: org.orgId, name: "Cash in Hand" },
      })
    ).toBe(1);
  });

  it("keeps each organization's ledger separate under concurrency", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);

    const results = await raceFor(6, () =>
      Promise.all([
        prisma.$transaction((tx) =>
          getOrCreateNamedLedger(tx, orgA.orgId, "Sales - Goods", "Sales Accounts")
        ),
        prisma.$transaction((tx) =>
          getOrCreateNamedLedger(tx, orgB.orgId, "Sales - Goods", "Sales Accounts")
        ),
      ])
    );

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);

    // One per organization — the unique constraint is scoped, not global.
    expect(
      await prisma.ledger.count({ where: { name: "Sales - Goods" } })
    ).toBe(2);
  });

  it("does not create a second ledger when one already exists", async () => {
    const org = await createTestOrg();

    await prisma.$transaction((tx) =>
      getOrCreateNamedLedger(tx, org.orgId, "Sales - Goods", "Sales Accounts")
    );
    const second = await prisma.$transaction((tx) =>
      getOrCreateNamedLedger(tx, org.orgId, "Sales - Goods", "Sales Accounts")
    );

    const ledgers = await prisma.ledger.findMany({
      where: { organizationId: org.orgId, name: "Sales - Goods" },
    });
    expect(ledgers).toHaveLength(1);
    expect(second.id).toBe(ledgers[0].id);
  });
});

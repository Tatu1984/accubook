import { describe, it, expect } from "vitest";
import { applyLedgerEntries, UnbalancedEntriesError } from "../posting";
import { D } from "@/backend/utils/money";

/**
 * Double entry is the invariant the entire ledger rests on. A single
 * unbalanced voucher makes the trial balance disagree from that date
 * onward, and nothing in the resulting statements says which entry did it.
 *
 * Every posting path funnels through `applyLedgerEntries`, so the check
 * belongs there: no caller can bypass it, and a posting path written
 * tomorrow is covered the day it appears.
 */
const entry = (ledgerId: string, debit: number, credit: number) => ({
  ledgerId,
  debitAmount: D(debit),
  creditAmount: D(credit),
});

// The guard runs before any database access, so a throwing stub proves the
// entries were rejected rather than merely failing later for another reason.
const txThatMustNotBeTouched = {
  ledger: {
    findMany: () => { throw new Error("reached the database despite unbalanced entries"); },
    update: () => { throw new Error("updated a balance despite unbalanced entries"); },
  },
} as never;

describe("applyLedgerEntries refuses to post unbalanced entries", () => {
  it("throws when debits exceed credits", async () => {
    await expect(
      applyLedgerEntries(txThatMustNotBeTouched, "org-1", [
        entry("led-salaries", 36800, 0),
        entry("led-payable", 0, 35000),
      ])
    ).rejects.toBeInstanceOf(UnbalancedEntriesError);
  });

  it("throws when credits exceed debits", async () => {
    await expect(
      applyLedgerEntries(txThatMustNotBeTouched, "org-1", [
        entry("led-bank", 1000, 0),
        entry("led-sales", 0, 1200),
      ])
    ).rejects.toBeInstanceOf(UnbalancedEntriesError);
  });

  it("names the difference so the offending entry can be found", async () => {
    await expect(
      applyLedgerEntries(txThatMustNotBeTouched, "org-1", [
        entry("led-salaries", 36800, 0),
        entry("led-payable", 0, 35000),
      ])
    ).rejects.toThrow(/1800/);
  });

  it("does not touch the ledger when the entries are rejected", async () => {
    // The stub throws a plain Error on any access; getting the typed error
    // back proves nothing was read or written.
    const err = await applyLedgerEntries(txThatMustNotBeTouched, "org-1", [
      entry("led-a", 5, 0),
      entry("led-b", 0, 4),
    ]).catch((e) => e);
    expect(err).toBeInstanceOf(UnbalancedEntriesError);
  });

  it("lets an empty set through unchanged", async () => {
    await expect(applyLedgerEntries(txThatMustNotBeTouched, "org-1", [])).resolves.toBeUndefined();
  });

  it("accepts a balanced set and proceeds to resolve ledgers", async () => {
    // Balanced input must get past the guard — proven by it reaching the
    // stub, which throws a different, non-UnbalancedEntriesError error.
    const err = await applyLedgerEntries(txThatMustNotBeTouched, "org-1", [
      entry("led-a", 59000, 0),
      entry("led-b", 0, 50000),
      entry("led-c", 0, 9000),
    ]).catch((e) => e);
    expect(err).not.toBeInstanceOf(UnbalancedEntriesError);
    expect((err as Error).message).toMatch(/reached the database/);
  });

  it("compares in decimal, so fractional paise do not slip through", async () => {
    await expect(
      applyLedgerEntries(txThatMustNotBeTouched, "org-1", [
        entry("led-a", 100.01, 0),
        entry("led-b", 0, 100.02),
      ])
    ).rejects.toBeInstanceOf(UnbalancedEntriesError);
  });
});

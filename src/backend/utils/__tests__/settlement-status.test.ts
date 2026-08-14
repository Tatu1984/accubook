import { describe, expect, it } from "vitest";
import { deriveSettlementStatus } from "@/backend/utils/posting";
import { D } from "@/backend/utils/money";

/**
 * `deriveSettlementStatus` replaced a branch that only ever moved a
 * document's status forward. The regression it fixes — a reversed payment
 * leaving the document reading PAID — is the first test below and the
 * reason this file exists.
 */

const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");
const NOW = new Date("2026-06-01T00:00:00Z");

function derive(opts: {
  total: string;
  paid: string;
  due: string;
  dueDate: Date;
  unpaid?: string;
}) {
  return deriveSettlementStatus({
    totalAmount: D(opts.total),
    amountPaid: D(opts.paid),
    amountDue: D(opts.due),
    dueDate: opts.dueDate,
    unpaidStatus: opts.unpaid ?? "SENT",
    now: NOW,
  });
}

describe("deriveSettlementStatus", () => {
  it("reverts to the unpaid resting state when a payment is reversed before the due date", () => {
    // The bounced-cheque case. Previously fell through every branch and
    // left the caller's existing "PAID" untouched.
    expect(derive({ total: "1000", paid: "0", due: "1000", dueDate: FUTURE })).toBe("SENT");
  });

  it("reverts to OVERDUE when a payment is reversed after the due date", () => {
    expect(derive({ total: "1000", paid: "0", due: "1000", dueDate: PAST })).toBe("OVERDUE");
  });

  it("is PAID when the balance is cleared", () => {
    expect(derive({ total: "1000", paid: "1000", due: "0", dueDate: FUTURE })).toBe("PAID");
  });

  it("is PAID when overpaid", () => {
    expect(derive({ total: "1000", paid: "1200", due: "-200", dueDate: FUTURE })).toBe("PAID");
  });

  it("is PARTIAL when something is received but a balance remains", () => {
    expect(derive({ total: "1000", paid: "400", due: "600", dueDate: FUTURE })).toBe("PARTIAL");
  });

  it("prefers PARTIAL over OVERDUE when part-paid and past due", () => {
    expect(derive({ total: "1000", paid: "400", due: "600", dueDate: PAST })).toBe("PARTIAL");
  });

  it("does not report a zero-total document as PAID", () => {
    expect(derive({ total: "0", paid: "0", due: "0", dueDate: PAST })).toBe("SENT");
  });

  it("closes a bill whose remaining balance was extinguished by withheld TDS", () => {
    // total 100, TDS 10 withheld, vendor paid the 90 balance.
    expect(
      derive({ total: "90", paid: "90", due: "0", dueDate: FUTURE, unpaid: "APPROVED" })
    ).toBe("PAID");
  });

  it("uses the caller's resting state, so bills come back to APPROVED not SENT", () => {
    expect(
      derive({ total: "1000", paid: "0", due: "1000", dueDate: FUTURE, unpaid: "APPROVED" })
    ).toBe("APPROVED");
  });

  it("is total — every combination resolves to a status", () => {
    const totals = ["0", "1000"];
    const paids = ["0", "400", "1000", "1200"];
    const dues = ["-200", "0", "600", "1000"];
    const dates = [PAST, FUTURE];
    const allowed = new Set(["PAID", "PARTIAL", "OVERDUE", "SENT"]);
    for (const total of totals) {
      for (const paid of paids) {
        for (const due of dues) {
          for (const dueDate of dates) {
            expect(allowed.has(derive({ total, paid, due, dueDate }))).toBe(true);
          }
        }
      }
    }
  });
});

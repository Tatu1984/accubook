import { describe, expect, it } from "vitest";
import { decideInvoiceEntries } from "@/backend/services/billing/post-invoice";
import { D } from "@/backend/utils/money";

/**
 * The invariant that matters: whatever combination of tax, rounding and
 * scheme an invoice carries, total debits equal total credits. A voucher
 * that fails this is an unbalanced journal entry, and the trial balance
 * stops proving anything.
 *
 * `roundOff` is signed, so it lands on whichever side keeps the entry
 * balanced — these tests pin that down in both directions.
 */

function totals(plan: ReturnType<typeof decideInvoiceEntries>) {
  const debit = plan.drCustomer.plus(
    plan.roundOff.isNegative() ? plan.roundOff.negated() : D(0)
  );
  const credit = plan.crSales
    .plus(plan.crGstOutput)
    .plus(plan.roundOff.isPositive() ? plan.roundOff : D(0));
  return { debit, credit };
}

describe("decideInvoiceEntries", () => {
  it("books a plain intrastate invoice: Dr customer, Cr sales + GST", () => {
    // ₹10,000 taxable + 18% GST split 9/9.
    const plan = decideInvoiceEntries({ taxable: "10000", gst: "1800", roundOff: "0" });
    expect(plan.drCustomer.toString()).toBe("11800");
    expect(plan.crSales.toString()).toBe("10000");
    expect(plan.crGstOutput.toString()).toBe("1800");
  });

  it("collapses to Dr customer / Cr sales when there is no GST", () => {
    // Composition supplier or zero-rated export: invoice POST has already
    // zeroed the per-line GST cells.
    const plan = decideInvoiceEntries({ taxable: "10000", gst: "0", roundOff: "0" });
    expect(plan.drCustomer.toString()).toBe("10000");
    expect(plan.crSales.toString()).toBe("10000");
    expect(plan.crGstOutput.toString()).toBe("0");
  });

  it("adds a positive round-off to what the customer owes, as a credit", () => {
    const plan = decideInvoiceEntries({ taxable: "10000", gst: "1800", roundOff: "0.40" });
    expect(plan.drCustomer.toString()).toBe("11800.4");
    const { debit, credit } = totals(plan);
    expect(debit.equals(credit)).toBe(true);
    expect(credit.minus(plan.crSales).minus(plan.crGstOutput).toString()).toBe("0.4");
  });

  it("takes a negative round-off off the customer and books it as a debit", () => {
    const plan = decideInvoiceEntries({ taxable: "10000", gst: "1800", roundOff: "-0.30" });
    expect(plan.drCustomer.toString()).toBe("11799.7");
    const { debit, credit } = totals(plan);
    expect(debit.equals(credit)).toBe(true);
  });

  it("keeps Dr = Cr across every combination", () => {
    const taxables = ["0", "1", "10000", "999999.99"];
    const gsts = ["0", "0.05", "1800", "179999.99"];
    const roundOffs = ["0", "0.01", "-0.01", "0.49", "-0.49"];
    for (const taxable of taxables) {
      for (const gst of gsts) {
        for (const roundOff of roundOffs) {
          const plan = decideInvoiceEntries({ taxable, gst, roundOff });
          const { debit, credit } = totals(plan);
          expect(
            debit.equals(credit),
            `Dr ${debit} ≠ Cr ${credit} for taxable=${taxable} gst=${gst} roundOff=${roundOff}`
          ).toBe(true);
        }
      }
    }
  });

  it("does not lose paise on a repeating-decimal tax rate", () => {
    // The float trap: 0.1 + 0.2 !== 0.3. Decimal end to end means the
    // customer's debit is exactly the sum of the credits.
    const plan = decideInvoiceEntries({ taxable: "0.1", gst: "0.2", roundOff: "0" });
    expect(plan.drCustomer.toString()).toBe("0.3");
    const { debit, credit } = totals(plan);
    expect(debit.equals(credit)).toBe(true);
  });

  it("mirrors the customer debit against the invoice face value", () => {
    // postInvoiceToGl refuses to post when this identity fails, because
    // the AR subledger would then disagree with the invoice document.
    const taxable = D("47500");
    const gst = D("8550");
    const roundOff = D("-0.50");
    const plan = decideInvoiceEntries({ taxable, gst, roundOff });
    const invoiceFaceValue = taxable.plus(gst).plus(roundOff);
    expect(plan.drCustomer.equals(invoiceFaceValue)).toBe(true);
  });
});

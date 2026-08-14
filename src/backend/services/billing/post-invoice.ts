import { D, sum, type DecimalLike } from "@/backend/utils/money";
import {
  applyLedgerEntries,
  generateVoucherNumber,
  getFiscalYearForDate,
  getOrCreateNamedLedger,
  getOrCreatePartyLedger,
  getVoucherTypeByCode,
  type Tx,
} from "@/backend/utils/posting";
import type { Prisma } from "@/generated/prisma";

/**
 * Post a sales Invoice to the General Ledger.
 *
 * This is the mirror of `postBillToGl`, and it did not exist. Bills booked
 * to the ledger the moment they were recorded; invoices never booked at
 * all. The consequences compounded:
 *
 *   - revenue never appeared in the Profit & Loss;
 *   - receivables never appeared on the Balance Sheet;
 *   - output GST was never recognised as a liability, so the books
 *     disagreed with whatever GSTR-3B reported;
 *   - a receipt against an unbooked invoice credited a customer ledger
 *     that had never been debited, pushing it into a bogus credit balance.
 *
 * Accounting shape — `decideInvoiceEntries` is the source of truth:
 *
 *   Regular invoice:
 *     Dr Customer                 taxable + gst + roundOff
 *       Cr Sales                  taxable
 *       Cr GST Output             gst
 *       Cr/Dr Round Off           roundOff (either direction)
 *
 *   Composition supplier (we are on the composition scheme):
 *     The invoice must not charge GST to the customer — invoice POST
 *     already zeroes the per-line GST cells — so `gst` is zero and the
 *     entry collapses to Dr Customer / Cr Sales. The flat composition
 *     tax is paid from our own pocket and booked separately via CMP-08,
 *     not against the customer.
 *
 *   Export / zero-rated:
 *     Same as regular with gst = 0.
 *
 * Idempotent: refuses to re-post an invoice that already has voucherId.
 */

export type PostInvoiceResult = {
  voucherId: string;
  voucherNumber: string;
  totalDebit: string;
  totalCredit: string;
  composition: boolean;
};

export type PostInvoiceOptions = {
  invoiceId: string;
  organizationId: string;
  userId: string;
};

export type InvoiceEntryPlan = {
  drCustomer: Prisma.Decimal;
  crSales: Prisma.Decimal;
  crGstOutput: Prisma.Decimal;
  /** Positive = credit Round Off (gain); negative = debit Round Off (loss). */
  roundOff: Prisma.Decimal;
};

/**
 * Pure function — what each ledger line carries, given the invoice's
 * money. Exported so the Dr = Cr invariant can be locked down in a unit
 * test without touching the database.
 *
 * `discount` is not a separate line: invoice POST already nets discounts
 * into each line's taxable amount, so `taxable` is post-discount and
 * booking a discount ledger here would double-count it.
 */
export function decideInvoiceEntries(opts: {
  taxable: DecimalLike;
  gst: DecimalLike;
  roundOff: DecimalLike;
}): InvoiceEntryPlan {
  const taxable = D(opts.taxable);
  const gst = D(opts.gst);
  const roundOff = D(opts.roundOff);

  // The customer owes the invoice face value, which includes the rounding
  // adjustment printed on the document.
  const drCustomer = taxable.plus(gst).plus(roundOff);

  return {
    drCustomer,
    crSales: taxable,
    crGstOutput: gst,
    roundOff,
  };
}

export async function postInvoiceToGl(
  tx: Tx,
  opts: PostInvoiceOptions
): Promise<PostInvoiceResult> {
  const invoice = await tx.invoice.findFirst({
    where: { id: opts.invoiceId, organizationId: opts.organizationId },
    include: {
      party: { select: { id: true, name: true, type: true } },
      items: {
        select: {
          taxableAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          cessAmount: true,
        },
      },
    },
  });
  if (!invoice) {
    throw new Error(`Invoice ${opts.invoiceId} not found`);
  }
  if (invoice.voucherId) {
    throw new Error(
      `Invoice ${invoice.invoiceNumber} is already posted (voucher ${invoice.voucherId}); refusing to re-post.`
    );
  }

  const org = await tx.organization.findUnique({
    where: { id: opts.organizationId },
    select: { compositionScheme: true },
  });
  const composition = !!org?.compositionScheme;

  // Line items are authoritative — the same rule postBillToGl follows.
  // The header `subtotal` / `taxAmount` columns are derived and could in
  // principle drift; the rows are what GSTR-1 reads.
  const taxable = sum(invoice.items.map((i) => D(i.taxableAmount)));
  const gst = sum(
    invoice.items.map((i) =>
      D(i.cgstAmount ?? 0)
        .plus(D(i.sgstAmount ?? 0))
        .plus(D(i.igstAmount ?? 0))
        .plus(D(i.cessAmount ?? 0))
    )
  );

  const plan = decideInvoiceEntries({
    taxable,
    gst,
    roundOff: invoice.roundOff ?? 0,
  });

  // A composition supplier must not be charging GST on an outward invoice.
  // If one slipped through, posting it would book an output-tax liability
  // the supplier does not actually owe in that form.
  if (composition && plan.crGstOutput.greaterThan(D(0))) {
    throw new Error(
      `Invoice ${invoice.invoiceNumber} carries GST but the organization is on the composition scheme, ` +
        `which cannot charge GST to a customer. Correct the invoice before posting.`
    );
  }

  // What we are about to debit the customer must equal what the invoice
  // says they owe. If the header totals and the line rows have drifted,
  // posting would leave the AR subledger disagreeing with the invoice
  // document — the exact class of silent divergence this whole change
  // exists to remove.
  if (!plan.drCustomer.equals(D(invoice.totalAmount))) {
    throw new Error(
      `Invoice ${invoice.invoiceNumber} does not reconcile: line items total ` +
        `${plan.drCustomer.toString()} but the invoice records ${D(invoice.totalAmount).toString()}. ` +
        `Correct the invoice before issuing it.`
    );
  }

  const fy = await getFiscalYearForDate(tx, opts.organizationId, invoice.date);

  // Resolve ledgers.
  const partyLedger = await getOrCreatePartyLedger(
    tx,
    opts.organizationId,
    invoice.partyId,
    invoice.party.name,
    invoice.party.type
  );
  const salesLedger = await getOrCreateNamedLedger(
    tx,
    opts.organizationId,
    "Sales - Goods",
    "Sales Accounts"
  );
  let gstOutputLedgerId: string | null = null;
  if (plan.crGstOutput.greaterThan(D(0))) {
    const l = await getOrCreateNamedLedger(
      tx,
      opts.organizationId,
      "GST Output",
      "Duties & Taxes"
    );
    gstOutputLedgerId = l.id;
  }
  let roundOffLedgerId: string | null = null;
  if (!plan.roundOff.isZero()) {
    const l = await getOrCreateNamedLedger(
      tx,
      opts.organizationId,
      "Round Off",
      "Indirect Expenses"
    );
    roundOffLedgerId = l.id;
  }

  const voucherType = await getVoucherTypeByCode(tx, "SALES");
  const voucherNumber = await generateVoucherNumber(
    tx,
    opts.organizationId,
    voucherType.id,
    fy.id,
    "SAL"
  );

  type EntryRow = {
    voucherId: string;
    ledgerId: string;
    debitAmount: Prisma.Decimal;
    creditAmount: Prisma.Decimal;
    sequence: number;
  };

  const totalDebit = plan.drCustomer.plus(
    plan.roundOff.isNegative() ? plan.roundOff.negated() : D(0)
  );
  const totalCredit = plan.crSales
    .plus(plan.crGstOutput)
    .plus(plan.roundOff.isPositive() ? plan.roundOff : D(0));

  // Dr must equal Cr by construction. If it doesn't, `decideInvoiceEntries`
  // has a bug — refuse rather than write an unbalanced voucher.
  if (!totalDebit.equals(totalCredit)) {
    throw new Error(
      `Invoice posting math failed: Dr ${totalDebit.toString()} ≠ Cr ${totalCredit.toString()} ` +
        `(invoice ${invoice.invoiceNumber})`
    );
  }

  const voucher = await tx.voucher.create({
    data: {
      organizationId: opts.organizationId,
      fiscalYearId: fy.id,
      voucherTypeId: voucherType.id,
      voucherNumber,
      date: invoice.date,
      narration: `Invoice ${invoice.invoiceNumber} — ${invoice.party.name}`,
      referenceNo: invoice.invoiceNumber,
      totalDebit,
      totalCredit,
      status: "APPROVED",
      isPosted: true,
      postedAt: new Date(),
      createdById: opts.userId,
      metadata: {
        kind: "INVOICE_POSTING",
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        composition,
        supplyType: invoice.supplyType ?? null,
        placeOfSupply: invoice.placeOfSupply ?? null,
      },
    },
    select: { id: true, voucherNumber: true },
  });

  const entries: EntryRow[] = [];
  let seq = 0;
  if (plan.drCustomer.greaterThan(D(0))) {
    entries.push({
      voucherId: voucher.id,
      ledgerId: partyLedger.id,
      debitAmount: plan.drCustomer,
      creditAmount: D(0),
      sequence: seq++,
    });
  }
  if (plan.crSales.greaterThan(D(0))) {
    entries.push({
      voucherId: voucher.id,
      ledgerId: salesLedger.id,
      debitAmount: D(0),
      creditAmount: plan.crSales,
      sequence: seq++,
    });
  }
  if (gstOutputLedgerId && plan.crGstOutput.greaterThan(D(0))) {
    entries.push({
      voucherId: voucher.id,
      ledgerId: gstOutputLedgerId,
      debitAmount: D(0),
      creditAmount: plan.crGstOutput,
      sequence: seq++,
    });
  }
  if (roundOffLedgerId && !plan.roundOff.isZero()) {
    // A positive roundOff was added to what the customer owes, so the
    // extra lands as a credit (a small gain). A negative one is a debit.
    entries.push({
      voucherId: voucher.id,
      ledgerId: roundOffLedgerId,
      debitAmount: plan.roundOff.isNegative() ? plan.roundOff.negated() : D(0),
      creditAmount: plan.roundOff.isPositive() ? plan.roundOff : D(0),
      sequence: seq++,
    });
  }
  await tx.voucherEntry.createMany({ data: entries });

  await applyLedgerEntries(
    tx,
    opts.organizationId,
    entries.map((e) => ({
      ledgerId: e.ledgerId,
      debitAmount: e.debitAmount,
      creditAmount: e.creditAmount,
    }))
  );

  await tx.invoice.update({
    where: { id: invoice.id },
    data: { voucherId: voucher.id },
  });

  return {
    voucherId: voucher.id,
    voucherNumber: voucher.voucherNumber,
    totalDebit: totalDebit.toString(),
    totalCredit: totalCredit.toString(),
    composition,
  };
}

/**
 * Reverse an invoice's ledger effect, for cancellation.
 *
 * Rather than deleting the voucher — which would erase the audit trail —
 * the entries are re-applied with debit and credit swapped and the
 * voucher is marked CANCELLED, matching how bill and voucher reversal
 * already work.
 */
export async function reverseInvoicePosting(
  tx: Tx,
  opts: { invoiceId: string; organizationId: string }
): Promise<{ reversedVoucherId: string } | null> {
  const invoice = await tx.invoice.findFirst({
    where: { id: opts.invoiceId, organizationId: opts.organizationId },
    select: {
      id: true,
      voucherId: true,
      voucher: {
        select: {
          id: true,
          entries: {
            select: { ledgerId: true, debitAmount: true, creditAmount: true },
          },
        },
      },
    },
  });
  if (!invoice?.voucher) return null;

  await applyLedgerEntries(
    tx,
    opts.organizationId,
    invoice.voucher.entries.map((e) => ({
      ledgerId: e.ledgerId,
      // Swapped on purpose — this backs the original entry out.
      debitAmount: D(e.creditAmount),
      creditAmount: D(e.debitAmount),
    }))
  );

  await tx.voucher.update({
    where: { id: invoice.voucher.id },
    data: { status: "CANCELLED", isPosted: false },
  });

  // Detach so the invoice can be re-posted after correction. The voucher
  // itself stays in the books as a cancelled document.
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { voucherId: null },
  });

  return { reversedVoucherId: invoice.voucher.id };
}

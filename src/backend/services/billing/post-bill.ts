import { D, sum, type DecimalLike } from "@/backend/utils/money";
import {
  applyLedgerEntries,
  generateVoucherNumber,
  getFiscalYearForDate,
  getOrCreateNamedLedger,
  getOrCreatePartyLedger,
  getTdsPayableLedger,
  getVoucherTypeByCode,
  type Tx,
} from "@/backend/utils/posting";
import { computeTds, type DeducteeType, type TdsSectionCode } from "@/backend/services/tax/tds";
import type { Prisma } from "@/generated/prisma";

/**
 * Post a Bill to the General Ledger.
 *
 * Until this function existed, bills were document records — the GL
 * impact only landed at payment time, which violates accrual accounting
 * (expenses should book when the bill is recorded, not when cash leaves).
 *
 * Accounting shape — see `decideEntries` for the source of truth.
 * Briefly:
 *
 *   Regular bill, ITC eligible (default):
 *     Dr Purchase Accounts        taxable
 *     Dr GST Input                gst
 *       Cr Vendor                 taxable + gst − tds
 *       Cr TDS Payable            tds        [if tdsSection]
 *
 *   RCM (reverse charge — vendor didn't charge GST):
 *     Dr Purchase Accounts        taxable
 *     Dr GST Input                gst        [RCM ITC, claim after paying]
 *       Cr Vendor                 taxable − tds        [vendor paid only taxable]
 *       Cr GST Output             gst        [we owe govt directly]
 *       Cr TDS Payable            tds        [if tdsSection]
 *
 *   Composition recipient (we are composition supplier receiving bill):
 *     Dr Purchase Accounts        taxable + gst   [GST is part of expense; no ITC]
 *       Cr Vendor                 taxable + gst − tds
 *       Cr TDS Payable            tds        [if tdsSection]
 *
 *   Composition + RCM:
 *     Dr Purchase Accounts        taxable + gst
 *       Cr Vendor                 taxable − tds
 *       Cr GST Output             gst
 *       Cr TDS Payable            tds        [if tdsSection]
 *
 * Idempotent: refuses to re-post a bill that already has voucherId set.
 *
 * Caller is the bills POST route (when bill is created APPROVED) or
 * `maybePromoteEntity` (when a workflow lifts the bill to APPROVED).
 */

export type PostBillResult = {
  voucherId: string;
  voucherNumber: string;
  totalDebit: string;
  totalCredit: string;
  tdsAmount?: string;
  rcm: boolean;
  composition: boolean;
};

export type PostBillOptions = {
  billId: string;
  organizationId: string;
  userId: string;
  /** Optional TDS at bill time (accrual). Section + deductee + noPan. */
  tds?: {
    section: TdsSectionCode;
    deducteeType?: DeducteeType;
    noPan?: boolean;
  };
};

type EntryPlan = {
  drExpense: Prisma.Decimal;
  drGstInput: Prisma.Decimal;
  crVendor: Prisma.Decimal;
  crGstOutputRcm: Prisma.Decimal;
  crTds: Prisma.Decimal;
};

/**
 * Pure function — computes what each ledger line should carry given the
 * bill's tax profile. Exported so a unit test can lock down the four
 * combinations (regular / RCM / composition / both) without touching
 * the DB.
 */
export function decideBillEntries(opts: {
  taxable: DecimalLike;
  gst: DecimalLike;
  tdsAmount: DecimalLike;
  reverseCharge: boolean;
  composition: boolean;
}): EntryPlan {
  const taxable = D(opts.taxable);
  const gst = D(opts.gst);
  const tds = D(opts.tdsAmount);
  const total = taxable.plus(gst);

  // Composition recipients can't claim ITC — GST collapses into expense.
  const canClaimItc = !opts.composition;
  const drExpense = canClaimItc ? taxable : total;
  const drGstInput = canClaimItc ? gst : D(0);

  // RCM: vendor paid only the taxable portion. The GST flows through us
  // to the govt as RCM payable instead of being part of what we owe the
  // vendor.
  const vendorBase = opts.reverseCharge ? taxable : total;
  const crVendor = vendorBase.minus(tds);
  const crGstOutputRcm = opts.reverseCharge ? gst : D(0);
  const crTds = tds;

  return { drExpense, drGstInput, crVendor, crGstOutputRcm, crTds };
}

export async function postBillToGl(
  tx: Tx,
  opts: PostBillOptions
): Promise<PostBillResult> {
  const bill = await tx.bill.findFirst({
    where: { id: opts.billId, organizationId: opts.organizationId },
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
  if (!bill) {
    throw new Error(`Bill ${opts.billId} not found`);
  }
  if (bill.voucherId) {
    throw new Error(`Bill ${bill.billNumber} is already posted (voucher ${bill.voucherId}); refusing to re-post.`);
  }

  const org = await tx.organization.findUnique({
    where: { id: opts.organizationId },
    select: { compositionScheme: true },
  });
  const composition = !!org?.compositionScheme;

  // Aggregate taxable + GST from line items (DB rows are authoritative).
  const taxable = sum(bill.items.map((i) => D(i.taxableAmount)));
  const gst = sum(
    bill.items.map((i) =>
      D(i.cgstAmount ?? 0)
        .plus(D(i.sgstAmount ?? 0))
        .plus(D(i.igstAmount ?? 0))
        .plus(D(i.cessAmount ?? 0))
    )
  );

  // TDS pre-flight — reuse the YTD-aggregate threshold logic from the
  // payment flow. Aggregate = sum of bills with the same vendor +
  // section in the current FY (we don't yet capture section on prior
  // bills, so this is a forward-only correctness improvement).
  const fy = await getFiscalYearForDate(tx, opts.organizationId, bill.date);
  let tdsAmount = D(0);
  let tdsRate = D(0);
  let tdsRationale: string | null = null;
  if (opts.tds) {
    // Section 194Q (and 206C-1H on the sales side) measure the threshold
    // on the purchase value NET of GST, per CBDT Circular 13/2021 Q.5.
    // We aggregate `subtotal` (= sum of taxable amounts), not
    // `totalAmount` (which includes GST). Aggregating gross would
    // cross the ₹50L threshold earlier than legally required and
    // over-deduct on bills near the boundary.
    const ytd = await tx.bill.aggregate({
      where: {
        organizationId: opts.organizationId,
        partyId: bill.partyId,
        date: { gte: fy.startDate, lte: bill.date },
        tdsSection: opts.tds.section,
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      _sum: { subtotal: true },
    });
    const ytdAggregate = D(ytd._sum.subtotal ?? 0);
    const tdsResult = computeTds({
      section: opts.tds.section,
      deducteeType: opts.tds.deducteeType ?? "COMPANY_OTHER",
      amount: taxable,
      ytdAggregate,
      noPan: opts.tds.noPan,
    });
    tdsAmount = D(tdsResult.amount);
    tdsRate = D(tdsResult.rate);
    tdsRationale = tdsResult.appliedReason;
  }

  const plan = decideBillEntries({
    taxable,
    gst,
    tdsAmount,
    reverseCharge: bill.reverseCharge,
    composition,
  });

  // Resolve ledgers.
  const partyLedger = await getOrCreatePartyLedger(
    tx,
    opts.organizationId,
    bill.partyId,
    bill.party.name,
    bill.party.type
  );
  const purchaseLedger = await getOrCreateNamedLedger(
    tx,
    opts.organizationId,
    "Purchase Accounts",
    "Direct Expenses"
  );
  let gstInputLedgerId: string | null = null;
  if (plan.drGstInput.greaterThan(D(0))) {
    const l = await getOrCreateNamedLedger(tx, opts.organizationId, "GST Input", "Duties & Taxes");
    gstInputLedgerId = l.id;
  }
  let gstOutputRcmLedgerId: string | null = null;
  if (plan.crGstOutputRcm.greaterThan(D(0))) {
    const l = await getOrCreateNamedLedger(tx, opts.organizationId, "GST Output", "Duties & Taxes");
    gstOutputRcmLedgerId = l.id;
  }
  let tdsPayableLedgerId: string | null = null;
  if (plan.crTds.greaterThan(D(0))) {
    const l = await getTdsPayableLedger(tx, opts.organizationId);
    tdsPayableLedgerId = l.id;
  }

  // Voucher type + number.
  const voucherType = await getVoucherTypeByCode(tx, "PURCHASE");
  const voucherNumber = await generateVoucherNumber(
    tx,
    opts.organizationId,
    voucherType.id,
    fy.id,
    "PUR"
  );

  const totalDebit = plan.drExpense.plus(plan.drGstInput);
  const totalCredit = plan.crVendor.plus(plan.crGstOutputRcm).plus(plan.crTds);
  // Sanity check: Dr should equal Cr by construction. If they diverge,
  // there's a bug in `decideBillEntries`. Don't post a broken voucher.
  if (!totalDebit.equals(totalCredit)) {
    throw new Error(
      `Bill posting math failed: Dr ${totalDebit.toString()} ≠ Cr ${totalCredit.toString()} (bill ${bill.billNumber})`
    );
  }

  const voucher = await tx.voucher.create({
    data: {
      organizationId: opts.organizationId,
      fiscalYearId: fy.id,
      voucherTypeId: voucherType.id,
      voucherNumber,
      date: bill.date,
      narration: `Bill ${bill.billNumber} — ${bill.party.name}${bill.reverseCharge ? " (RCM)" : ""}`,
      referenceNo: bill.vendorBillNo,
      totalDebit,
      totalCredit,
      status: "APPROVED",
      isPosted: true,
      postedAt: new Date(),
      createdById: opts.userId,
      metadata: {
        kind: "BILL_POSTING",
        billId: bill.id,
        billNumber: bill.billNumber,
        rcm: bill.reverseCharge,
        composition,
        tdsSection: opts.tds?.section ?? null,
        tdsAmount: tdsAmount.toString(),
      },
    },
    select: { id: true, voucherNumber: true },
  });

  type EntryRow = {
    voucherId: string;
    ledgerId: string;
    debitAmount: Prisma.Decimal;
    creditAmount: Prisma.Decimal;
    sequence: number;
  };
  const entries: EntryRow[] = [];
  let seq = 0;
  if (plan.drExpense.greaterThan(D(0))) {
    entries.push({
      voucherId: voucher.id,
      ledgerId: purchaseLedger.id,
      debitAmount: plan.drExpense,
      creditAmount: D(0),
      sequence: seq++,
    });
  }
  if (gstInputLedgerId && plan.drGstInput.greaterThan(D(0))) {
    entries.push({
      voucherId: voucher.id,
      ledgerId: gstInputLedgerId,
      debitAmount: plan.drGstInput,
      creditAmount: D(0),
      sequence: seq++,
    });
  }
  if (plan.crVendor.greaterThan(D(0))) {
    entries.push({
      voucherId: voucher.id,
      ledgerId: partyLedger.id,
      debitAmount: D(0),
      creditAmount: plan.crVendor,
      sequence: seq++,
    });
  }
  if (gstOutputRcmLedgerId && plan.crGstOutputRcm.greaterThan(D(0))) {
    entries.push({
      voucherId: voucher.id,
      ledgerId: gstOutputRcmLedgerId,
      debitAmount: D(0),
      creditAmount: plan.crGstOutputRcm,
      sequence: seq++,
    });
  }
  if (tdsPayableLedgerId && plan.crTds.greaterThan(D(0))) {
    entries.push({
      voucherId: voucher.id,
      ledgerId: tdsPayableLedgerId,
      debitAmount: D(0),
      creditAmount: plan.crTds,
      sequence: seq++,
    });
  }
  await tx.voucherEntry.createMany({ data: entries });

  await applyLedgerEntries(
    tx,
    entries.map((e) => ({
      ledgerId: e.ledgerId,
      debitAmount: e.debitAmount,
      creditAmount: e.creditAmount,
    }))
  );

  // Link the bill to its booking voucher and stamp TDS context.
  // amountDue must be net of TDS withheld — that's what the vendor is
  // owed, matching `crVendor` in the posting voucher. Without this the
  // AP subledger drifts from the vendor ledger by exactly the TDS sum.
  const grossTotal = D(bill.totalAmount);
  const newAmountDue = grossTotal.minus(tdsAmount);
  await tx.bill.update({
    where: { id: bill.id },
    data: {
      voucherId: voucher.id,
      tdsAmount,
      tdsSection: opts.tds?.section ?? null,
      tdsRationale,
      amountDue: newAmountDue,
    },
  });

  // Persist the TdsDeduction row so Form 16A picks it up at bill time.
  if (opts.tds && tdsAmount.greaterThan(D(0))) {
    await tx.tdsDeduction.create({
      data: {
        organizationId: opts.organizationId,
        billId: bill.id,
        partyId: bill.partyId,
        voucherId: voucher.id,
        fiscalYearId: fy.id,
        section: opts.tds.section,
        deducteeType: opts.tds.deducteeType ?? "COMPANY_OTHER",
        ratePercent: tdsRate,
        baseAmount: taxable,
        taxAmount: tdsAmount,
        noPan: opts.tds.noPan ?? false,
        rationale: tdsRationale ?? "DEDUCTED",
        deductedAt: bill.date,
      },
    });
  }

  return {
    voucherId: voucher.id,
    voucherNumber: voucher.voucherNumber,
    totalDebit: totalDebit.toString(),
    totalCredit: totalCredit.toString(),
    tdsAmount: opts.tds ? tdsAmount.toString() : undefined,
    rcm: bill.reverseCharge,
    composition,
  };
}

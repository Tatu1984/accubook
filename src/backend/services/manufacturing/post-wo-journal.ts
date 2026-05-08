import { Prisma } from "@/generated/prisma";
import {
  applyLedgerEntries,
  generateVoucherNumber,
  getFiscalYearForDate,
  getOrCreateNamedLedger,
  getVoucherTypeByCode,
} from "@/backend/utils/posting";
import { D } from "@/backend/utils/money";
import type { Tx } from "@/backend/utils/posting";

/**
 * Shared journal-entry poster for work-order ISSUE and COMPLETE flows.
 *
 * Both flows post a 2-line JV between Stock-in-Hand and Work in Progress;
 * the only thing that varies is the direction:
 *
 *   ISSUE:    Dr Work in Progress / Cr Stock-in-Hand
 *   COMPLETE: Dr Stock-in-Hand    / Cr Work in Progress
 *
 * Returns the new voucher's id so callers can persist it on the WO and
 * include it in their audit log entry.
 */
export type WorkOrderJvKind = "ISSUE" | "COMPLETE";

export interface PostWorkOrderJvArgs {
  tx: Tx;
  orgId: string;
  userId: string;
  date: Date;
  amount: Prisma.Decimal;
  kind: WorkOrderJvKind;
  workOrderId: string;
  workOrderNumber: string;
  narration: string;
  /** Free-form metadata persisted on the voucher (e.g. component count, scrap qty). */
  extraMetadata?: Record<string, unknown>;
}

export async function postWorkOrderJv(
  args: PostWorkOrderJvArgs
): Promise<{ voucherId: string }> {
  const {
    tx,
    orgId,
    userId,
    date,
    amount,
    kind,
    workOrderId,
    workOrderNumber,
    narration,
    extraMetadata = {},
  } = args;

  const wipLedger = await getOrCreateNamedLedger(
    tx,
    orgId,
    "Work in Progress",
    "Stock-in-Hand"
  );
  const stockLedger = await getOrCreateNamedLedger(
    tx,
    orgId,
    "Stock-in-Hand",
    "Stock-in-Hand"
  );

  const voucherType = await getVoucherTypeByCode(tx, "JOURNAL");
  const fy = await getFiscalYearForDate(tx, orgId, date);
  const prefix = kind === "ISSUE" ? "WO-ISSUE" : "WO-COMP";
  const voucherNumber = await generateVoucherNumber(
    tx,
    orgId,
    voucherType.id,
    fy.id,
    prefix
  );

  // Decide the direction: ISSUE → Dr WIP / Cr Stock; COMPLETE → reverse.
  const debitLedger = kind === "ISSUE" ? wipLedger : stockLedger;
  const creditLedger = kind === "ISSUE" ? stockLedger : wipLedger;

  const voucher = await tx.voucher.create({
    data: {
      organizationId: orgId,
      fiscalYearId: fy.id,
      voucherTypeId: voucherType.id,
      voucherNumber,
      date,
      narration,
      totalDebit: amount,
      totalCredit: amount,
      status: "APPROVED",
      isPosted: true,
      postedAt: new Date(),
      createdById: userId,
      metadata: {
        kind: kind === "ISSUE" ? "WORK_ORDER_ISSUE" : "WORK_ORDER_COMPLETE",
        workOrderId,
        workOrderNumber,
        ...extraMetadata,
      },
    },
    select: { id: true },
  });

  await tx.voucherEntry.createMany({
    data: [
      {
        voucherId: voucher.id,
        ledgerId: debitLedger.id,
        debitAmount: amount,
        creditAmount: D(0),
        sequence: 0,
      },
      {
        voucherId: voucher.id,
        ledgerId: creditLedger.id,
        debitAmount: D(0),
        creditAmount: amount,
        sequence: 1,
      },
    ],
  });

  await applyLedgerEntries(tx, [
    { ledgerId: debitLedger.id, debitAmount: amount, creditAmount: D(0) },
    { ledgerId: creditLedger.id, debitAmount: D(0), creditAmount: amount },
  ]);

  return { voucherId: voucher.id };
}

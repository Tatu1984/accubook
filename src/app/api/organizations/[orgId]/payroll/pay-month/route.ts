import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound, hasPermission, forbidden } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D, sum } from "@/backend/utils/money";
import {
  applyLedgerEntries,
  generateVoucherNumber,
  getCashLedger,
  getFiscalYearForDate,
  getOrCreateBankLedger,
  getOrCreateNamedLedger,
  getVoucherTypeByCode,
} from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payMonthSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  /** Optional — if omitted, the JV credits "Cash in Hand". */
  bankAccountId: z.string().optional(),
  /** Optional disbursement date; defaults to today. */
  paidAt: z.string().optional().transform((v) => (v ? new Date(v) : new Date())),
  paidVia: z.string().optional(),
  transactionRef: z.string().optional(),
});

/**
 * Mark a posted payroll month as PAID and book the cash outflow.
 *
 * Sequence in the payroll pipeline:
 *   1. /payroll/calculate          — pure compute (no persistence)
 *   2. /payroll/calculate?action=generate-payslips
 *                                  — persists DRAFT payslips
 *   3. /payroll/post-month         — books salary expense + payable JV
 *                                    (Dr Salaries & Wages / Cr Salaries Payable + others)
 *                                    payslips → PROCESSED
 *   4. /payroll/pay-month  ← THIS  — settles the Salaries Payable from
 *                                    the bank: Dr Salaries Payable / Cr Bank.
 *                                    payslips → PAID
 *
 * Refuses if (a) no PROCESSED payslips exist for the period, or (b)
 * any payslip in the period is still DRAFT/APPROVED (post first), or
 * (c) every payslip is already PAID. Refuses if a stray payslip is
 * already PAID and the rest are PROCESSED — that means a partial pay
 * happened earlier; demand a manual fix rather than corrupting the
 * netSalary sum.
 */
export const POST = withOrgAuth(async (request, { orgId, userId, orgUser }) => {
  if (!hasPermission(orgUser, "payroll", "approve")) {
    return forbidden("You don't have permission to disburse payroll");
  }
  try {
    const validated = payMonthSchema.parse(await request.json());
    const { month, year } = validated;

    const allInPeriod = await prisma.payslip.findMany({
      where: { employee: { organizationId: orgId }, month, year },
      select: { id: true, status: true, netSalary: true },
    });
    if (allInPeriod.length === 0) {
      return NextResponse.json(
        { error: `No payslips found for ${month}/${year}.` },
        { status: 404 }
      );
    }
    const stillUnposted = allInPeriod.filter(
      (p) => p.status === "DRAFT" || p.status === "APPROVED"
    );
    if (stillUnposted.length > 0) {
      return badRequest(
        `${stillUnposted.length} payslip(s) for ${month}/${year} are still unposted. Run /payroll/post-month first.`
      );
    }
    const eligible = allInPeriod.filter((p) => p.status === "PROCESSED");
    if (eligible.length === 0) {
      return NextResponse.json(
        { error: `All payslips for ${month}/${year} are already PAID.` },
        { status: 409 }
      );
    }
    // Detect partial-paid state — if some are PAID and some are PROCESSED,
    // the user likely paid a subset earlier. Refusing is safer than
    // silently double-paying. The user can split into separate runs by
    // employeeIds (a future enhancement).
    const alreadyPaid = allInPeriod.filter((p) => p.status === "PAID");
    if (alreadyPaid.length > 0 && eligible.length > 0) {
      return NextResponse.json(
        {
          error: `Period ${month}/${year} is partially paid (${alreadyPaid.length} already PAID, ${eligible.length} pending). Pay-month does not support partial settlement; investigate manually.`,
        },
        { status: 409 }
      );
    }

    const totalNet = sum(eligible.map((p) => D(p.netSalary)));

    let bankAccount: { id: string; name: string } | null = null;
    if (validated.bankAccountId) {
      bankAccount = await prisma.bankAccount.findFirst({
        where: { id: validated.bankAccountId, organizationId: orgId },
        select: { id: true, name: true },
      });
      if (!bankAccount) return notFound("Bank account not found");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve Dr Salaries Payable + Cr <Bank or Cash in Hand>.
      const salariesPayable = await getOrCreateNamedLedger(
        tx,
        orgId,
        "Salaries Payable",
        "Current Liabilities"
      );
      const bankLedger = bankAccount
        ? await getOrCreateBankLedger(tx, orgId, bankAccount.id, bankAccount.name)
        : await getCashLedger(tx, orgId);

      const voucherType = await getVoucherTypeByCode(tx, "PAYMENT");
      const fy = await getFiscalYearForDate(tx, orgId, validated.paidAt);
      const voucherNumber = await generateVoucherNumber(
        tx,
        orgId,
        voucherType.id,
        fy.id,
        "PAY-OUT"
      );

      const voucher = await tx.voucher.create({
        data: {
          organizationId: orgId,
          fiscalYearId: fy.id,
          voucherTypeId: voucherType.id,
          voucherNumber,
          date: validated.paidAt,
          referenceNo: validated.transactionRef,
          narration: `Payroll disbursement for ${month.toString().padStart(2, "0")}/${year} — ${eligible.length} employees`,
          totalDebit: totalNet,
          totalCredit: totalNet,
          status: "APPROVED",
          isPosted: true,
          postedAt: new Date(),
          createdById: userId,
          metadata: {
            kind: "PAYROLL_PAYMENT",
            month,
            year,
            payslipCount: eligible.length,
            totalNetSalary: totalNet.toString(),
          },
        },
        select: { id: true, voucherNumber: true },
      });

      await tx.voucherEntry.createMany({
        data: [
          {
            voucherId: voucher.id,
            ledgerId: salariesPayable.id,
            debitAmount: totalNet,
            creditAmount: D(0),
            sequence: 0,
          },
          {
            voucherId: voucher.id,
            ledgerId: bankLedger.id,
            debitAmount: D(0),
            creditAmount: totalNet,
            sequence: 1,
          },
        ],
      });

      await applyLedgerEntries(tx, [
        { ledgerId: salariesPayable.id, debitAmount: totalNet, creditAmount: D(0) },
        { ledgerId: bankLedger.id, debitAmount: D(0), creditAmount: totalNet },
      ]);

      // 2. Decrement bank balance — only when a real bank account is
      //    on the JV (cash payments don't touch the BankAccount table).
      if (bankAccount) {
        await tx.bankAccount.update({
          where: { id: bankAccount.id },
          data: { currentBalance: { decrement: totalNet } },
        });
      }

      // 3. Move payslips to PAID and stamp paidAt / paidVia /
      //    transactionRef. We don't link them to this voucher
      //    individually; the JV's metadata lists month+year and the
      //    audit row anchors the entire batch.
      await tx.payslip.updateMany({
        where: { id: { in: eligible.map((p) => p.id) } },
        data: {
          status: "PAID",
          paidAt: validated.paidAt,
          paidVia: validated.paidVia ?? (bankAccount ? "BANK" : "CASH"),
          transactionRef: validated.transactionRef,
        },
      });

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "POST",
        entityType: "PayrollDisbursement",
        entityId: voucher.id,
        newData: {
          month,
          year,
          voucherId: voucher.id,
          voucherNumber: voucher.voucherNumber,
          payslipCount: eligible.length,
          totalNetSalary: totalNet.toString(),
          bankAccountId: bankAccount?.id ?? null,
        },
      });

      return voucher;
    });

    return NextResponse.json(
      {
        voucherId: result.id,
        voucherNumber: result.voucherNumber,
        month,
        year,
        payslipCount: eligible.length,
        totalNetSalary: totalNet.toString(),
        bankAccountId: bankAccount?.id ?? null,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (error instanceof Error && /not configured|No fiscal year/i.test(error.message)) {
      return badRequest(error.message);
    }
    logger.error({ err: error }, "Error paying payroll month");
    return NextResponse.json({ error: "Failed to pay payroll month" }, { status: 500 });
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import {
  applyLedgerEntries,
  generateVoucherNumber,
  getFiscalYearForDate,
  getOrCreateNamedLedger,
  getVoucherTypeByCode,
} from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";
import { buildPayrollJournal, type PayslipLineForJv } from "@/backend/services/payroll/post-month";
import {
  calculatePF,
  calculateESI,
} from "@/backend/utils/payroll-calculations.util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postMonthSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

/**
 * Post a single journal voucher for the entire payroll month.
 *
 * Picks up every payslip in (orgId, month, year) whose status is DRAFT
 * or APPROVED and has no voucherId yet, aggregates their components via
 * `buildPayrollJournal`, and books the JV. Each included payslip is
 * then linked to the new voucher and moved to PROCESSED.
 *
 * Returns 409 if every eligible payslip is already posted (i.e. the
 * period has been closed). Returns 404 if no payslips exist for the
 * period at all.
 *
 * Employer-side PF/ESI are recomputed from the payslip's basic +
 * grossSalary using the same helpers `calculatePayroll` uses, since the
 * Payslip JSON does not persist employer contributions on its own.
 */
export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const { month, year } = postMonthSchema.parse(await request.json());

    // The voucher date is the last day of the month — that's where the
    // expense actually accrues.
    const voucherDate = new Date(year, month, 0);

    const eligible = await prisma.payslip.findMany({
      where: {
        employee: { organizationId: orgId },
        month,
        year,
        voucherId: null,
        status: { in: ["DRAFT", "APPROVED"] },
      },
      select: {
        id: true,
        basicSalary: true,
        grossSalary: true,
        netSalary: true,
        deductions: true,
      },
    });

    if (eligible.length === 0) {
      // Distinguish "nothing exists" vs "all already posted" so the UI
      // can show a useful error rather than a generic empty.
      const totalForPeriod = await prisma.payslip.count({
        where: { employee: { organizationId: orgId }, month, year },
      });
      if (totalForPeriod === 0) {
        return NextResponse.json(
          { error: `No payslips found for ${month}/${year}. Generate them first.` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          error: `All payslips for ${month}/${year} have already been posted to GL.`,
        },
        { status: 409 }
      );
    }

    // Build the input for the pure aggregator. Employer contributions
    // are re-derived from each payslip's stored basic + gross.
    const lines: PayslipLineForJv[] = eligible.map((p) => {
      // Note: payroll-calculations.util.ts uses `number` and rounds via
      // Math.round; mirroring its output here keeps the JV totals byte-
      // identical to what the calc helper produced upstream. A future
      // refactor can move that helper to Decimal and we get tighter
      // accuracy for free.
      const basic = Number(p.basicSalary);
      const gross = Number(p.grossSalary);
      const employerPf = calculatePF(basic).employer;
      const employerEsi = calculateESI(gross).employer;
      // The Payslip.deductions column is `Json`, so we widen it to the
      // shape `buildPayrollJournal` expects.
      const deductions = (p.deductions as Array<{ component: string; amount: number }> | null) ?? [];
      return {
        basicSalary: p.basicSalary,
        grossSalary: p.grossSalary,
        netSalary: p.netSalary,
        deductions,
        employerPf,
        employerEsi,
      };
    });

    const jv = buildPayrollJournal(lines);

    if (jv.lines.length === 0) {
      return badRequest("Aggregated payroll journal is empty — no eligible amounts to post.");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve every ledger named in the JV plan to a real ledgerId.
      const ledgerEntries = await Promise.all(
        jv.lines.map(async (l) => {
          const ledger = await getOrCreateNamedLedger(
            tx,
            orgId,
            l.ledgerName,
            l.groupName
          );
          return { ledgerId: ledger.id, debit: l.debit, credit: l.credit };
        })
      );

      // 2. Voucher type + fiscal year + voucher number.
      const voucherType = await getVoucherTypeByCode(tx, "JOURNAL");
      const fy = await getFiscalYearForDate(tx, orgId, voucherDate);
      const voucherNumber = await generateVoucherNumber(
        tx,
        orgId,
        voucherType.id,
        fy.id,
        "PAY-JV"
      );

      // 3. Create the voucher.
      const voucher = await tx.voucher.create({
        data: {
          organizationId: orgId,
          fiscalYearId: fy.id,
          voucherTypeId: voucherType.id,
          voucherNumber,
          date: voucherDate,
          narration: `Payroll for ${month.toString().padStart(2, "0")}/${year} — ${eligible.length} employees`,
          totalDebit: jv.totalDebit,
          totalCredit: jv.totalCredit,
          status: "APPROVED",
          isPosted: true,
          postedAt: new Date(),
          createdById: userId,
          metadata: {
            kind: "PAYROLL",
            month,
            year,
            payslipCount: eligible.length,
            totals: {
              gross: jv.totals.gross.toString(),
              netSalary: jv.totals.netSalary.toString(),
              pfEmployee: jv.totals.pfEmployee.toString(),
              pfEmployer: jv.totals.pfEmployer.toString(),
              esiEmployee: jv.totals.esiEmployee.toString(),
              esiEmployer: jv.totals.esiEmployer.toString(),
              professionalTax: jv.totals.professionalTax.toString(),
              tds: jv.totals.tds.toString(),
              lop: jv.totals.lop.toString(),
            },
          },
        },
        select: { id: true, voucherNumber: true },
      });

      // 4. Voucher entries — one row per ledger.
      await tx.voucherEntry.createMany({
        data: ledgerEntries.map((e, i) => ({
          voucherId: voucher.id,
          ledgerId: e.ledgerId,
          debitAmount: e.debit,
          creditAmount: e.credit,
          sequence: i,
        })),
      });

      // 5. Apply ledger balance impact in the same tx.
      await applyLedgerEntries(
        tx,
        ledgerEntries.map((e) => ({
          ledgerId: e.ledgerId,
          debitAmount: e.debit,
          creditAmount: e.credit,
        }))
      );

      // 6. Link every included payslip to this voucher and move them
      //    to PROCESSED. PAID is a separate later step (when net salary
      //    actually leaves the bank).
      await tx.payslip.updateMany({
        where: { id: { in: eligible.map((p) => p.id) } },
        data: { voucherId: voucher.id, status: "PROCESSED" },
      });

      // 7. Audit trail.
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "POST",
        entityType: "PayrollMonth",
        entityId: voucher.id,
        newData: {
          month,
          year,
          voucherId: voucher.id,
          voucherNumber: voucher.voucherNumber,
          payslipCount: eligible.length,
          totalDebit: jv.totalDebit.toString(),
          totalCredit: jv.totalCredit.toString(),
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
        totalDebit: jv.totalDebit.toString(),
        totalCredit: jv.totalCredit.toString(),
        lines: jv.lines.map((l) => ({
          ledger: l.ledgerName,
          debit: l.debit.toString(),
          credit: l.credit.toString(),
        })),
        totals: {
          gross: jv.totals.gross.toString(),
          netSalary: jv.totals.netSalary.toString(),
          pfEmployee: jv.totals.pfEmployee.toString(),
          pfEmployer: jv.totals.pfEmployer.toString(),
          esiEmployee: jv.totals.esiEmployee.toString(),
          esiEmployer: jv.totals.esiEmployer.toString(),
          professionalTax: jv.totals.professionalTax.toString(),
          tds: jv.totals.tds.toString(),
          lop: jv.totals.lop.toString(),
        },
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
    logger.error({ err: error }, "Error posting payroll month");
    return NextResponse.json({ error: "Failed to post payroll month" }, { status: 500 });
  }
});

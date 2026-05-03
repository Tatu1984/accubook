import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { D, sum } from "@/backend/utils/money";
import { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CashFlowItem {
  description: string;
  amount: Prisma.Decimal;
  type: "inflow" | "outflow";
}

interface CashFlowSection {
  label: string;
  items: CashFlowItem[];
  netAmount: Prisma.Decimal;
}

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Determine date range
    const now = new Date();
    const currentYear = now.getFullYear();

    let periodStart: Date;
    let periodEnd: Date;

    if (startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
    } else {
      // Default to current fiscal year
      periodStart = now.getMonth() >= 3
        ? new Date(currentYear, 3, 1)
        : new Date(currentYear - 1, 3, 1);
      periodEnd = now;
    }

    // Get opening cash/bank balance
    const cashBankLedgers = await prisma.ledger.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        group: {
          name: { in: ["Cash-in-Hand", "Bank Accounts", "Cash", "Bank"] },
        },
      },
    });

    const cashBankIds = cashBankLedgers.map((l) => l.id);

    // Opening balance from ledgers
    let openingBalance = cashBankLedgers.reduce<Prisma.Decimal>((acc, l) => {
      const balance = D(l.openingBalance ?? 0);
      return l.openingBalanceType === "DR" ? acc.plus(balance) : acc.minus(balance);
    }, D(0));

    // Add transactions before period start
    const preperiodEntries = await prisma.voucherEntry.findMany({
      where: {
        ledgerId: { in: cashBankIds },
        voucher: {
          organizationId: orgId,
          date: { lt: periodStart },
          status: "APPROVED",
        },
      },
    });

    preperiodEntries.forEach((entry) => {
      openingBalance = openingBalance.plus(D(entry.debitAmount)).minus(D(entry.creditAmount));
    });

    // Get all receipts in period
    const receipts = await prisma.receipt.findMany({
      where: {
        organizationId: orgId,
        date: { gte: periodStart, lte: periodEnd },
        status: "COMPLETED",
      },
      include: {
        party: { select: { name: true, type: true } },
      },
    });

    // Get all payments in period
    const payments = await prisma.payment.findMany({
      where: {
        organizationId: orgId,
        date: { gte: periodStart, lte: periodEnd },
        status: "COMPLETED",
      },
      include: {
        party: { select: { name: true, type: true } },
      },
    });

    // Get invoices for sales calculation
    const invoices = await prisma.invoice.aggregate({
      where: {
        organizationId: orgId,
        date: { gte: periodStart, lte: periodEnd },
        status: { not: "CANCELLED" },
      },
      _sum: { totalAmount: true },
    });

    // Get bills for purchases calculation
    const bills = await prisma.bill.aggregate({
      where: {
        organizationId: orgId,
        date: { gte: periodStart, lte: periodEnd },
        status: { not: "CANCELLED" },
      },
      _sum: { totalAmount: true },
    });

    // Get payroll payments
    const payslips = await prisma.payslip.aggregate({
      where: {
        employee: { organizationId: orgId },
        status: "PAID",
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { netSalary: true },
    });

    // Get expense claims reimbursed
    const expenseClaims = await prisma.expenseClaim.aggregate({
      where: {
        employee: { organizationId: orgId },
        status: "REIMBURSED",
        reimbursedAt: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    });

    // Calculate cash from operating activities
    const operatingActivities: CashFlowSection = {
      label: "Cash Flow from Operating Activities",
      items: [],
      netAmount: D(0),
    };

    // Collections from customers
    const customerReceipts = sum(
      receipts
        .filter((r) => r.party?.type === "CUSTOMER" || r.party?.type === "BOTH")
        .map((r) => r.amount)
    );

    if (customerReceipts.greaterThan(D(0))) {
      operatingActivities.items.push({
        description: "Cash received from customers",
        amount: customerReceipts,
        type: "inflow",
      });
    }

    // Other receipts
    const otherReceipts = sum(
      receipts
        .filter((r) => r.party?.type !== "CUSTOMER" && r.party?.type !== "BOTH")
        .map((r) => r.amount)
    );

    if (otherReceipts.greaterThan(D(0))) {
      operatingActivities.items.push({
        description: "Other cash receipts",
        amount: otherReceipts,
        type: "inflow",
      });
    }

    // Payments to suppliers
    const supplierPayments = sum(
      payments
        .filter((p) => p.party?.type === "VENDOR" || p.party?.type === "BOTH")
        .map((p) => p.amount)
    );

    if (supplierPayments.greaterThan(D(0))) {
      operatingActivities.items.push({
        description: "Cash paid to suppliers",
        amount: supplierPayments.negated(),
        type: "outflow",
      });
    }

    // Salary payments
    const salaryPayments = D(payslips._sum.netSalary ?? 0);
    if (salaryPayments.greaterThan(D(0))) {
      operatingActivities.items.push({
        description: "Salaries and wages paid",
        amount: salaryPayments.negated(),
        type: "outflow",
      });
    }

    // Expense reimbursements
    const expenseReimbursements = D(expenseClaims._sum.amount ?? 0);
    if (expenseReimbursements.greaterThan(D(0))) {
      operatingActivities.items.push({
        description: "Employee expense reimbursements",
        amount: expenseReimbursements.negated(),
        type: "outflow",
      });
    }

    // Other payments
    const otherPayments = sum(
      payments
        .filter((p) => p.party?.type !== "VENDOR" && p.party?.type !== "BOTH")
        .map((p) => p.amount)
    );

    if (otherPayments.greaterThan(D(0))) {
      operatingActivities.items.push({
        description: "Other operating payments",
        amount: otherPayments.negated(),
        type: "outflow",
      });
    }

    operatingActivities.netAmount = sum(operatingActivities.items.map((item) => item.amount));

    // Investing activities (placeholder - would need asset purchase data)
    const investingActivities: CashFlowSection = {
      label: "Cash Flow from Investing Activities",
      items: [],
      netAmount: D(0),
    };

    // Financing activities (placeholder - would need loan data)
    const financingActivities: CashFlowSection = {
      label: "Cash Flow from Financing Activities",
      items: [],
      netAmount: D(0),
    };

    // Calculate closing balance
    const netCashFlow = operatingActivities.netAmount
      .plus(investingActivities.netAmount)
      .plus(financingActivities.netAmount);

    const closingBalance = openingBalance.plus(netCashFlow);

    // Get actual closing from voucher entries
    const periodEntries = await prisma.voucherEntry.findMany({
      where: {
        ledgerId: { in: cashBankIds },
        voucher: {
          organizationId: orgId,
          date: { gte: periodStart, lte: periodEnd },
          status: "APPROVED",
        },
      },
    });

    const periodMovement = sum(periodEntries.map((entry) => entry.debitAmount)).minus(
      sum(periodEntries.map((entry) => entry.creditAmount))
    );

    const actualClosingBalance = openingBalance.plus(periodMovement);

    return NextResponse.json({
      period: {
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
      },
      openingBalance,
      operatingActivities,
      investingActivities,
      financingActivities,
      netCashFlow,
      closingBalance,
      actualClosingBalance,
      reconciliation: {
        calculated: closingBalance,
        actual: actualClosingBalance,
        difference: closingBalance.minus(actualClosingBalance),
        isReconciled: closingBalance.minus(actualClosingBalance).abs().lessThan(D("0.01")),
      },
      summary: {
        totalInflow: sum(
          operatingActivities.items.filter((i) => i.type === "inflow").map((i) => i.amount)
        ),
        totalOutflow: sum(
          operatingActivities.items.filter((i) => i.type === "outflow").map((i) => i.amount)
        ).abs(),
        netChange: netCashFlow,
        openingBalance,
        closingBalance: actualClosingBalance,
      },
    });
  } catch (error) {
    console.error("Error generating cash flow:", error);
    return NextResponse.json(
      { error: "Failed to generate cash flow statement" },
      { status: 500 }
    );
  }
});

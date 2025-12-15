import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CashFlowItem {
  description: string;
  amount: number;
  type: "inflow" | "outflow";
}

interface CashFlowSection {
  label: string;
  items: CashFlowItem[];
  netAmount: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

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
    let openingBalance = cashBankLedgers.reduce((sum, l) => {
      const balance = Number(l.openingBalance) || 0;
      return l.openingBalanceType === "DR" ? sum + balance : sum - balance;
    }, 0);

    // Add transactions before period start
    const preperiodEntries = await prisma.voucherEntry.findMany({
      where: {
        ledgerId: { in: cashBankIds },
        voucher: {
          organizationId: orgId,
          date: { lt: periodStart },
          status: { in: ["APPROVED", "DRAFT"] },
        },
      },
    });

    preperiodEntries.forEach((entry) => {
      openingBalance += Number(entry.debitAmount) - Number(entry.creditAmount);
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
      netAmount: 0,
    };

    // Collections from customers
    const customerReceipts = receipts
      .filter((r) => r.party?.type === "CUSTOMER" || r.party?.type === "BOTH")
      .reduce((sum, r) => sum + Number(r.amount), 0);

    if (customerReceipts > 0) {
      operatingActivities.items.push({
        description: "Cash received from customers",
        amount: customerReceipts,
        type: "inflow",
      });
    }

    // Other receipts
    const otherReceipts = receipts
      .filter((r) => r.party?.type !== "CUSTOMER" && r.party?.type !== "BOTH")
      .reduce((sum, r) => sum + Number(r.amount), 0);

    if (otherReceipts > 0) {
      operatingActivities.items.push({
        description: "Other cash receipts",
        amount: otherReceipts,
        type: "inflow",
      });
    }

    // Payments to suppliers
    const supplierPayments = payments
      .filter((p) => p.party?.type === "VENDOR" || p.party?.type === "BOTH")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    if (supplierPayments > 0) {
      operatingActivities.items.push({
        description: "Cash paid to suppliers",
        amount: -supplierPayments,
        type: "outflow",
      });
    }

    // Salary payments
    const salaryPayments = Number(payslips._sum.netSalary || 0);
    if (salaryPayments > 0) {
      operatingActivities.items.push({
        description: "Salaries and wages paid",
        amount: -salaryPayments,
        type: "outflow",
      });
    }

    // Expense reimbursements
    const expenseReimbursements = Number(expenseClaims._sum.amount || 0);
    if (expenseReimbursements > 0) {
      operatingActivities.items.push({
        description: "Employee expense reimbursements",
        amount: -expenseReimbursements,
        type: "outflow",
      });
    }

    // Other payments
    const otherPayments = payments
      .filter((p) => p.party?.type !== "VENDOR" && p.party?.type !== "BOTH")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    if (otherPayments > 0) {
      operatingActivities.items.push({
        description: "Other operating payments",
        amount: -otherPayments,
        type: "outflow",
      });
    }

    operatingActivities.netAmount = operatingActivities.items.reduce(
      (sum, item) => sum + item.amount,
      0
    );

    // Investing activities (placeholder - would need asset purchase data)
    const investingActivities: CashFlowSection = {
      label: "Cash Flow from Investing Activities",
      items: [],
      netAmount: 0,
    };

    // Financing activities (placeholder - would need loan data)
    const financingActivities: CashFlowSection = {
      label: "Cash Flow from Financing Activities",
      items: [],
      netAmount: 0,
    };

    // Calculate closing balance
    const netCashFlow =
      operatingActivities.netAmount +
      investingActivities.netAmount +
      financingActivities.netAmount;

    const closingBalance = openingBalance + netCashFlow;

    // Get actual closing from voucher entries
    const periodEntries = await prisma.voucherEntry.findMany({
      where: {
        ledgerId: { in: cashBankIds },
        voucher: {
          organizationId: orgId,
          date: { gte: periodStart, lte: periodEnd },
          status: { in: ["APPROVED", "DRAFT"] },
        },
      },
    });

    const periodMovement = periodEntries.reduce(
      (sum, entry) => sum + Number(entry.debitAmount) - Number(entry.creditAmount),
      0
    );

    const actualClosingBalance = openingBalance + periodMovement;

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
        difference: closingBalance - actualClosingBalance,
        isReconciled: Math.abs(closingBalance - actualClosingBalance) < 0.01,
      },
      summary: {
        totalInflow: operatingActivities.items
          .filter((i) => i.type === "inflow")
          .reduce((sum, i) => sum + i.amount, 0),
        totalOutflow: Math.abs(
          operatingActivities.items
            .filter((i) => i.type === "outflow")
            .reduce((sum, i) => sum + i.amount, 0)
        ),
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
}

import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { D, sum, toNumber } from "@/backend/utils/money";
import { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PLLineItem {
  ledgerId: string;
  ledgerName: string;
  groupId: string;
  groupName: string;
  amount: Prisma.Decimal;
  previousAmount?: Prisma.Decimal;
}

interface PLGroup {
  groupId: string;
  groupName: string;
  affectsGrossProfit: boolean;
  items: PLLineItem[];
  total: Prisma.Decimal;
  previousTotal?: Prisma.Decimal;
}

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const compareWithPrevious = searchParams.get("compare") === "true";

    // Determine date range
    const now = new Date();
    const currentYear = now.getFullYear();

    let periodStart: Date;
    let periodEnd: Date;

    if (startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
    } else {
      // Default to current fiscal year (April to March for India)
      periodStart = now.getMonth() >= 3
        ? new Date(currentYear, 3, 1)
        : new Date(currentYear - 1, 3, 1);
      periodEnd = now;
    }

    // Previous period for comparison
    const periodLength = periodEnd.getTime() - periodStart.getTime();
    const prevPeriodEnd = new Date(periodStart.getTime() - 1);
    const prevPeriodStart = new Date(prevPeriodEnd.getTime() - periodLength);

    // Get all income and expense ledgers with groups
    const ledgers = await prisma.ledger.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        group: {
          nature: { in: ["INCOME", "EXPENSES"] },
        },
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            nature: true,
            affectsGrossProfit: true,
          },
        },
      },
      orderBy: [
        { group: { nature: "asc" } },
        { group: { sequence: "asc" } },
        { name: "asc" },
      ],
    });

    // Get voucher entries for current period
    const currentEntries = await prisma.voucherEntry.findMany({
      where: {
        ledgerId: { in: ledgers.map((l) => l.id) },
        voucher: {
          organizationId: orgId,
          date: { gte: periodStart, lte: periodEnd },
          status: "APPROVED",
        },
      },
    });

    // Get voucher entries for previous period (if comparison requested)
    let previousEntries: typeof currentEntries = [];
    if (compareWithPrevious) {
      previousEntries = await prisma.voucherEntry.findMany({
        where: {
          ledgerId: { in: ledgers.map((l) => l.id) },
          voucher: {
            organizationId: orgId,
            date: { gte: prevPeriodStart, lte: prevPeriodEnd },
            status: "APPROVED",
          },
        },
      });
    }

    // Calculate amounts for each ledger
    const ledgerAmounts = new Map<string, { current: Prisma.Decimal; previous: Prisma.Decimal }>();

    ledgers.forEach((ledger) => {
      const isIncome = ledger.group.nature === "INCOME";

      // Current period
      const currentLedgerEntries = currentEntries.filter((e) => e.ledgerId === ledger.id);
      const currentDebit = sum(currentLedgerEntries.map((e) => e.debitAmount));
      const currentCredit = sum(currentLedgerEntries.map((e) => e.creditAmount));

      // For income: credit - debit (income increases with credit)
      // For expenses: debit - credit (expenses increase with debit)
      const currentAmount = isIncome
        ? currentCredit.minus(currentDebit)
        : currentDebit.minus(currentCredit);

      // Previous period
      let previousAmount = D(0);
      if (compareWithPrevious) {
        const prevLedgerEntries = previousEntries.filter((e) => e.ledgerId === ledger.id);
        const prevDebit = sum(prevLedgerEntries.map((e) => e.debitAmount));
        const prevCredit = sum(prevLedgerEntries.map((e) => e.creditAmount));
        previousAmount = isIncome ? prevCredit.minus(prevDebit) : prevDebit.minus(prevCredit);
      }

      ledgerAmounts.set(ledger.id, { current: currentAmount, previous: previousAmount });
    });

    // Build hierarchical structure
    const incomeGroups: PLGroup[] = [];
    const directExpenseGroups: PLGroup[] = [];
    const indirectExpenseGroups: PLGroup[] = [];

    // Group ledgers by their group
    const groupMap = new Map<string, PLGroup>();

    ledgers.forEach((ledger) => {
      const amounts = ledgerAmounts.get(ledger.id) || { current: D(0), previous: D(0) };

      if (!groupMap.has(ledger.group.id)) {
        groupMap.set(ledger.group.id, {
          groupId: ledger.group.id,
          groupName: ledger.group.name,
          affectsGrossProfit: ledger.group.affectsGrossProfit,
          items: [],
          total: D(0),
          previousTotal: D(0),
        });
      }

      const group = groupMap.get(ledger.group.id)!;

      // Only add if there's any amount
      if (!amounts.current.isZero() || !amounts.previous.isZero()) {
        group.items.push({
          ledgerId: ledger.id,
          ledgerName: ledger.name,
          groupId: ledger.group.id,
          groupName: ledger.group.name,
          amount: amounts.current,
          previousAmount: compareWithPrevious ? amounts.previous : undefined,
        });
        group.total = group.total.plus(amounts.current);
        group.previousTotal = (group.previousTotal ?? D(0)).plus(amounts.previous);
      }
    });

    // Categorize groups
    groupMap.forEach((group) => {
      const ledger = ledgers.find((l) => l.group.id === group.groupId);
      if (!ledger) return;

      if (ledger.group.nature === "INCOME") {
        incomeGroups.push(group);
      } else if (ledger.group.affectsGrossProfit) {
        directExpenseGroups.push(group);
      } else {
        indirectExpenseGroups.push(group);
      }
    });

    // Calculate totals
    const totalIncome = sum(incomeGroups.map((g) => g.total));
    const totalDirectExpenses = sum(directExpenseGroups.map((g) => g.total));
    const totalIndirectExpenses = sum(indirectExpenseGroups.map((g) => g.total));
    const grossProfit = totalIncome.minus(totalDirectExpenses);
    const netProfit = grossProfit.minus(totalIndirectExpenses);

    // Previous period totals
    const prevTotalIncome = sum(incomeGroups.map((g) => g.previousTotal ?? D(0)));
    const prevTotalDirectExpenses = sum(directExpenseGroups.map((g) => g.previousTotal ?? D(0)));
    const prevTotalIndirectExpenses = sum(indirectExpenseGroups.map((g) => g.previousTotal ?? D(0)));
    const prevGrossProfit = prevTotalIncome.minus(prevTotalDirectExpenses);
    const prevNetProfit = prevGrossProfit.minus(prevTotalIndirectExpenses);

    const grossMargin = totalIncome.greaterThan(D(0))
      ? toNumber(grossProfit.div(totalIncome).times(D(100)))
      : 0;
    const netMargin = totalIncome.greaterThan(D(0))
      ? toNumber(netProfit.div(totalIncome).times(D(100)))
      : 0;

    return NextResponse.json({
      period: {
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
      },
      previousPeriod: compareWithPrevious ? {
        startDate: prevPeriodStart.toISOString(),
        endDate: prevPeriodEnd.toISOString(),
      } : null,
      income: {
        groups: incomeGroups,
        total: totalIncome,
        previousTotal: compareWithPrevious ? prevTotalIncome : undefined,
      },
      directExpenses: {
        groups: directExpenseGroups,
        total: totalDirectExpenses,
        previousTotal: compareWithPrevious ? prevTotalDirectExpenses : undefined,
        label: "Cost of Goods Sold / Direct Expenses",
      },
      grossProfit: {
        amount: grossProfit,
        previousAmount: compareWithPrevious ? prevGrossProfit : undefined,
        percentage: grossMargin,
      },
      indirectExpenses: {
        groups: indirectExpenseGroups,
        total: totalIndirectExpenses,
        previousTotal: compareWithPrevious ? prevTotalIndirectExpenses : undefined,
        label: "Operating / Indirect Expenses",
      },
      netProfit: {
        amount: netProfit,
        previousAmount: compareWithPrevious ? prevNetProfit : undefined,
        percentage: netMargin,
      },
      summary: {
        totalIncome,
        totalExpenses: totalDirectExpenses.plus(totalIndirectExpenses),
        grossProfit,
        grossProfitMargin: grossMargin,
        netProfit,
        netProfitMargin: netMargin,
      },
    });
  } catch (error) {
    console.error("Error generating P&L:", error);
    return NextResponse.json(
      { error: "Failed to generate Profit & Loss statement" },
      { status: 500 }
    );
  }
});

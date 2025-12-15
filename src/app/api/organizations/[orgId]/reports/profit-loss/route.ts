import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PLLineItem {
  ledgerId: string;
  ledgerName: string;
  groupId: string;
  groupName: string;
  amount: number;
  previousAmount?: number;
}

interface PLGroup {
  groupId: string;
  groupName: string;
  affectsGrossProfit: boolean;
  items: PLLineItem[];
  total: number;
  previousTotal?: number;
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
          status: { in: ["APPROVED", "DRAFT"] },
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
            status: { in: ["APPROVED", "DRAFT"] },
          },
        },
      });
    }

    // Calculate amounts for each ledger
    const ledgerAmounts = new Map<string, { current: number; previous: number }>();

    ledgers.forEach((ledger) => {
      const isIncome = ledger.group.nature === "INCOME";

      // Current period
      const currentLedgerEntries = currentEntries.filter((e) => e.ledgerId === ledger.id);
      const currentDebit = currentLedgerEntries.reduce((sum, e) => sum + Number(e.debitAmount), 0);
      const currentCredit = currentLedgerEntries.reduce((sum, e) => sum + Number(e.creditAmount), 0);

      // For income: credit - debit (income increases with credit)
      // For expenses: debit - credit (expenses increase with debit)
      const currentAmount = isIncome ? currentCredit - currentDebit : currentDebit - currentCredit;

      // Previous period
      let previousAmount = 0;
      if (compareWithPrevious) {
        const prevLedgerEntries = previousEntries.filter((e) => e.ledgerId === ledger.id);
        const prevDebit = prevLedgerEntries.reduce((sum, e) => sum + Number(e.debitAmount), 0);
        const prevCredit = prevLedgerEntries.reduce((sum, e) => sum + Number(e.creditAmount), 0);
        previousAmount = isIncome ? prevCredit - prevDebit : prevDebit - prevCredit;
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
      const amounts = ledgerAmounts.get(ledger.id) || { current: 0, previous: 0 };

      if (!groupMap.has(ledger.group.id)) {
        groupMap.set(ledger.group.id, {
          groupId: ledger.group.id,
          groupName: ledger.group.name,
          affectsGrossProfit: ledger.group.affectsGrossProfit,
          items: [],
          total: 0,
          previousTotal: 0,
        });
      }

      const group = groupMap.get(ledger.group.id)!;

      // Only add if there's any amount
      if (amounts.current !== 0 || amounts.previous !== 0) {
        group.items.push({
          ledgerId: ledger.id,
          ledgerName: ledger.name,
          groupId: ledger.group.id,
          groupName: ledger.group.name,
          amount: amounts.current,
          previousAmount: compareWithPrevious ? amounts.previous : undefined,
        });
        group.total += amounts.current;
        group.previousTotal = (group.previousTotal || 0) + amounts.previous;
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
    const totalIncome = incomeGroups.reduce((sum, g) => sum + g.total, 0);
    const totalDirectExpenses = directExpenseGroups.reduce((sum, g) => sum + g.total, 0);
    const totalIndirectExpenses = indirectExpenseGroups.reduce((sum, g) => sum + g.total, 0);
    const grossProfit = totalIncome - totalDirectExpenses;
    const netProfit = grossProfit - totalIndirectExpenses;

    // Previous period totals
    const prevTotalIncome = incomeGroups.reduce((sum, g) => sum + (g.previousTotal || 0), 0);
    const prevTotalDirectExpenses = directExpenseGroups.reduce((sum, g) => sum + (g.previousTotal || 0), 0);
    const prevTotalIndirectExpenses = indirectExpenseGroups.reduce((sum, g) => sum + (g.previousTotal || 0), 0);
    const prevGrossProfit = prevTotalIncome - prevTotalDirectExpenses;
    const prevNetProfit = prevGrossProfit - prevTotalIndirectExpenses;

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
        percentage: totalIncome > 0 ? (grossProfit / totalIncome) * 100 : 0,
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
        percentage: totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0,
      },
      summary: {
        totalIncome,
        totalExpenses: totalDirectExpenses + totalIndirectExpenses,
        grossProfit,
        grossProfitMargin: totalIncome > 0 ? (grossProfit / totalIncome) * 100 : 0,
        netProfit,
        netProfitMargin: totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0,
      },
    });
  } catch (error) {
    console.error("Error generating P&L:", error);
    return NextResponse.json(
      { error: "Failed to generate Profit & Loss statement" },
      { status: 500 }
    );
  }
}

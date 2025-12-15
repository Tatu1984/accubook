import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BSLineItem {
  ledgerId: string;
  ledgerName: string;
  groupId: string;
  groupName: string;
  balance: number;
  previousBalance?: number;
}

interface BSGroup {
  groupId: string;
  groupName: string;
  parentId: string | null;
  items: BSLineItem[];
  subGroups: BSGroup[];
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
    const asOfDate = searchParams.get("asOfDate")
      ? new Date(searchParams.get("asOfDate")!)
      : new Date();
    const compareWithPrevious = searchParams.get("compare") === "true";

    // Get fiscal year start
    const currentYear = asOfDate.getFullYear();
    const fyStart = asOfDate.getMonth() >= 3
      ? new Date(currentYear, 3, 1)
      : new Date(currentYear - 1, 3, 1);

    // Previous year date for comparison
    const prevAsOfDate = new Date(asOfDate);
    prevAsOfDate.setFullYear(prevAsOfDate.getFullYear() - 1);

    // Get all ledgers with groups (Assets, Liabilities, Equity)
    const ledgers = await prisma.ledger.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        group: {
          nature: { in: ["ASSETS", "LIABILITIES", "EQUITY"] },
        },
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            nature: true,
            parentId: true,
            sequence: true,
          },
        },
      },
      orderBy: [
        { group: { nature: "asc" } },
        { group: { sequence: "asc" } },
        { name: "asc" },
      ],
    });

    // Get all ledger groups for hierarchy
    const ledgerGroups = await prisma.ledgerGroup.findMany({
      where: {
        organizationId: orgId,
        nature: { in: ["ASSETS", "LIABILITIES", "EQUITY"] },
      },
      orderBy: [{ nature: "asc" }, { sequence: "asc" }],
    });

    // Get all voucher entries up to asOfDate
    const voucherEntries = await prisma.voucherEntry.findMany({
      where: {
        ledgerId: { in: ledgers.map((l) => l.id) },
        voucher: {
          organizationId: orgId,
          date: { lte: asOfDate },
          status: { in: ["APPROVED", "DRAFT"] },
        },
      },
      include: {
        voucher: {
          select: { date: true },
        },
      },
    });

    // Get previous period entries if comparison requested
    let prevEntries: typeof voucherEntries = [];
    if (compareWithPrevious) {
      prevEntries = await prisma.voucherEntry.findMany({
        where: {
          ledgerId: { in: ledgers.map((l) => l.id) },
          voucher: {
            organizationId: orgId,
            date: { lte: prevAsOfDate },
            status: { in: ["APPROVED", "DRAFT"] },
          },
        },
        include: {
          voucher: {
            select: { date: true },
          },
        },
      });
    }

    // Calculate current year P&L for retained earnings
    const plLedgers = await prisma.ledger.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        group: {
          nature: { in: ["INCOME", "EXPENSES"] },
        },
      },
      include: {
        group: { select: { nature: true } },
      },
    });

    const plEntries = await prisma.voucherEntry.findMany({
      where: {
        ledgerId: { in: plLedgers.map((l) => l.id) },
        voucher: {
          organizationId: orgId,
          date: { gte: fyStart, lte: asOfDate },
          status: { in: ["APPROVED", "DRAFT"] },
        },
      },
    });

    // Calculate net profit for current year
    let currentYearProfit = 0;
    plLedgers.forEach((ledger) => {
      const ledgerEntries = plEntries.filter((e) => e.ledgerId === ledger.id);
      const debit = ledgerEntries.reduce((sum, e) => sum + Number(e.debitAmount), 0);
      const credit = ledgerEntries.reduce((sum, e) => sum + Number(e.creditAmount), 0);
      if (ledger.group.nature === "INCOME") {
        currentYearProfit += credit - debit;
      } else {
        currentYearProfit -= debit - credit;
      }
    });

    // Calculate balances for each ledger
    const calculateBalance = (
      ledger: typeof ledgers[0],
      entries: typeof voucherEntries
    ): number => {
      const isDebitNature = ledger.group.nature === "ASSETS";

      // Opening balance
      const openingBalance = Number(ledger.openingBalance) || 0;
      let balance = ledger.openingBalanceType === "DR" || (isDebitNature && !ledger.openingBalanceType)
        ? openingBalance
        : -openingBalance;

      // Add transaction movements
      const ledgerEntries = entries.filter((e) => e.ledgerId === ledger.id);
      const debit = ledgerEntries.reduce((sum, e) => sum + Number(e.debitAmount), 0);
      const credit = ledgerEntries.reduce((sum, e) => sum + Number(e.creditAmount), 0);

      balance += debit - credit;

      // For assets: positive is debit balance
      // For liabilities/equity: negative is credit balance (show as positive)
      return isDebitNature ? balance : -balance;
    };

    // Build balance map
    const balances = new Map<string, { current: number; previous: number }>();
    ledgers.forEach((ledger) => {
      const current = calculateBalance(ledger, voucherEntries);
      const previous = compareWithPrevious ? calculateBalance(ledger, prevEntries) : 0;
      balances.set(ledger.id, { current, previous });
    });

    // Build hierarchical structure
    const buildGroupStructure = (
      nature: string,
      entries: typeof voucherEntries
    ): BSGroup[] => {
      const natureLedgers = ledgers.filter((l) => l.group.nature === nature);
      const natureGroups = ledgerGroups.filter((g) => g.nature === nature && !g.parentId);

      return natureGroups.map((group) => {
        const groupLedgers = natureLedgers.filter((l) => l.group.id === group.id);

        const items: BSLineItem[] = groupLedgers
          .map((ledger) => {
            const bal = balances.get(ledger.id) || { current: 0, previous: 0 };
            return {
              ledgerId: ledger.id,
              ledgerName: ledger.name,
              groupId: group.id,
              groupName: group.name,
              balance: bal.current,
              previousBalance: compareWithPrevious ? bal.previous : undefined,
            };
          })
          .filter((item) => item.balance !== 0 || (item.previousBalance && item.previousBalance !== 0));

        // Get child groups
        const childGroups = ledgerGroups.filter((g) => g.parentId === group.id);
        const subGroups: BSGroup[] = childGroups.map((childGroup) => {
          const childLedgers = natureLedgers.filter((l) => l.group.id === childGroup.id);
          const childItems: BSLineItem[] = childLedgers
            .map((ledger) => {
              const bal = balances.get(ledger.id) || { current: 0, previous: 0 };
              return {
                ledgerId: ledger.id,
                ledgerName: ledger.name,
                groupId: childGroup.id,
                groupName: childGroup.name,
                balance: bal.current,
                previousBalance: compareWithPrevious ? bal.previous : undefined,
              };
            })
            .filter((item) => item.balance !== 0 || (item.previousBalance && item.previousBalance !== 0));

          return {
            groupId: childGroup.id,
            groupName: childGroup.name,
            parentId: childGroup.parentId,
            items: childItems,
            subGroups: [],
            total: childItems.reduce((sum, i) => sum + i.balance, 0),
            previousTotal: compareWithPrevious
              ? childItems.reduce((sum, i) => sum + (i.previousBalance || 0), 0)
              : undefined,
          };
        });

        const total = items.reduce((sum, i) => sum + i.balance, 0) +
          subGroups.reduce((sum, g) => sum + g.total, 0);

        const previousTotal = compareWithPrevious
          ? items.reduce((sum, i) => sum + (i.previousBalance || 0), 0) +
            subGroups.reduce((sum, g) => sum + (g.previousTotal || 0), 0)
          : undefined;

        return {
          groupId: group.id,
          groupName: group.name,
          parentId: group.parentId,
          items,
          subGroups,
          total,
          previousTotal,
        };
      });
    };

    const assets = buildGroupStructure("ASSETS", voucherEntries);
    const liabilities = buildGroupStructure("LIABILITIES", voucherEntries);
    const equity = buildGroupStructure("EQUITY", voucherEntries);

    // Calculate totals
    const totalAssets = assets.reduce((sum, g) => sum + g.total, 0);
    const totalLiabilities = liabilities.reduce((sum, g) => sum + g.total, 0);
    const totalEquity = equity.reduce((sum, g) => sum + g.total, 0);

    // Add current year profit to equity
    const totalEquityWithProfit = totalEquity + currentYearProfit;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquityWithProfit;

    // Previous totals
    const prevTotalAssets = assets.reduce((sum, g) => sum + (g.previousTotal || 0), 0);
    const prevTotalLiabilities = liabilities.reduce((sum, g) => sum + (g.previousTotal || 0), 0);
    const prevTotalEquity = equity.reduce((sum, g) => sum + (g.previousTotal || 0), 0);

    return NextResponse.json({
      asOfDate: asOfDate.toISOString(),
      fiscalYearStart: fyStart.toISOString(),
      previousAsOfDate: compareWithPrevious ? prevAsOfDate.toISOString() : null,
      assets: {
        groups: assets,
        total: totalAssets,
        previousTotal: compareWithPrevious ? prevTotalAssets : undefined,
      },
      liabilities: {
        groups: liabilities,
        total: totalLiabilities,
        previousTotal: compareWithPrevious ? prevTotalLiabilities : undefined,
      },
      equity: {
        groups: equity,
        retainedEarnings: currentYearProfit,
        total: totalEquity,
        totalWithProfit: totalEquityWithProfit,
        previousTotal: compareWithPrevious ? prevTotalEquity : undefined,
      },
      summary: {
        totalAssets,
        totalLiabilities,
        totalEquity: totalEquityWithProfit,
        totalLiabilitiesAndEquity,
        isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
        difference: totalAssets - totalLiabilitiesAndEquity,
      },
      currentYearProfit: {
        amount: currentYearProfit,
        label: "Current Year Profit / (Loss)",
      },
    });
  } catch (error) {
    console.error("Error generating balance sheet:", error);
    return NextResponse.json(
      { error: "Failed to generate balance sheet" },
      { status: 500 }
    );
  }
}

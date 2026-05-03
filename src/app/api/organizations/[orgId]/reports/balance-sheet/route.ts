import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { D, sum } from "@/backend/utils/money";
import { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BSLineItem {
  ledgerId: string;
  ledgerName: string;
  groupId: string;
  groupName: string;
  balance: Prisma.Decimal;
  previousBalance?: Prisma.Decimal;
}

interface BSGroup {
  groupId: string;
  groupName: string;
  parentId: string | null;
  items: BSLineItem[];
  subGroups: BSGroup[];
  total: Prisma.Decimal;
  previousTotal?: Prisma.Decimal;
}

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
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
          status: "APPROVED",
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
            status: "APPROVED",
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
          status: "APPROVED",
        },
      },
    });

    // Calculate net profit for current year
    let currentYearProfit = D(0);
    plLedgers.forEach((ledger) => {
      const ledgerEntries = plEntries.filter((e) => e.ledgerId === ledger.id);
      const debit = sum(ledgerEntries.map((e) => e.debitAmount));
      const credit = sum(ledgerEntries.map((e) => e.creditAmount));
      if (ledger.group.nature === "INCOME") {
        currentYearProfit = currentYearProfit.plus(credit.minus(debit));
      } else {
        currentYearProfit = currentYearProfit.minus(debit.minus(credit));
      }
    });

    // Calculate balances for each ledger
    const calculateBalance = (
      ledger: typeof ledgers[0],
      entries: typeof voucherEntries
    ): Prisma.Decimal => {
      const isDebitNature = ledger.group.nature === "ASSETS";

      // Opening balance
      const openingBalance = D(ledger.openingBalance ?? 0);
      let balance = ledger.openingBalanceType === "DR" || (isDebitNature && !ledger.openingBalanceType)
        ? openingBalance
        : openingBalance.negated();

      // Add transaction movements
      const ledgerEntries = entries.filter((e) => e.ledgerId === ledger.id);
      const debit = sum(ledgerEntries.map((e) => e.debitAmount));
      const credit = sum(ledgerEntries.map((e) => e.creditAmount));

      balance = balance.plus(debit).minus(credit);

      // For assets: positive is debit balance
      // For liabilities/equity: negative is credit balance (show as positive)
      return isDebitNature ? balance : balance.negated();
    };

    // Build balance map
    const balances = new Map<string, { current: Prisma.Decimal; previous: Prisma.Decimal }>();
    ledgers.forEach((ledger) => {
      const current = calculateBalance(ledger, voucherEntries);
      const previous = compareWithPrevious ? calculateBalance(ledger, prevEntries) : D(0);
      balances.set(ledger.id, { current, previous });
    });

    // Build hierarchical structure
    const buildGroupStructure = (
      nature: string,
      _entries: typeof voucherEntries
    ): BSGroup[] => {
      const natureLedgers = ledgers.filter((l) => l.group.nature === nature);
      const natureGroups = ledgerGroups.filter((g) => g.nature === nature && !g.parentId);

      return natureGroups.map((group) => {
        const groupLedgers = natureLedgers.filter((l) => l.group.id === group.id);

        const items: BSLineItem[] = groupLedgers
          .map((ledger) => {
            const bal = balances.get(ledger.id) || { current: D(0), previous: D(0) };
            return {
              ledgerId: ledger.id,
              ledgerName: ledger.name,
              groupId: group.id,
              groupName: group.name,
              balance: bal.current,
              previousBalance: compareWithPrevious ? bal.previous : undefined,
            };
          })
          .filter((item) => !item.balance.isZero() || (item.previousBalance && !item.previousBalance.isZero()));

        // Get child groups
        const childGroups = ledgerGroups.filter((g) => g.parentId === group.id);
        const subGroups: BSGroup[] = childGroups.map((childGroup) => {
          const childLedgers = natureLedgers.filter((l) => l.group.id === childGroup.id);
          const childItems: BSLineItem[] = childLedgers
            .map((ledger) => {
              const bal = balances.get(ledger.id) || { current: D(0), previous: D(0) };
              return {
                ledgerId: ledger.id,
                ledgerName: ledger.name,
                groupId: childGroup.id,
                groupName: childGroup.name,
                balance: bal.current,
                previousBalance: compareWithPrevious ? bal.previous : undefined,
              };
            })
            .filter((item) => !item.balance.isZero() || (item.previousBalance && !item.previousBalance.isZero()));

          return {
            groupId: childGroup.id,
            groupName: childGroup.name,
            parentId: childGroup.parentId,
            items: childItems,
            subGroups: [],
            total: sum(childItems.map((i) => i.balance)),
            previousTotal: compareWithPrevious
              ? sum(childItems.map((i) => i.previousBalance ?? D(0)))
              : undefined,
          };
        });

        const total = sum(items.map((i) => i.balance)).plus(
          sum(subGroups.map((g) => g.total))
        );

        const previousTotal = compareWithPrevious
          ? sum(items.map((i) => i.previousBalance ?? D(0))).plus(
              sum(subGroups.map((g) => g.previousTotal ?? D(0)))
            )
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
    const totalAssets = sum(assets.map((g) => g.total));
    const totalLiabilities = sum(liabilities.map((g) => g.total));
    const totalEquity = sum(equity.map((g) => g.total));

    // Add current year profit to equity
    const totalEquityWithProfit = totalEquity.plus(currentYearProfit);
    const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquityWithProfit);

    // Previous totals
    const prevTotalAssets = sum(assets.map((g) => g.previousTotal ?? D(0)));
    const prevTotalLiabilities = sum(liabilities.map((g) => g.previousTotal ?? D(0)));
    const prevTotalEquity = sum(equity.map((g) => g.previousTotal ?? D(0)));

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
        isBalanced: totalAssets.minus(totalLiabilitiesAndEquity).abs().lessThan(D("0.01")),
        difference: totalAssets.minus(totalLiabilitiesAndEquity),
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
});

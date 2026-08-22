import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { D, sum } from "@/backend/utils/money";
import { valueClosingStock } from "@/backend/services/inventory/valuation";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/backend/utils/logger";

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

    /*
     * Profit is needed over two windows, not one.
     *
     * This previously read only the current fiscal year and added that to
     * equity. Nothing closes a year — there is no closing voucher, and profit
     * is never posted into an equity ledger — so from the second year onward
     * the assets earned in year one carried forward while the equity that
     * balanced them did not, and the statement stopped balancing.
     *
     * Retained earnings are therefore derived: everything earned before this
     * fiscal year is brought forward, and this year's profit is shown
     * separately, exactly as a closing entry would have left them.
     */
    const [plEntriesAllTime, plEntriesThisYear] = await Promise.all([
      prisma.voucherEntry.findMany({
        where: {
          ledgerId: { in: plLedgers.map((l) => l.id) },
          voucher: {
            organizationId: orgId,
            date: { lte: asOfDate },
            status: "APPROVED",
          },
        },
      }),
      prisma.voucherEntry.findMany({
        where: {
          ledgerId: { in: plLedgers.map((l) => l.id) },
          voucher: {
            organizationId: orgId,
            date: { gte: fyStart, lte: asOfDate },
            status: "APPROVED",
          },
        },
      }),
    ]);

    const ledgerProfit = (
      entries: {
        ledgerId: string;
        debitAmount: Prisma.Decimal;
        creditAmount: Prisma.Decimal;
      }[]
    ) => {
      let profit = D(0);
      plLedgers.forEach((ledger) => {
        const ledgerEntries = entries.filter((e) => e.ledgerId === ledger.id);
        const debit = sum(ledgerEntries.map((e) => e.debitAmount));
        const credit = sum(ledgerEntries.map((e) => e.creditAmount));
        if (ledger.group.nature === "INCOME") {
          profit = profit.plus(credit.minus(debit));
        } else {
          profit = profit.minus(debit.minus(credit));
        }
      });
      return profit;
    };

    /*
     * Closing stock, the other half of the periodic costing model.
     *
     * Purchases are expensed on the bill, so unsold goods have to be added back
     * as an asset and as profit. Valued at two dates: now, and the instant
     * before this fiscal year opened, so the year's movement lands in this
     * year's profit and the rest in retained earnings.
     */
    const [closingStockNow, closingStockAtFyStart] = await Promise.all([
      valueClosingStock(orgId, asOfDate),
      valueClosingStock(orgId, new Date(fyStart.getTime() - 1)),
    ]);
    const stockNow = D(closingStockNow.total);
    const stockBrought = D(closingStockAtFyStart.total);

    const profitAllTime = ledgerProfit(plEntriesAllTime);
    const profitThisYearFromLedgers = ledgerProfit(plEntriesThisYear);

    const currentYearProfit = profitThisYearFromLedgers
      .plus(stockNow)
      .minus(stockBrought);

    /** Everything earned in closed years, which a closing voucher would have moved to equity. */
    const retainedEarningsBroughtForward = profitAllTime
      .minus(profitThisYearFromLedgers)
      .plus(stockBrought);

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

      /**
       * Walk the group tree to its full depth.
       *
       * This previously collected root groups and exactly one level of
       * children, hard-coding `subGroups: []` below that. The default chart
       * of accounts nests three deep — Assets > Current Assets > Cash & Bank
       * — so every ledger sat one level past where the walk stopped and the
       * statement reported zero assets and zero liabilities against a trial
       * balance that agreed perfectly. The response even carried
       * `isBalanced: false` and still returned 200.
       *
       * Recursing means the statement is correct for any depth a user
       * builds, rather than only for a chart flatter than the one shipped.
       */
      const buildGroup = (group: (typeof ledgerGroups)[number]): BSGroup => {
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

        const subGroups: BSGroup[] = ledgerGroups
          .filter((g) => g.parentId === group.id)
          .map(buildGroup);

        return {
          groupId: group.id,
          groupName: group.name,
          parentId: group.parentId,
          items,
          subGroups,
          total: sum(items.map((i) => i.balance)).plus(sum(subGroups.map((g) => g.total))),
          previousTotal: compareWithPrevious
            ? sum(items.map((i) => i.previousBalance ?? D(0))).plus(
                sum(subGroups.map((g) => g.previousTotal ?? D(0)))
              )
            : undefined,
        };
      };

      return ledgerGroups
        .filter((g) => g.nature === nature && !g.parentId)
        .map(buildGroup);
    };

    const assets = buildGroupStructure("ASSETS", voucherEntries);
    const liabilities = buildGroupStructure("LIABILITIES", voucherEntries);
    const equity = buildGroupStructure("EQUITY", voucherEntries);

    // Calculate totals
    const assetLedgerTotal = sum(assets.map((g) => g.total));
    // Stock-in-Hand is derived from the inventory, not from a ledger — the
    // matching credit is the closing-stock adjustment inside profit below, so
    // adding it to both sides keeps the statement balanced.
    const totalAssets = assetLedgerTotal.plus(stockNow);
    const totalLiabilities = sum(liabilities.map((g) => g.total));
    const totalEquity = sum(equity.map((g) => g.total));

    const totalEquityWithProfit = totalEquity
      .plus(retainedEarningsBroughtForward)
      .plus(currentYearProfit);
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
        ledgerTotal: assetLedgerTotal,
        stockInHand: {
          value: stockNow,
          items: closingStockNow.items,
        },
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
        retainedEarnings: retainedEarningsBroughtForward,
        currentYearProfit,
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
    logger.error({ err: error }, "Error generating balance sheet");
    return NextResponse.json(
      { error: "Failed to generate balance sheet" },
      { status: 500 }
    );
  }
});

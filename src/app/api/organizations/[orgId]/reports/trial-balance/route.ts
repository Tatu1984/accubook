import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { D, sum } from "@/backend/utils/money";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TrialBalanceItem {
  ledgerId: string;
  ledgerName: string;
  ledgerCode: string | null;
  groupId: string;
  groupName: string;
  nature: string;
  openingDebit: Prisma.Decimal;
  openingCredit: Prisma.Decimal;
  periodDebit: Prisma.Decimal;
  periodCredit: Prisma.Decimal;
  closingDebit: Prisma.Decimal;
  closingCredit: Prisma.Decimal;
}

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const asOfDate = searchParams.get("asOfDate")
      ? new Date(searchParams.get("asOfDate")!)
      : new Date();
    const fiscalYearId = searchParams.get("fiscalYearId");

    // Get fiscal year dates
    let fyStart: Date;
    let fyEnd: Date;

    if (fiscalYearId) {
      const fiscalYear = await prisma.fiscalYear.findUnique({
        where: { id: fiscalYearId },
      });
      if (fiscalYear) {
        fyStart = fiscalYear.startDate;
        fyEnd = fiscalYear.endDate;
      } else {
        // Default to current FY (April to March)
        const currentYear = asOfDate.getFullYear();
        fyStart = asOfDate.getMonth() >= 3
          ? new Date(currentYear, 3, 1)
          : new Date(currentYear - 1, 3, 1);
        fyEnd = asOfDate;
      }
    } else {
      const currentYear = asOfDate.getFullYear();
      fyStart = asOfDate.getMonth() >= 3
        ? new Date(currentYear, 3, 1)
        : new Date(currentYear - 1, 3, 1);
      fyEnd = asOfDate;
    }

    // Get all ledgers with their groups
    const ledgers = await prisma.ledger.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            nature: true,
          },
        },
      },
      orderBy: [
        { group: { nature: "asc" } },
        { group: { name: "asc" } },
        { name: "asc" },
      ],
    });

    // Get all voucher entries for the period (only posted/approved vouchers)
    const voucherEntries = await prisma.voucherEntry.findMany({
      where: {
        voucher: {
          organizationId: orgId,
          date: { lte: fyEnd },
          status: "APPROVED",
          isPosted: true,
        },
      },
      include: {
        voucher: {
          select: {
            date: true,
          },
        },
      },
    });

    // Calculate balances for each ledger
    const trialBalanceItems: TrialBalanceItem[] = ledgers.map((ledger) => {
      // Opening balance from ledger
      const openingBalance = D(ledger.openingBalance ?? 0);
      const isDebitNature = ["ASSETS", "EXPENSES"].includes(ledger.group.nature);

      let openingDebit = D(0);
      let openingCredit = D(0);

      if (ledger.openingBalanceType === "DR" || (isDebitNature && !ledger.openingBalanceType)) {
        openingDebit = openingBalance;
      } else {
        openingCredit = openingBalance;
      }

      // Calculate period movements
      const ledgerEntries = voucherEntries.filter((e) => e.ledgerId === ledger.id);

      // Entries before FY start (for opening)
      const beforeFYEntries = ledgerEntries.filter((e) => e.voucher.date < fyStart);
      const beforeDebit = sum(beforeFYEntries.map((e) => e.debitAmount));
      const beforeCredit = sum(beforeFYEntries.map((e) => e.creditAmount));

      // Add transaction-based opening to ledger opening
      openingDebit = openingDebit.plus(beforeDebit);
      openingCredit = openingCredit.plus(beforeCredit);

      // Period entries (from FY start to asOfDate)
      const periodEntries = ledgerEntries.filter(
        (e) => e.voucher.date >= fyStart && e.voucher.date <= fyEnd
      );
      const periodDebit = sum(periodEntries.map((e) => e.debitAmount));
      const periodCredit = sum(periodEntries.map((e) => e.creditAmount));

      // Calculate closing balance
      const totalDebit = openingDebit.plus(periodDebit);
      const totalCredit = openingCredit.plus(periodCredit);

      let closingDebit = D(0);
      let closingCredit = D(0);

      if (totalDebit.greaterThan(totalCredit)) {
        closingDebit = totalDebit.minus(totalCredit);
      } else {
        closingCredit = totalCredit.minus(totalDebit);
      }

      return {
        ledgerId: ledger.id,
        ledgerName: ledger.name,
        ledgerCode: ledger.code,
        groupId: ledger.group.id,
        groupName: ledger.group.name,
        nature: ledger.group.nature,
        openingDebit,
        openingCredit,
        periodDebit,
        periodCredit,
        closingDebit,
        closingCredit,
      };
    });

    // Filter out zero-balance ledgers (optional, can be controlled by query param)
    const showZeroBalances = searchParams.get("showZeroBalances") === "true";
    const filteredItems = showZeroBalances
      ? trialBalanceItems
      : trialBalanceItems.filter(
          (item) =>
            !item.openingDebit.isZero() ||
            !item.openingCredit.isZero() ||
            !item.periodDebit.isZero() ||
            !item.periodCredit.isZero() ||
            !item.closingDebit.isZero() ||
            !item.closingCredit.isZero()
        );

    // Calculate totals
    const totals = filteredItems.reduce(
      (acc, item) => ({
        openingDebit: acc.openingDebit.plus(item.openingDebit),
        openingCredit: acc.openingCredit.plus(item.openingCredit),
        periodDebit: acc.periodDebit.plus(item.periodDebit),
        periodCredit: acc.periodCredit.plus(item.periodCredit),
        closingDebit: acc.closingDebit.plus(item.closingDebit),
        closingCredit: acc.closingCredit.plus(item.closingCredit),
      }),
      {
        openingDebit: D(0),
        openingCredit: D(0),
        periodDebit: D(0),
        periodCredit: D(0),
        closingDebit: D(0),
        closingCredit: D(0),
      }
    );

    // Group by ledger group for hierarchical view
    interface GroupedLedger {
      groupId: string;
      groupName: string;
      ledgers: typeof filteredItems;
      totals: {
        openingDebit: Prisma.Decimal;
        openingCredit: Prisma.Decimal;
        periodDebit: Prisma.Decimal;
        periodCredit: Prisma.Decimal;
        closingDebit: Prisma.Decimal;
        closingCredit: Prisma.Decimal;
      };
    }
    interface NatureGroup {
      nature: string;
      groups: Record<string, GroupedLedger>;
    }
    const groupedByNature = filteredItems.reduce((acc, item) => {
      if (!acc[item.nature]) {
        acc[item.nature] = {
          nature: item.nature,
          groups: {},
        };
      }
      if (!acc[item.nature].groups[item.groupName]) {
        acc[item.nature].groups[item.groupName] = {
          groupId: item.groupId,
          groupName: item.groupName,
          ledgers: [],
          totals: {
            openingDebit: D(0),
            openingCredit: D(0),
            periodDebit: D(0),
            periodCredit: D(0),
            closingDebit: D(0),
            closingCredit: D(0),
          },
        };
      }
      const groupTotals = acc[item.nature].groups[item.groupName].totals;
      acc[item.nature].groups[item.groupName].ledgers.push(item);
      groupTotals.openingDebit = groupTotals.openingDebit.plus(item.openingDebit);
      groupTotals.openingCredit = groupTotals.openingCredit.plus(item.openingCredit);
      groupTotals.periodDebit = groupTotals.periodDebit.plus(item.periodDebit);
      groupTotals.periodCredit = groupTotals.periodCredit.plus(item.periodCredit);
      groupTotals.closingDebit = groupTotals.closingDebit.plus(item.closingDebit);
      groupTotals.closingCredit = groupTotals.closingCredit.plus(item.closingCredit);
      return acc;
    }, {} as Record<string, NatureGroup>);

    return NextResponse.json({
      asOfDate: fyEnd.toISOString(),
      fiscalYearStart: fyStart.toISOString(),
      items: filteredItems,
      groupedByNature,
      totals,
      isBalanced: totals.closingDebit.minus(totals.closingCredit).abs().lessThan(D("0.01")),
      difference: totals.closingDebit.minus(totals.closingCredit),
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating trial balance");
    return NextResponse.json(
      { error: "Failed to generate trial balance" },
      { status: 500 }
    );
  }
});

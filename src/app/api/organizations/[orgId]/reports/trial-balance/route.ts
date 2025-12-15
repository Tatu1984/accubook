import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TrialBalanceItem {
  ledgerId: string;
  ledgerName: string;
  ledgerCode: string | null;
  groupId: string;
  groupName: string;
  nature: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
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
          status: { in: ["APPROVED", "DRAFT"] }, // Include draft for now
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
      const openingBalance = Number(ledger.openingBalance) || 0;
      const isDebitNature = ["ASSETS", "EXPENSES"].includes(ledger.group.nature);

      let openingDebit = 0;
      let openingCredit = 0;

      if (ledger.openingBalanceType === "DR" || (isDebitNature && !ledger.openingBalanceType)) {
        openingDebit = openingBalance;
      } else {
        openingCredit = openingBalance;
      }

      // Calculate period movements
      const ledgerEntries = voucherEntries.filter((e) => e.ledgerId === ledger.id);

      // Entries before FY start (for opening)
      const beforeFYEntries = ledgerEntries.filter((e) => e.voucher.date < fyStart);
      const beforeDebit = beforeFYEntries.reduce((sum, e) => sum + Number(e.debitAmount), 0);
      const beforeCredit = beforeFYEntries.reduce((sum, e) => sum + Number(e.creditAmount), 0);

      // Add transaction-based opening to ledger opening
      openingDebit += beforeDebit;
      openingCredit += beforeCredit;

      // Period entries (from FY start to asOfDate)
      const periodEntries = ledgerEntries.filter(
        (e) => e.voucher.date >= fyStart && e.voucher.date <= fyEnd
      );
      const periodDebit = periodEntries.reduce((sum, e) => sum + Number(e.debitAmount), 0);
      const periodCredit = periodEntries.reduce((sum, e) => sum + Number(e.creditAmount), 0);

      // Calculate closing balance
      const totalDebit = openingDebit + periodDebit;
      const totalCredit = openingCredit + periodCredit;

      let closingDebit = 0;
      let closingCredit = 0;

      if (totalDebit > totalCredit) {
        closingDebit = totalDebit - totalCredit;
      } else {
        closingCredit = totalCredit - totalDebit;
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
            item.openingDebit !== 0 ||
            item.openingCredit !== 0 ||
            item.periodDebit !== 0 ||
            item.periodCredit !== 0 ||
            item.closingDebit !== 0 ||
            item.closingCredit !== 0
        );

    // Calculate totals
    const totals = filteredItems.reduce(
      (acc, item) => ({
        openingDebit: acc.openingDebit + item.openingDebit,
        openingCredit: acc.openingCredit + item.openingCredit,
        periodDebit: acc.periodDebit + item.periodDebit,
        periodCredit: acc.periodCredit + item.periodCredit,
        closingDebit: acc.closingDebit + item.closingDebit,
        closingCredit: acc.closingCredit + item.closingCredit,
      }),
      {
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: 0,
        periodCredit: 0,
        closingDebit: 0,
        closingCredit: 0,
      }
    );

    // Group by ledger group for hierarchical view
    interface GroupedLedger {
      groupId: string;
      groupName: string;
      ledgers: typeof filteredItems;
      totals: {
        openingDebit: number;
        openingCredit: number;
        periodDebit: number;
        periodCredit: number;
        closingDebit: number;
        closingCredit: number;
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
            openingDebit: 0,
            openingCredit: 0,
            periodDebit: 0,
            periodCredit: 0,
            closingDebit: 0,
            closingCredit: 0,
          },
        };
      }
      acc[item.nature].groups[item.groupName].ledgers.push(item);
      acc[item.nature].groups[item.groupName].totals.openingDebit += item.openingDebit;
      acc[item.nature].groups[item.groupName].totals.openingCredit += item.openingCredit;
      acc[item.nature].groups[item.groupName].totals.periodDebit += item.periodDebit;
      acc[item.nature].groups[item.groupName].totals.periodCredit += item.periodCredit;
      acc[item.nature].groups[item.groupName].totals.closingDebit += item.closingDebit;
      acc[item.nature].groups[item.groupName].totals.closingCredit += item.closingCredit;
      return acc;
    }, {} as Record<string, NatureGroup>);

    return NextResponse.json({
      asOfDate: fyEnd.toISOString(),
      fiscalYearStart: fyStart.toISOString(),
      items: filteredItems,
      groupedByNature,
      totals,
      isBalanced: Math.abs(totals.closingDebit - totals.closingCredit) < 0.01,
      difference: totals.closingDebit - totals.closingCredit,
    });
  } catch (error) {
    console.error("Error generating trial balance:", error);
    return NextResponse.json(
      { error: "Failed to generate trial balance" },
      { status: 500 }
    );
  }
}

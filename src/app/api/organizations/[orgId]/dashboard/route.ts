import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    // Ensure cookies are available for auth
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

    // Default to current fiscal year if no dates provided
    const currentYear = new Date().getFullYear();
    const fyStartMonth = 3; // April (0-indexed)
    const fyStart = startDate
      ? new Date(startDate)
      : new Date().getMonth() >= fyStartMonth
      ? new Date(currentYear, fyStartMonth, 1)
      : new Date(currentYear - 1, fyStartMonth, 1);

    const fyEnd = endDate ? new Date(endDate) : new Date();

    // Fetch all dashboard data in parallel
    const [
      invoiceStats,
      billStats,
      bankBalances,
      stockValue,
      recentTransactions,
      topCustomers,
      pendingVouchers,
      overdueInvoices,
      overdueBills,
    ] = await Promise.all([
      // Invoice (Sales) statistics
      prisma.invoice.aggregate({
        where: {
          organizationId: orgId,
          date: { gte: fyStart, lte: fyEnd },
          status: { not: "CANCELLED" },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),

      // Bill (Purchase) statistics
      prisma.bill.aggregate({
        where: {
          organizationId: orgId,
          date: { gte: fyStart, lte: fyEnd },
          status: { not: "CANCELLED" },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),

      // Bank account balances
      prisma.bankAccount.aggregate({
        where: {
          organizationId: orgId,
          isActive: true,
        },
        _sum: { currentBalance: true },
      }),

      // Stock value
      prisma.stock.findMany({
        where: {
          item: { organizationId: orgId },
        },
        include: {
          item: {
            select: {
              purchasePrice: true,
            },
          },
        },
      }),

      // Recent vouchers/transactions
      prisma.voucher.findMany({
        where: {
          organizationId: orgId,
        },
        include: {
          voucherType: {
            select: {
              name: true,
              code: true,
            },
          },
          entries: {
            include: {
              ledger: {
                select: {
                  name: true,
                },
              },
            },
            take: 2,
          },
        },
        orderBy: { date: "desc" },
        take: 10,
      }),

      // Top customers by revenue
      prisma.invoice.groupBy({
        by: ["partyId"],
        where: {
          organizationId: orgId,
          date: { gte: fyStart, lte: fyEnd },
          status: { not: "CANCELLED" },
        },
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: "desc" } },
        take: 5,
      }),

      // Pending vouchers for approval
      prisma.voucher.count({
        where: {
          organizationId: orgId,
          status: "PENDING",
        },
      }),

      // Overdue invoices
      prisma.invoice.count({
        where: {
          organizationId: orgId,
          status: { in: ["SENT", "PARTIAL"] },
          dueDate: { lt: new Date() },
        },
      }),

      // Overdue bills
      prisma.bill.count({
        where: {
          organizationId: orgId,
          status: { in: ["PENDING_APPROVAL", "APPROVED", "PARTIAL"] },
          dueDate: { lt: new Date() },
        },
      }),
    ]);

    // Calculate receivables (unpaid invoices)
    const receivables = await prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
      select: {
        totalAmount: true,
        amountPaid: true,
      },
    });

    const totalReceivables = receivables.reduce((sum, inv) => {
      return sum + (Number(inv.totalAmount) - Number(inv.amountPaid));
    }, 0);

    // Calculate payables (unpaid bills)
    const payables = await prisma.bill.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["PENDING_APPROVAL", "APPROVED", "PARTIAL", "OVERDUE"] },
      },
      select: {
        totalAmount: true,
        amountPaid: true,
      },
    });

    const totalPayables = payables.reduce((sum, bill) => {
      return sum + (Number(bill.totalAmount) - Number(bill.amountPaid));
    }, 0);

    // Calculate stock value
    const totalStockValue = stockValue.reduce(
      (sum, s) => sum + Number(s.quantity) * Number(s.item.purchasePrice),
      0
    );

    // Get customer names for top customers
    const topCustomerIds = topCustomers.map((c) => c.partyId);
    const customerNames = await prisma.ledger.findMany({
      where: { id: { in: topCustomerIds } },
      select: { id: true, name: true },
    });

    const customerNameMap = Object.fromEntries(
      customerNames.map((c) => [c.id, c.name])
    );

    const dashboardData = {
      kpis: {
        revenue: Number(invoiceStats._sum.totalAmount || 0),
        expenses: Number(billStats._sum.totalAmount || 0),
        profit:
          Number(invoiceStats._sum.totalAmount || 0) -
          Number(billStats._sum.totalAmount || 0),
        receivables: totalReceivables,
        payables: totalPayables,
        cashBalance: Number(bankBalances._sum.currentBalance || 0),
        stockValue: totalStockValue,
        invoiceCount: invoiceStats._count,
        billCount: billStats._count,
      },
      recentTransactions: recentTransactions.map((v) => ({
        id: v.id,
        date: v.date,
        voucherNumber: v.voucherNumber,
        type: v.voucherType.name,
        amount: Number(v.totalDebit),
        description:
          v.entries.map((e) => e.ledger.name).join(" → ") || v.narration,
      })),
      topCustomers: topCustomers.map((c) => ({
        id: c.partyId,
        name: customerNameMap[c.partyId] || "Unknown",
        revenue: Number(c._sum.totalAmount || 0),
      })),
      pendingActions: {
        pendingVouchers,
        overdueInvoices,
        overdueBills,
        lowStockItems: 0, // Will implement later with proper query
        total: pendingVouchers + overdueInvoices + overdueBills,
      },
      period: {
        startDate: fyStart.toISOString(),
        endDate: fyEnd.toISOString(),
      },
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}

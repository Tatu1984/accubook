import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  amount: number;
  count: number;
  items: AgingItem[];
}

interface AgingItem {
  id: string;
  number: string;
  partyId: string;
  partyName: string;
  date: Date;
  dueDate: Date;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  daysOverdue: number;
  bucket: string;
}

interface PartyAging {
  partyId: string;
  partyName: string;
  partyType: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
  items: AgingItem[];
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
    const type = searchParams.get("type") || "receivables"; // receivables or payables
    const asOfDate = searchParams.get("asOfDate")
      ? new Date(searchParams.get("asOfDate")!)
      : new Date();
    const partyId = searchParams.get("partyId");

    const today = new Date(asOfDate);
    today.setHours(23, 59, 59, 999);

    // Define aging buckets
    const buckets: AgingBucket[] = [
      { label: "Current", minDays: -Infinity, maxDays: 0, amount: 0, count: 0, items: [] },
      { label: "1-30 Days", minDays: 1, maxDays: 30, amount: 0, count: 0, items: [] },
      { label: "31-60 Days", minDays: 31, maxDays: 60, amount: 0, count: 0, items: [] },
      { label: "61-90 Days", minDays: 61, maxDays: 90, amount: 0, count: 0, items: [] },
      { label: "Over 90 Days", minDays: 91, maxDays: null, amount: 0, count: 0, items: [] },
    ];

    if (type === "receivables") {
      // Get unpaid/partially paid invoices
      const invoices = await prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
          ...(partyId ? { partyId } : {}),
        },
        include: {
          party: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: { dueDate: "asc" },
      });

      const items: AgingItem[] = invoices.map((invoice) => {
        const dueDate = new Date(invoice.dueDate);
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const amountDue = Number(invoice.totalAmount) - Number(invoice.amountPaid);

        let bucketLabel = "Current";
        if (daysOverdue > 90) bucketLabel = "Over 90 Days";
        else if (daysOverdue > 60) bucketLabel = "61-90 Days";
        else if (daysOverdue > 30) bucketLabel = "31-60 Days";
        else if (daysOverdue > 0) bucketLabel = "1-30 Days";

        return {
          id: invoice.id,
          number: invoice.invoiceNumber,
          partyId: invoice.partyId,
          partyName: invoice.party.name,
          date: invoice.date,
          dueDate: invoice.dueDate,
          totalAmount: Number(invoice.totalAmount),
          amountPaid: Number(invoice.amountPaid),
          amountDue,
          daysOverdue: Math.max(0, daysOverdue),
          bucket: bucketLabel,
        };
      });

      // Populate buckets
      items.forEach((item) => {
        const bucket = buckets.find((b) => b.label === item.bucket);
        if (bucket) {
          bucket.amount += item.amountDue;
          bucket.count++;
          bucket.items.push(item);
        }
      });

      // Group by party
      const partyAgingMap = new Map<string, PartyAging>();
      items.forEach((item) => {
        if (!partyAgingMap.has(item.partyId)) {
          partyAgingMap.set(item.partyId, {
            partyId: item.partyId,
            partyName: item.partyName,
            partyType: "CUSTOMER",
            current: 0,
            days1to30: 0,
            days31to60: 0,
            days61to90: 0,
            over90: 0,
            total: 0,
            items: [],
          });
        }

        const partyAging = partyAgingMap.get(item.partyId)!;
        partyAging.items.push(item);
        partyAging.total += item.amountDue;

        if (item.bucket === "Current") partyAging.current += item.amountDue;
        else if (item.bucket === "1-30 Days") partyAging.days1to30 += item.amountDue;
        else if (item.bucket === "31-60 Days") partyAging.days31to60 += item.amountDue;
        else if (item.bucket === "61-90 Days") partyAging.days61to90 += item.amountDue;
        else partyAging.over90 += item.amountDue;
      });

      const partyAging = Array.from(partyAgingMap.values()).sort(
        (a, b) => b.total - a.total
      );

      return NextResponse.json({
        type: "receivables",
        asOfDate: asOfDate.toISOString(),
        buckets: buckets.map((b) => ({
          label: b.label,
          amount: b.amount,
          count: b.count,
          percentage: buckets.reduce((s, x) => s + x.amount, 0) > 0
            ? (b.amount / buckets.reduce((s, x) => s + x.amount, 0)) * 100
            : 0,
        })),
        partyAging,
        summary: {
          totalOutstanding: buckets.reduce((sum, b) => sum + b.amount, 0),
          totalCurrent: buckets[0].amount,
          totalOverdue: buckets.slice(1).reduce((sum, b) => sum + b.amount, 0),
          totalCount: items.length,
          overdueCount: items.filter((i) => i.daysOverdue > 0).length,
          averageDaysOverdue:
            items.length > 0
              ? items.reduce((sum, i) => sum + i.daysOverdue, 0) / items.length
              : 0,
        },
        details: items,
      });
    } else {
      // Payables - Get unpaid/partially paid bills
      const bills = await prisma.bill.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["PENDING_APPROVAL", "APPROVED", "PARTIAL", "OVERDUE"] },
          ...(partyId ? { partyId } : {}),
        },
        include: {
          party: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: { dueDate: "asc" },
      });

      const items: AgingItem[] = bills.map((bill) => {
        const dueDate = new Date(bill.dueDate);
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const amountDue = Number(bill.totalAmount) - Number(bill.amountPaid);

        let bucketLabel = "Current";
        if (daysOverdue > 90) bucketLabel = "Over 90 Days";
        else if (daysOverdue > 60) bucketLabel = "61-90 Days";
        else if (daysOverdue > 30) bucketLabel = "31-60 Days";
        else if (daysOverdue > 0) bucketLabel = "1-30 Days";

        return {
          id: bill.id,
          number: bill.billNumber,
          partyId: bill.partyId,
          partyName: bill.party.name,
          date: bill.date,
          dueDate: bill.dueDate,
          totalAmount: Number(bill.totalAmount),
          amountPaid: Number(bill.amountPaid),
          amountDue,
          daysOverdue: Math.max(0, daysOverdue),
          bucket: bucketLabel,
        };
      });

      // Populate buckets
      items.forEach((item) => {
        const bucket = buckets.find((b) => b.label === item.bucket);
        if (bucket) {
          bucket.amount += item.amountDue;
          bucket.count++;
          bucket.items.push(item);
        }
      });

      // Group by party
      const partyAgingMap = new Map<string, PartyAging>();
      items.forEach((item) => {
        if (!partyAgingMap.has(item.partyId)) {
          partyAgingMap.set(item.partyId, {
            partyId: item.partyId,
            partyName: item.partyName,
            partyType: "VENDOR",
            current: 0,
            days1to30: 0,
            days31to60: 0,
            days61to90: 0,
            over90: 0,
            total: 0,
            items: [],
          });
        }

        const partyAging = partyAgingMap.get(item.partyId)!;
        partyAging.items.push(item);
        partyAging.total += item.amountDue;

        if (item.bucket === "Current") partyAging.current += item.amountDue;
        else if (item.bucket === "1-30 Days") partyAging.days1to30 += item.amountDue;
        else if (item.bucket === "31-60 Days") partyAging.days31to60 += item.amountDue;
        else if (item.bucket === "61-90 Days") partyAging.days61to90 += item.amountDue;
        else partyAging.over90 += item.amountDue;
      });

      const partyAging = Array.from(partyAgingMap.values()).sort(
        (a, b) => b.total - a.total
      );

      return NextResponse.json({
        type: "payables",
        asOfDate: asOfDate.toISOString(),
        buckets: buckets.map((b) => ({
          label: b.label,
          amount: b.amount,
          count: b.count,
          percentage: buckets.reduce((s, x) => s + x.amount, 0) > 0
            ? (b.amount / buckets.reduce((s, x) => s + x.amount, 0)) * 100
            : 0,
        })),
        partyAging,
        summary: {
          totalOutstanding: buckets.reduce((sum, b) => sum + b.amount, 0),
          totalCurrent: buckets[0].amount,
          totalOverdue: buckets.slice(1).reduce((sum, b) => sum + b.amount, 0),
          totalCount: items.length,
          overdueCount: items.filter((i) => i.daysOverdue > 0).length,
          averageDaysOverdue:
            items.length > 0
              ? items.reduce((sum, i) => sum + i.daysOverdue, 0) / items.length
              : 0,
        },
        details: items,
      });
    }
  } catch (error) {
    console.error("Error generating aging report:", error);
    return NextResponse.json(
      { error: "Failed to generate aging report" },
      { status: 500 }
    );
  }
}

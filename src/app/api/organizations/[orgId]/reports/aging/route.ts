import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { D, sum, toNumber } from "@/backend/utils/money";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  amount: Prisma.Decimal;
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
  amountDue: Prisma.Decimal;
  daysOverdue: number;
  bucket: string;
}

interface PartyAging {
  partyId: string;
  partyName: string;
  partyType: string;
  current: Prisma.Decimal;
  days1to30: Prisma.Decimal;
  days31to60: Prisma.Decimal;
  days61to90: Prisma.Decimal;
  over90: Prisma.Decimal;
  total: Prisma.Decimal;
  items: AgingItem[];
}

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
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
      { label: "Current", minDays: -Infinity, maxDays: 0, amount: D(0), count: 0, items: [] },
      { label: "1-30 Days", minDays: 1, maxDays: 30, amount: D(0), count: 0, items: [] },
      { label: "31-60 Days", minDays: 31, maxDays: 60, amount: D(0), count: 0, items: [] },
      { label: "61-90 Days", minDays: 61, maxDays: 90, amount: D(0), count: 0, items: [] },
      { label: "Over 90 Days", minDays: 91, maxDays: null, amount: D(0), count: 0, items: [] },
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
        const amountDue = D(invoice.totalAmount).minus(D(invoice.amountPaid));

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
          bucket.amount = bucket.amount.plus(item.amountDue);
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
            current: D(0),
            days1to30: D(0),
            days31to60: D(0),
            days61to90: D(0),
            over90: D(0),
            total: D(0),
            items: [],
          });
        }

        const partyAging = partyAgingMap.get(item.partyId)!;
        partyAging.items.push(item);
        partyAging.total = partyAging.total.plus(item.amountDue);

        if (item.bucket === "Current") partyAging.current = partyAging.current.plus(item.amountDue);
        else if (item.bucket === "1-30 Days") partyAging.days1to30 = partyAging.days1to30.plus(item.amountDue);
        else if (item.bucket === "31-60 Days") partyAging.days31to60 = partyAging.days31to60.plus(item.amountDue);
        else if (item.bucket === "61-90 Days") partyAging.days61to90 = partyAging.days61to90.plus(item.amountDue);
        else partyAging.over90 = partyAging.over90.plus(item.amountDue);
      });

      const partyAging = Array.from(partyAgingMap.values()).sort(
        (a, b) => b.total.cmp(a.total)
      );

      const totalOutstanding = sum(buckets.map((b) => b.amount));

      return NextResponse.json({
        type: "receivables",
        asOfDate: asOfDate.toISOString(),
        buckets: buckets.map((b) => ({
          label: b.label,
          amount: b.amount,
          count: b.count,
          percentage: totalOutstanding.greaterThan(D(0))
            ? toNumber(b.amount.div(totalOutstanding).times(D(100)))
            : 0,
        })),
        partyAging,
        summary: {
          totalOutstanding,
          totalCurrent: buckets[0].amount,
          totalOverdue: sum(buckets.slice(1).map((b) => b.amount)),
          totalCount: items.length,
          overdueCount: items.filter((i) => i.daysOverdue > 0).length,
          averageDaysOverdue:
            items.length > 0
              ? items.reduce((s, i) => s + i.daysOverdue, 0) / items.length
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
        const amountDue = D(bill.totalAmount).minus(D(bill.amountPaid));

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
          bucket.amount = bucket.amount.plus(item.amountDue);
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
            current: D(0),
            days1to30: D(0),
            days31to60: D(0),
            days61to90: D(0),
            over90: D(0),
            total: D(0),
            items: [],
          });
        }

        const partyAging = partyAgingMap.get(item.partyId)!;
        partyAging.items.push(item);
        partyAging.total = partyAging.total.plus(item.amountDue);

        if (item.bucket === "Current") partyAging.current = partyAging.current.plus(item.amountDue);
        else if (item.bucket === "1-30 Days") partyAging.days1to30 = partyAging.days1to30.plus(item.amountDue);
        else if (item.bucket === "31-60 Days") partyAging.days31to60 = partyAging.days31to60.plus(item.amountDue);
        else if (item.bucket === "61-90 Days") partyAging.days61to90 = partyAging.days61to90.plus(item.amountDue);
        else partyAging.over90 = partyAging.over90.plus(item.amountDue);
      });

      const partyAging = Array.from(partyAgingMap.values()).sort(
        (a, b) => b.total.cmp(a.total)
      );

      const totalOutstanding = sum(buckets.map((b) => b.amount));

      return NextResponse.json({
        type: "payables",
        asOfDate: asOfDate.toISOString(),
        buckets: buckets.map((b) => ({
          label: b.label,
          amount: b.amount,
          count: b.count,
          percentage: totalOutstanding.greaterThan(D(0))
            ? toNumber(b.amount.div(totalOutstanding).times(D(100)))
            : 0,
        })),
        partyAging,
        summary: {
          totalOutstanding,
          totalCurrent: buckets[0].amount,
          totalOverdue: sum(buckets.slice(1).map((b) => b.amount)),
          totalCount: items.length,
          overdueCount: items.filter((i) => i.daysOverdue > 0).length,
          averageDaysOverdue:
            items.length > 0
              ? items.reduce((s, i) => s + i.daysOverdue, 0) / items.length
              : 0,
        },
        details: items,
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Error generating aging report");
    return NextResponse.json(
      { error: "Failed to generate aging report" },
      { status: 500 }
    );
  }
});

import type { PrismaClient } from "@/generated/prisma";
import { logger } from "@/backend/utils/logger";
import { daysBetween } from "@/shared/utils/dates.util";

/**
 * Daily overdue sweep — emits Notification rows for invoices the org
 * should chase (customer hasn't paid) and bills the org should pay
 * (we owe the vendor).
 *
 * Designed to be called from an external cron (Vercel Cron, GitHub
 * Actions, etc.) once per day per org. Idempotent: skips creating a
 * row when an equivalent notification (same user, type, entityId)
 * was created within the last 24 hours.
 *
 * The dedup interval is intentionally 24h, not "today" — if the cron
 * runs at 00:30 one day and 01:30 the next, we still want to skip
 * the duplicate. Otherwise an admin gets two pings for the same
 * still-unpaid invoice on the second day.
 *
 * Notification.data:
 *   - kind: "invoice" | "bill"
 *   - entityId: invoice.id or bill.id (used for dedup)
 *   - daysOverdue: derived from now() − dueDate
 *   - amountDue: stringified Decimal
 *   - inboxPath: deep-link target ("/sales/invoices/<id>" or "/purchases/bills/<id>")
 */

export type CheckOverdueResult = {
  organizationId: string;
  scannedInvoices: number;
  scannedBills: number;
  notificationsCreated: number;
  notificationsSkipped: number; // dedup'd against last 24h
  notifiedUserCount: number;
  errors: string[];
};

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function checkOverdue(
  prisma: PrismaClient,
  organizationId: string,
  now: Date = new Date()
): Promise<CheckOverdueResult> {
  const result: CheckOverdueResult = {
    organizationId,
    scannedInvoices: 0,
    scannedBills: 0,
    notificationsCreated: 0,
    notificationsSkipped: 0,
    notifiedUserCount: 0,
    errors: [],
  };

  // Active org users — recipients of all overdue notifications. We
  // notify everyone; the inbox is per-user so noise is bounded.
  // Refining to a "finance only" subset means decoding the role's
  // permissions JSON, which is more complexity than this is worth in
  // v1.
  const orgUsers = await prisma.organizationUser.findMany({
    where: { organizationId, isActive: true },
    select: { userId: true },
  });
  result.notifiedUserCount = orgUsers.length;
  if (orgUsers.length === 0) return result;
  const userIds = orgUsers.map((u) => u.userId);

  // Cutoff for dedup queries.
  const dedupCutoff = new Date(now.getTime() - DEDUP_WINDOW_MS);

  // 1. Overdue invoices (AR side). Customer owes us; flag for chasing.
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      dueDate: { lt: now },
      amountDue: { gt: 0 },
      // Exclude DRAFT (not yet sent) and terminal states.
      status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
    },
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      amountDue: true,
      party: { select: { name: true } },
    },
  });
  result.scannedInvoices = overdueInvoices.length;

  for (const inv of overdueInvoices) {
    const days = daysBetween(inv.dueDate, now);
    for (const userId of userIds) {
      const existing = await findExistingNotification(prisma, {
        userId,
        organizationId,
        entityId: inv.id,
        cutoff: dedupCutoff,
      });
      if (existing) {
        result.notificationsSkipped++;
        continue;
      }
      try {
        await prisma.notification.create({
          data: {
            organizationId,
            userId,
            type: "PAYMENT_DUE",
            title: `Overdue invoice: ${inv.invoiceNumber}`,
            message:
              `${inv.party.name} owes ${inv.amountDue.toString()} on ${inv.invoiceNumber}` +
              ` — ${days} day${days === 1 ? "" : "s"} overdue.`,
            data: {
              kind: "invoice",
              entityId: inv.id,
              daysOverdue: days,
              amountDue: inv.amountDue.toString(),
              inboxPath: `/sales/invoices/${inv.id}`,
            },
          },
        });
        result.notificationsCreated++;
      } catch (e) {
        logger.error({ err: e, invoiceId: inv.id, userId }, "Overdue invoice notification insert failed");
        result.errors.push(`invoice ${inv.invoiceNumber}: ${(e as Error).message}`);
      }
    }
  }

  // 2. Overdue bills (AP side). We owe vendor; flag for payment.
  const overdueBills = await prisma.bill.findMany({
    where: {
      organizationId,
      dueDate: { lt: now },
      amountDue: { gt: 0 },
      status: { notIn: ["DRAFT", "PENDING_APPROVAL", "CANCELLED", "PAID"] },
    },
    select: {
      id: true,
      billNumber: true,
      vendorBillNo: true,
      dueDate: true,
      amountDue: true,
      party: { select: { name: true } },
    },
  });
  result.scannedBills = overdueBills.length;

  for (const bill of overdueBills) {
    const days = daysBetween(bill.dueDate, now);
    for (const userId of userIds) {
      const existing = await findExistingNotification(prisma, {
        userId,
        organizationId,
        entityId: bill.id,
        cutoff: dedupCutoff,
      });
      if (existing) {
        result.notificationsSkipped++;
        continue;
      }
      try {
        await prisma.notification.create({
          data: {
            organizationId,
            userId,
            type: "PAYMENT_DUE",
            title: `Overdue bill: ${bill.billNumber}`,
            message:
              `Owe ${bill.amountDue.toString()} to ${bill.party.name} on ${bill.billNumber}` +
              (bill.vendorBillNo ? ` (vendor #${bill.vendorBillNo})` : "") +
              ` — ${days} day${days === 1 ? "" : "s"} overdue.`,
            data: {
              kind: "bill",
              entityId: bill.id,
              daysOverdue: days,
              amountDue: bill.amountDue.toString(),
              inboxPath: `/purchases/bills/${bill.id}`,
            },
          },
        });
        result.notificationsCreated++;
      } catch (e) {
        logger.error({ err: e, billId: bill.id, userId }, "Overdue bill notification insert failed");
        result.errors.push(`bill ${bill.billNumber}: ${(e as Error).message}`);
      }
    }
  }

  return result;
}

async function findExistingNotification(
  prisma: PrismaClient,
  opts: {
    userId: string;
    organizationId: string;
    entityId: string;
    cutoff: Date;
  }
): Promise<{ id: string } | null> {
  // JSONB path query — Postgres-only. Prisma's `path` filter targets
  // the `data` JSON column; equality matches a string value exactly.
  return prisma.notification.findFirst({
    where: {
      userId: opts.userId,
      organizationId: opts.organizationId,
      type: "PAYMENT_DUE",
      createdAt: { gte: opts.cutoff },
      data: {
        path: ["entityId"],
        equals: opts.entityId,
      },
    },
    select: { id: true },
  });
}

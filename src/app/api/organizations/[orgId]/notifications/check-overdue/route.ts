import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, hasPermission, forbidden } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { checkOverdue } from "@/backend/services/notifications/check-overdue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/notifications/check-overdue
 *
 * Sweeps the org's invoices + bills for overdue items and emits
 * Notification rows to every active member. Designed to be called
 * once per day per org by an external cron (Vercel Cron, GitHub
 * Actions). The returned counts let the cron operator monitor
 * whether the sweep is doing work.
 *
 * Idempotent: notifications dedup against the last 24 hours per
 * (user, entityId) so re-running doesn't double-ping.
 *
 * Permission: settings:read — admins / org-managers can trigger
 * the sweep manually if needed. The cron service hits the same
 * endpoint via a service-account session.
 */
export const POST = withOrgAuth(async (_request, { orgId, orgUser }) => {
  if (!hasPermission(orgUser, "settings", "read")) {
    return forbidden("You don't have permission to trigger overdue notifications");
  }
  try {
    const result = await checkOverdue(prisma, orgId);
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error, orgId }, "checkOverdue failed");
    return NextResponse.json(
      { error: "Overdue check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
});

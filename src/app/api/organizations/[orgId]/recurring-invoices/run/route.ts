import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, forbidden, hasPermission } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { runRecurringForOrg } from "@/backend/services/billing/run-recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/recurring-invoices/run
 *
 * Manual tick: finds every active recurring template whose nextRunDate is
 * on/before now (and not past endDate), spawns one invoice per template,
 * and advances nextRunDate by the frequency.
 *
 * One invoice per call per template — if a subscription is several cycles
 * behind, each tick catches up by one cycle. The UI surfaces
 * `missedRunDates` so the user knows when they're behind.
 *
 * Cross-org cron lives at /api/cron/run-recurring and calls the same
 * underlying helper.
 */
export const POST = withOrgAuth(async (_request, { orgId, orgUser }) => {
  if (!hasPermission(orgUser, "invoices", "create")) {
    return forbidden(
      "You don't have permission to spawn invoices from recurring templates"
    );
  }
  try {
    const summary = await runRecurringForOrg(prisma, orgId, new Date());
    return NextResponse.json(summary);
  } catch (error) {
    logger.error({ err: error, orgId }, "Recurring run failed");
    return NextResponse.json(
      { error: "Recurring run failed", message: (error as Error).message },
      { status: 500 }
    );
  }
});

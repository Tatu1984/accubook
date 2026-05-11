import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { logger } from "@/backend/utils/logger";
import { requireCronSecret } from "@/backend/utils/cron-auth";
import { runRecurringForOrg } from "@/backend/services/billing/run-recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/run-recurring
 *
 * Cross-org cron sweep — invoked by an external scheduler with a Bearer
 * CRON_SECRET header. Iterates every active organization and runs the
 * per-org recurring-invoice tick.
 *
 * Designed for Vercel Cron (see `vercel.json`). The per-org route at
 * `/api/organizations/[orgId]/recurring-invoices/run` is still available
 * for manual / admin-driven ticks via the regular session+permission flow.
 *
 * Recurring run is idempotent on a per-cycle basis: each template advances
 * its `nextRunDate` inside the same transaction that spawns the invoice,
 * so a stuck cron that retries within the same minute will see the
 * advanced state and skip.
 */
export const POST = async (request: NextRequest) => {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const ranAt = new Date();
  try {
    const orgs = await prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const summaries = [];
    let totalSpawned = 0;
    let totalErrors = 0;
    for (const org of orgs) {
      try {
        const r = await runRecurringForOrg(prisma, org.id, ranAt);
        totalSpawned += r.spawned;
        totalErrors += r.errors.length;
        summaries.push({ orgId: org.id, orgName: org.name, ...r });
      } catch (e) {
        logger.error({ err: e, orgId: org.id }, "runRecurring failed for org");
        totalErrors++;
        summaries.push({
          orgId: org.id,
          orgName: org.name,
          error: (e as Error).message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      ranAt: ranAt.toISOString(),
      orgsScanned: orgs.length,
      totalSpawned,
      totalErrors,
      summaries,
    });
  } catch (error) {
    logger.error({ err: error }, "cron/run-recurring failed");
    return NextResponse.json(
      { error: "cron sweep failed", message: (error as Error).message },
      { status: 500 }
    );
  }
};

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { logger } from "@/backend/utils/logger";
import { requireCronSecret } from "@/backend/utils/cron-auth";
import { checkOverdue } from "@/backend/services/notifications/check-overdue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/check-overdue
 *
 * Cross-org cron sweep — invoked by an external scheduler with a
 * Bearer `CRON_SECRET` header. Iterates every active organization
 * and runs the per-org overdue notification emitter. Idempotent (the
 * emitter has 24h dedup).
 *
 * Returns a per-org summary of what happened. Designed for Vercel
 * Cron (`vercel.json` cron block) or GitHub Actions / external
 * scheduler — those services sign requests with the shared secret
 * instead of a session cookie.
 *
 * The per-org route at `/api/organizations/[orgId]/notifications/
 * check-overdue` is still available for manual / admin-driven sweep
 * via the regular session+permission flow.
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
    for (const org of orgs) {
      try {
        const r = await checkOverdue(prisma, org.id, ranAt);
        summaries.push({ orgId: org.id, orgName: org.name, ...r });
      } catch (e) {
        logger.error({ err: e, orgId: org.id }, "checkOverdue failed for org");
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
      summaries,
    });
  } catch (error) {
    logger.error({ err: error }, "cron/check-overdue failed");
    return NextResponse.json(
      { error: "cron sweep failed", message: (error as Error).message },
      { status: 500 }
    );
  }
};

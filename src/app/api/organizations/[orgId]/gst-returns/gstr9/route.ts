import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { computeGstr9, fyFromLabel } from "@/backend/services/gst/gstr9";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  fy: z.string().regex(/^\d{4}-\d{2}$/, 'fy must be in form "YYYY-YY"'),
});

/**
 * GET /api/organizations/[orgId]/gst-returns/gstr9?fy=2026-27
 *
 * Annual return for the given fiscal year. Returns sections 4 (outward
 * + RCM-inward), 5 (non-payable), 6 (ITC availed), 7 (ITC reversed +
 * net), 9 (tax payable / paid through ITC / paid in cash).
 */
export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      fy: searchParams.get("fy"),
    });
    if (!parsed.success) return badRequest("Invalid query parameters", parsed.error.issues);

    const fy = fyFromLabel(parsed.data.fy);
    const result = await computeGstr9(prisma, orgId, fy);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid FY label")) {
      return badRequest(error.message);
    }
    logger.error({ err: error }, "Error computing GSTR-9");
    return NextResponse.json({ error: "Failed to compute GSTR-9" }, { status: 500 });
  }
});

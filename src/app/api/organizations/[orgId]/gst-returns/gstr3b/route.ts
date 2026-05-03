import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { computeGstr3b, summarizeGstr3b } from "@/backend/services/gst/gstr3b";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
});

/**
 * GET /api/organizations/[orgId]/gst-returns/gstr3b?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns the GSTR-3B summary computation + a summary block (output tax,
 * net ITC, net payable) for the dashboard.
 */
export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    if (!parsed.success) {
      return badRequest("Invalid query parameters", parsed.error.issues);
    }

    const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.data.to}T23:59:59.999Z`);
    if (from > to) return badRequest("`from` must be on or before `to`");

    const result = await computeGstr3b(prisma, orgId, { from, to });
    const summary = summarizeGstr3b(result);

    return NextResponse.json({ ...result, summary });
  } catch (error) {
    logger.error({ err: error }, "Error computing GSTR-3B");
    return NextResponse.json({ error: "Failed to compute GSTR-3B" }, { status: 500 });
  }
});

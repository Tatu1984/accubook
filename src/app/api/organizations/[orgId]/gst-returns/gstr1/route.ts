import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { computeGstr1, summarizeGstr1 } from "@/backend/services/gst/gstr1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/organizations/[orgId]/gst-returns/gstr1?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns the GSTR-1 (outward supplies) computation for the period —
 * sections B2B, B2CS, HSN, DOCS — plus a summary block. Portal-format
 * JSON conversion is a separate endpoint.
 */
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
});

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

    const result = await computeGstr1(prisma, orgId, { from, to });
    const summary = summarizeGstr1(result);

    return NextResponse.json({ ...result, summary });
  } catch (error) {
    logger.error({ err: error }, "Error computing GSTR-1");
    return NextResponse.json({ error: "Failed to compute GSTR-1" }, { status: 500 });
  }
});

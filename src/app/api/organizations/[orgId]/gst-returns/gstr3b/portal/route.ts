import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { computeGstr3b } from "@/backend/services/gst/gstr3b";
import { gstr3bToPortalJson } from "@/backend/services/gst/gstr3b-portal";
import {
  monthlyPortalFilename,
  requireOrgGstin,
  respondPortalJson,
} from "@/backend/services/gst/portal-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
  download: z.enum(["true", "false"]).optional(),
});

/**
 * GET /api/organizations/[orgId]/gst-returns/gstr3b/portal?from=...&to=...&download=true
 *
 * Returns the GSTR-3B in GSTN portal upload JSON format. Org GSTIN
 * required (Settings → Organization). With download=true, the response
 * is served as `GSTR3B_<gstin>_<MMYYYY>.json`.
 */
export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      download: searchParams.get("download") ?? undefined,
    });
    if (!parsed.success) {
      return badRequest("Invalid query parameters", parsed.error.issues);
    }

    const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.data.to}T23:59:59.999Z`);
    if (from > to) return badRequest("`from` must be on or before `to`");

    const gstin = await requireOrgGstin(orgId);
    if (!gstin.ok) return gstin.response;

    const result = await computeGstr3b(prisma, orgId, { from, to });
    const payload = gstr3bToPortalJson(result, {
      gstin: gstin.gstin,
      periodStart: from,
    });

    return respondPortalJson(payload, {
      wantsDownload: parsed.data.download === "true",
      filename: monthlyPortalFilename("GSTR3B", gstin.gstin, from),
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating GSTR-3B portal JSON");
    return NextResponse.json(
      { error: "Failed to generate GSTR-3B portal JSON" },
      { status: 500 }
    );
  }
});

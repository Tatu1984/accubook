import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { computeGstr1 } from "@/backend/services/gst/gstr1";
import { gstr1ToPortalJson } from "@/backend/services/gst/gstr1-portal";
import {
  monthlyPortalFilename,
  requireOrgGstin,
  respondPortalJson,
} from "@/backend/services/gst/portal-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/organizations/[orgId]/gst-returns/gstr1/portal?from=...&to=...&download=true
 *
 * Returns the GSTR-1 in GSTN portal upload JSON format. The org must
 * have a GSTIN configured (Organization.gstNo). With download=true the
 * response is served as `GSTR1_<gstin>_<MMYYYY>.json`.
 */
const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
  download: z.enum(["true", "false"]).optional(),
});

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

    const result = await computeGstr1(prisma, orgId, { from, to });
    const payload = gstr1ToPortalJson(result, {
      gstin: gstin.gstin,
      periodStart: from,
    });

    return respondPortalJson(payload, {
      wantsDownload: parsed.data.download === "true",
      filename: monthlyPortalFilename("GSTR1", gstin.gstin, from),
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating GSTR-1 portal JSON");
    return NextResponse.json(
      { error: "Failed to generate GSTR-1 portal JSON" },
      { status: 500 }
    );
  }
});

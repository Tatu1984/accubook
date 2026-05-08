import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { computeGstr9, fyFromLabel } from "@/backend/services/gst/gstr9";
import {
  gstr9ToPortalJson,
  gstr9PortalFilename,
} from "@/backend/services/gst/gstr9-portal";
import {
  requireOrgGstin,
  respondPortalJson,
} from "@/backend/services/gst/portal-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  fy: z.string().regex(/^\d{4}-\d{2}$/, 'fy must be in form "YYYY-YY"'),
  download: z.enum(["true", "false"]).optional(),
  /**
   * Aggregate turnover of the preceding FY (the GSTN portal asks for
   * this at filing time). Optional — when omitted we emit `gt: 0` and
   * the user fills it in on the portal before submitting.
   */
  precedingFyTurnover: z.string().optional(),
});

/**
 * GET /api/organizations/[orgId]/gst-returns/gstr9/portal?fy=2025-26&download=true
 *
 * Returns the GSTR-9 in GSTN portal upload JSON format. Mirrors the
 * GSTR-1 / GSTR-3B portal endpoints. Org GSTIN required. With
 * download=true, served as `GSTR9_<gstin>_<FY>.json`.
 */
export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      fy: searchParams.get("fy"),
      download: searchParams.get("download") ?? undefined,
      precedingFyTurnover: searchParams.get("precedingFyTurnover") ?? undefined,
    });
    if (!parsed.success) return badRequest("Invalid query parameters", parsed.error.issues);

    const gstin = await requireOrgGstin(orgId);
    if (!gstin.ok) return gstin.response;

    const fy = fyFromLabel(parsed.data.fy);
    const result = await computeGstr9(prisma, orgId, fy);

    const precedingFyTurnover = parsed.data.precedingFyTurnover
      ? Number(parsed.data.precedingFyTurnover)
      : undefined;
    const payload = gstr9ToPortalJson(result, {
      gstin: gstin.gstin,
      precedingFyTurnover: Number.isFinite(precedingFyTurnover)
        ? precedingFyTurnover
        : undefined,
    });

    return respondPortalJson(payload, {
      wantsDownload: parsed.data.download === "true",
      filename: gstr9PortalFilename(gstin.gstin, fy.label),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid FY label")) {
      return badRequest(error.message);
    }
    logger.error({ err: error }, "Error generating GSTR-9 portal JSON");
    return NextResponse.json(
      { error: "Failed to generate GSTR-9 portal JSON" },
      { status: 500 }
    );
  }
});

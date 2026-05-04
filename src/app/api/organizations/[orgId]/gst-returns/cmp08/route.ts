import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { computeCmp08 } from "@/backend/services/gst/cmp08";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  fy: z.string().regex(/^\d{4}-\d{2}$/, 'fy must be in form "YYYY-YY"'),
  quarter: z
    .string()
    .regex(/^[1-4]$/, "quarter must be 1, 2, 3, or 4")
    .transform((v) => Number(v) as 1 | 2 | 3 | 4),
});

/**
 * GET /api/organizations/[orgId]/gst-returns/cmp08?fy=2025-26&quarter=1
 *
 * Quarterly CMP-08 statement for composition-scheme suppliers. Returns
 * the cells the user enters into the GSTN portal (we don't auto-file —
 * GSTN has no direct API for CMP-08 yet).
 *
 * Refuses if the org isn't on composition (the regular taxpayer files
 * GSTR-1 + 3B + GSTR-3B; CMP-08 is meaningless for them).
 */
export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      fy: searchParams.get("fy"),
      quarter: searchParams.get("quarter"),
    });
    if (!parsed.success) return badRequest("Invalid query parameters", parsed.error.issues);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { compositionScheme: true, compositionRate: true },
    });
    if (!org?.compositionScheme) {
      return badRequest(
        "Organization is not on the composition scheme. Enable it in Settings → Organization first."
      );
    }
    if (!org.compositionRate) {
      return badRequest(
        "Organization is on composition scheme but compositionRate is not set. Configure it in Settings."
      );
    }

    const result = await computeCmp08(prisma, orgId, {
      fyLabel: parsed.data.fy,
      quarter: parsed.data.quarter,
      rate: org.compositionRate,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid FY label")) {
      return badRequest(error.message);
    }
    logger.error({ err: error }, "Error computing CMP-08");
    return NextResponse.json({ error: "Failed to compute CMP-08" }, { status: 500 });
  }
});

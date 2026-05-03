import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { computePartyStatement } from "@/backend/services/reports/registers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  partyId: z.string().min(1, "partyId is required"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * GET /api/organizations/[orgId]/reports/party-statement?partyId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Statement of account for a single party. Combines invoices/receipts
 * (customer side) and bills/payments (vendor side) for BOTH-typed parties.
 * Computes opening + closing balance + running balance per row.
 */
export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      partyId: searchParams.get("partyId"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    if (!parsed.success) return badRequest("Invalid query parameters", parsed.error.issues);

    const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.data.to}T23:59:59.999Z`);
    if (from > to) return badRequest("`from` must be on or before `to`");

    try {
      const result = await computePartyStatement(prisma, orgId, parsed.data.partyId, { from, to });
      return NextResponse.json(result);
    } catch (e) {
      if (e instanceof Error && e.message === "Party not found in organization") {
        return notFound("Party not found");
      }
      throw e;
    }
  } catch (error) {
    logger.error({ err: error }, "Error computing party statement");
    return NextResponse.json({ error: "Failed to compute party statement" }, { status: 500 });
  }
});

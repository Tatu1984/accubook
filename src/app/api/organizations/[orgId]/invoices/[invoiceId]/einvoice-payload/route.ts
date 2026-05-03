import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { buildEInvoicePayload, EInvoiceValidationError } from "@/backend/services/gst/einvoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/organizations/[orgId]/invoices/[invoiceId]/einvoice-payload
 *
 * Returns the NIC e-invoice payload for the given invoice. Use this to:
 *   1. Preview what will be sent to the NIC API.
 *   2. Validate before submission — any field issues come back as 400 with
 *      a list of errors instead of cryptic NIC codes after submission.
 *
 * The actual NIC API call is a separate concern (needs auth tokens). This
 * endpoint is the source of truth for the payload shape.
 */
export const GET = withOrgAuth<{ invoiceId: string }>(async (_request, { orgId, params }) => {
  try {
    const { invoiceId } = params;
    const payload = await buildEInvoicePayload(prisma, {
      invoiceId,
      organizationId: orgId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof EInvoiceValidationError) {
      // Pre-flight failure — list every issue so the caller can fix in one round-trip.
      if (error.details.length === 1 && error.details[0] === "Invoice not found") {
        return notFound("Invoice not found");
      }
      return badRequest("E-invoice payload invalid", error.details);
    }
    logger.error({ err: error }, "Error building e-invoice payload");
    return NextResponse.json({ error: "Failed to build e-invoice payload" }, { status: 500 });
  }
});

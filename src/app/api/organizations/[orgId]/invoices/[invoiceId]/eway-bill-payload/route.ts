import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import {
  buildEwayBillPayload,
  EwayBillValidationError,
  type EwbSubSupplyType,
  type EwbTransMode,
  type EwbTransactionType,
  type EwbVehicleType,
} from "@/backend/services/gst/eway-bill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const transportSchema = z.object({
  transMode: z.enum(["1", "2", "3", "4"]).optional(),
  transDistance: z.number().int().min(0).max(4000),
  transporterId: z.string().optional(),
  transporterName: z.string().optional(),
  vehicleNo: z.string().optional(),
  vehicleType: z.enum(["R", "O"]).optional(),
  transDocNo: z.string().optional(),
  transDocDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/).optional(),
  subSupplyType: z.number().int().min(1).max(11).optional(),
  transactionType: z.number().int().min(1).max(4).optional(),
});

/**
 * POST /api/organizations/[orgId]/invoices/[invoiceId]/eway-bill-payload
 *
 * Body: TransportDetails (transDistance required; vehicleNo or transporterId
 * required for road transport).
 *
 * Returns the NIC EWB API payload. Validates threshold (≥ ₹50k taxable),
 * required org/buyer addresses, HSN codes per line. Validation failures
 * come back as 400 with details listed.
 */
export const POST = withOrgAuth<{ invoiceId: string }>(async (request, { orgId, params }) => {
  try {
    const body = await request.json();
    const parsed = transportSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Invalid transport details", parsed.error.issues);
    }

    const payload = await buildEwayBillPayload(prisma, {
      invoiceId: params.invoiceId,
      organizationId: orgId,
      transport: {
        transMode: parsed.data.transMode as EwbTransMode | undefined,
        transDistance: parsed.data.transDistance,
        transporterId: parsed.data.transporterId,
        transporterName: parsed.data.transporterName,
        vehicleNo: parsed.data.vehicleNo,
        vehicleType: parsed.data.vehicleType as EwbVehicleType | undefined,
        transDocNo: parsed.data.transDocNo,
        transDocDate: parsed.data.transDocDate,
        subSupplyType: parsed.data.subSupplyType as EwbSubSupplyType | undefined,
        transactionType: parsed.data.transactionType as EwbTransactionType | undefined,
      },
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof EwayBillValidationError) {
      if (error.details.length === 1 && error.details[0] === "Invoice not found") {
        return notFound("Invoice not found");
      }
      return badRequest("E-way bill payload invalid", error.details);
    }
    logger.error({ err: error }, "Error building e-way bill payload");
    return NextResponse.json(
      { error: "Failed to build e-way bill payload" },
      { status: 500 }
    );
  }
});

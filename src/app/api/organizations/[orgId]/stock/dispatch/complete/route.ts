import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import {
  completeInvoiceDispatch,
  planInvoiceDispatch,
  DispatchError,
} from "@/backend/services/inventory/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/stock/dispatch/complete
 *
 * The warehouse marking a whole invoice as gone. `preview: true` returns the
 * allocation — which warehouse each item would leave from, and anything the
 * shelves cannot cover — without writing, so the confirm screen shows exactly
 * what the write will do rather than a second guess at it.
 */

const completeSchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required"),
  /** Ship from here where it can cover the line; otherwise stock is found. */
  warehouseId: optional(z.string()),
  preview: optional(z.boolean()),
  date: optional(z.string()),
  narration: optional(z.string().max(500)),
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const body = await request.json();
    const data = completeSchema.parse(body);

    const dispatchDate = data.date ? new Date(data.date) : undefined;
    if (dispatchDate && Number.isNaN(dispatchDate.getTime())) {
      return badRequest("Invalid dispatch date");
    }

    if (data.preview) {
      const plan = await planInvoiceDispatch(
        orgId,
        data.invoiceId,
        data.warehouseId
      );
      return NextResponse.json({ ok: true, plan });
    }

    const result = await completeInvoiceDispatch(orgId, userId, {
      invoiceId: data.invoiceId,
      warehouseId: data.warehouseId,
      date: dispatchDate,
      narration: data.narration,
    });

    return NextResponse.json(
      {
        ok: true,
        completed: true,
        invoice: result.plan.invoiceNumber,
        dispatched: result.lines.length,
        units: result.units,
        lines: result.lines,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (error instanceof DispatchError) {
      return badRequest(error.message);
    }
    logger.error({ err: error }, "Error completing invoice dispatch");
    return NextResponse.json(
      { error: "Failed to complete this invoice" },
      { status: 500 }
    );
  }
});

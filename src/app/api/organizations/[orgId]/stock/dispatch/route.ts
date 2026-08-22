import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { postDispatch, DispatchError } from "@/backend/services/inventory/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/stock/dispatch
 *
 * The warehouse confirming that goods have physically left. All of the work,
 * and everything worth testing about it, lives in the dispatch service — this
 * handler is authentication, shape validation and error translation.
 */

const dispatchSchema = z.object({
  lines: z
    .array(
      z.object({
        invoiceId: z.string().min(1, "Invoice is required"),
        itemId: z.string().min(1, "Item is required"),
        warehouseId: z.string().min(1, "Source warehouse is required"),
        quantity: z.number().positive("Quantity must be greater than zero"),
      })
    )
    .min(1, "At least one line is required"),
  date: optional(z.string()),
  narration: optional(z.string().max(500)),
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const body = await request.json();
    const data = dispatchSchema.parse(body);

    const dispatchDate = data.date ? new Date(data.date) : undefined;
    if (dispatchDate && Number.isNaN(dispatchDate.getTime())) {
      return badRequest("Invalid dispatch date");
    }

    const result = await postDispatch(orgId, userId, {
      lines: data.lines,
      date: dispatchDate,
      narration: data.narration,
    });

    return NextResponse.json(
      {
        ok: true,
        dispatched: result.lines.length,
        units: result.units,
        invoices: result.invoiceNumbers,
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
    logger.error({ err: error }, "Error posting stock dispatch");
    return NextResponse.json(
      { error: "Failed to post dispatch" },
      { status: 500 }
    );
  }
});

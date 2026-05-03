import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest, forbidden, hasPermission } from "@/backend/utils/with-org-auth";
import { applyLedgerEntries } from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateVoucherSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  narration: z.string().optional(),
  date: z.string().optional(),
}).strict();

export const GET = withOrgAuth<{ voucherId: string }>(async (_request, { orgId, params }) => {
  try {
    const { voucherId } = params;

    const voucher = await prisma.voucher.findFirst({
      where: { id: voucherId, organizationId: orgId },
      include: {
        voucherType: true,
        fiscalYear: true,
        branch: true,
        entries: {
          include: { ledger: { include: { group: true } } },
          orderBy: { createdAt: "asc" },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!voucher) return notFound("Voucher not found");
    return NextResponse.json(voucher);
  } catch (error) {
    logger.error({ err: error }, "Error fetching voucher");
    return NextResponse.json({ error: "Failed to fetch voucher" }, { status: 500 });
  }
});

/**
 * Voucher PATCH semantics:
 *
 *   DRAFT | PENDING_APPROVAL → APPROVED
 *     - apply ledger balance impact
 *     - set isPosted=true, postedAt=now, approvedBy/approvedAt
 *     - requires `vouchers:approve` permission
 *
 *   APPROVED → DRAFT | REJECTED | CANCELLED
 *     - REVERSE ledger balance impact (post the negative of every entry)
 *     - set isPosted=false, postedAt=null
 *     - requires `vouchers:approve` permission (you're undoing accounting)
 *
 *   Same-state edits (narration, date)
 *     - allowed only when isPosted=false. To edit a posted voucher you must
 *       first unpost it (DRAFT) so the books can be restated cleanly.
 */
export const PATCH = withOrgAuth<{ voucherId: string }>(async (request, { orgId, params, orgUser, userId }) => {
  try {
    const { voucherId } = params;
    const validatedData = updateVoucherSchema.parse(await request.json());

    const existing = await prisma.voucher.findFirst({
      where: { id: voucherId, organizationId: orgId },
      include: {
        entries: {
          select: { ledgerId: true, debitAmount: true, creditAmount: true },
        },
      },
    });
    if (!existing) return notFound("Voucher not found");

    const isCurrentlyApproved = existing.status === "APPROVED";
    const willApprove =
      validatedData.status === "APPROVED" && !isCurrentlyApproved;
    const willUnpost =
      isCurrentlyApproved &&
      validatedData.status !== undefined &&
      validatedData.status !== "APPROVED";
    const isStatusChange = willApprove || willUnpost;

    if (isStatusChange && !hasPermission(orgUser, "vouchers", "approve")) {
      return forbidden("You don't have permission to approve or unpost vouchers");
    }

    // Refuse to edit narration/date on a posted voucher without unposting it.
    const wantsContentEdit =
      (validatedData.narration !== undefined || validatedData.date !== undefined) &&
      !isStatusChange;
    if (wantsContentEdit && existing.isPosted) {
      return badRequest(
        "Cannot edit a posted voucher. Move it back to DRAFT first."
      );
    }

    const voucher = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};

      if (validatedData.status) updateData.status = validatedData.status;
      if (validatedData.narration !== undefined) updateData.narration = validatedData.narration;
      if (validatedData.date) updateData.date = new Date(validatedData.date);

      if (willApprove) {
        // Forward post: apply each entry's balance impact.
        await applyLedgerEntries(tx, existing.entries);
        updateData.isPosted = true;
        updateData.postedAt = new Date();
        updateData.approvedById = userId;
        updateData.approvedAt = new Date();
      }

      if (willUnpost) {
        // Reverse post: swap debit ↔ credit on every entry to undo the impact.
        const reversed = existing.entries.map((e) => ({
          ledgerId: e.ledgerId,
          debitAmount: e.creditAmount,
          creditAmount: e.debitAmount,
        }));
        await applyLedgerEntries(tx, reversed);
        updateData.isPosted = false;
        updateData.postedAt = null;
      }

      const updated = await tx.voucher.update({
        where: { id: voucherId },
        data: updateData,
        include: {
          voucherType: true,
          entries: { include: { ledger: true } },
        },
      });

      // Audit: distinguish posting / reversing from a routine field edit.
      const action = willApprove ? "POST" : willUnpost ? "REVERSE" : "UPDATE";
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action,
        entityType: "Voucher",
        entityId: voucherId,
        oldData: {
          status: existing.status,
          isPosted: existing.isPosted,
        },
        newData: {
          status: updated.status,
          isPosted: updated.isPosted,
          ...(validatedData.narration !== undefined ? { narration: updated.narration } : {}),
          ...(validatedData.date ? { date: updated.date.toISOString() } : {}),
        },
      });

      return updated;
    });

    return NextResponse.json(voucher);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating voucher");
    return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 });
  }
});

/**
 * DELETE only allowed on DRAFT vouchers (never posted, no ledger impact).
 * Posted vouchers must be moved to CANCELLED via PATCH first — that path
 * reverses the ledger entries cleanly.
 */
export const DELETE = withOrgAuth<{ voucherId: string }>(async (_request, { orgId, params }) => {
  try {
    const { voucherId } = params;

    const voucher = await prisma.voucher.findFirst({
      where: { id: voucherId, organizationId: orgId },
      select: { id: true, status: true, isPosted: true },
    });
    if (!voucher) return notFound("Voucher not found");

    if (voucher.isPosted || voucher.status === "APPROVED") {
      return badRequest(
        "Cannot delete a posted voucher. Move it to DRAFT or CANCELLED first."
      );
    }

    await prisma.$transaction([
      prisma.voucherEntry.deleteMany({ where: { voucherId } }),
      prisma.voucher.delete({ where: { id: voucherId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting voucher");
    return NextResponse.json({ error: "Failed to delete voucher" }, { status: 500 });
  }
});

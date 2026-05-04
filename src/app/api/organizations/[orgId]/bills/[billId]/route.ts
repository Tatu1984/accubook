import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound, hasPermission, forbidden } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D } from "@/backend/utils/money";
import { applyLedgerEntries } from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";
import { postBillToGl } from "@/backend/services/billing/post-bill";
import type { TdsSectionCode } from "@/backend/services/tax/tds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateBillSchema = z.object({
  status: z.enum([
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "PARTIAL",
    "PAID",
    "OVERDUE",
    "CANCELLED",
  ]).optional(),
  notes: z.string().nullable().optional(),
  vendorBillNo: z.string().nullable().optional(),
}).strict();

/**
 * PATCH a bill — primarily for status transitions. Mirrors the voucher
 * PATCH reversal pattern (vouchers/[voucherId]/route.ts):
 *
 *   DRAFT | PENDING_APPROVAL → APPROVED
 *     → posts the bill to GL (Dr Expense + GST Input / Cr Vendor + ...)
 *     → only allowed when caller has bills:approve.
 *
 *   APPROVED → CANCELLED
 *     → reverses the posting voucher (swap debit↔credit on every entry)
 *     → marks the linked Voucher.status=CANCELLED, isPosted=false
 *     → keeps Bill.voucherId set so the audit chain survives
 *     → only allowed when no payments reference the bill (cash already
 *       gone is unrecoverable here).
 *
 *   APPROVED → DRAFT
 *     Same shape as CANCELLED but the bill goes back to editable. Used
 *     to restate a posted bill cleanly.
 *
 *   Other transitions (DRAFT ↔ PENDING_APPROVAL, etc.) are simple
 *   status updates with no GL impact.
 *
 * notes / vendorBillNo are editable in any state EXCEPT APPROVED/PAID/
 * PARTIAL/OVERDUE — those are locked because the voucher narration
 * references the vendor bill number; editing it would desync the
 * audit trail.
 */
export const PATCH = withOrgAuth<{ billId: string }>(async (request, { orgId, params, orgUser, userId }) => {
  try {
    const { billId } = params;
    const validated = updateBillSchema.parse(await request.json());

    const existing = await prisma.bill.findFirst({
      where: { id: billId, organizationId: orgId },
      include: {
        voucher: {
          include: {
            entries: {
              select: { ledgerId: true, debitAmount: true, creditAmount: true },
            },
          },
        },
        _count: { select: { payments: true } },
      },
    });
    if (!existing) return notFound("Bill not found");

    const wasApproved = existing.status === "APPROVED";
    const willApprove =
      validated.status === "APPROVED" && !wasApproved;
    const willReverse =
      wasApproved &&
      validated.status !== undefined &&
      validated.status !== "APPROVED" &&
      validated.status !== "PARTIAL" &&
      validated.status !== "PAID" &&
      validated.status !== "OVERDUE";
    const isStatusChange = willApprove || willReverse || (validated.status && validated.status !== existing.status);

    if ((willApprove || willReverse) && !hasPermission(orgUser, "bills", "approve")) {
      return forbidden("You don't have permission to approve or reverse bills");
    }

    if (willReverse && existing._count.payments > 0) {
      return badRequest(
        "Cannot reverse a bill that has payments recorded against it. Cancel the payments first."
      );
    }

    if (
      (validated.notes !== undefined || validated.vendorBillNo !== undefined) &&
      !isStatusChange &&
      (existing.status === "APPROVED" || existing.status === "PAID" ||
        existing.status === "PARTIAL" || existing.status === "OVERDUE")
    ) {
      return badRequest(
        `Cannot edit notes or vendor bill # while bill is in ${existing.status}. Move it back to DRAFT first.`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (validated.status) updateData.status = validated.status;
      if (validated.notes !== undefined) updateData.notes = validated.notes;
      if (validated.vendorBillNo !== undefined) updateData.vendorBillNo = validated.vendorBillNo;

      let action: "UPDATE" | "POST" | "REVERSE" = "UPDATE";

      if (willApprove) {
        // Forward post: route through postBillToGl if not yet posted.
        // If voucherId is already set (e.g. promoted earlier then sent
        // back to DRAFT but the voucher row still exists), this branch
        // would re-post; postBillToGl will refuse, which is correct.
        if (!existing.voucherId) {
          await postBillToGl(tx, {
            billId,
            organizationId: orgId,
            userId,
            tds: existing.tdsSection
              ? { section: existing.tdsSection as TdsSectionCode }
              : undefined,
          });
          action = "POST";
        } else if (existing.voucher && !existing.voucher.isPosted) {
          // Voucher exists but was previously reversed — re-apply the
          // ledger entries (forward post). Mirrors the voucher PATCH
          // forward-post path.
          await applyLedgerEntries(tx, existing.voucher.entries);
          await tx.voucher.update({
            where: { id: existing.voucher.id },
            data: {
              status: "APPROVED",
              isPosted: true,
              postedAt: new Date(),
              approvedById: userId,
              approvedAt: new Date(),
            },
          });
          action = "POST";
        }
      }

      if (willReverse) {
        if (existing.voucher && existing.voucher.isPosted) {
          // Reverse: swap Dr↔Cr on every entry to undo the impact.
          const reversed = existing.voucher.entries.map((e) => ({
            ledgerId: e.ledgerId,
            debitAmount: D(e.creditAmount),
            creditAmount: D(e.debitAmount),
          }));
          await applyLedgerEntries(tx, reversed);
          await tx.voucher.update({
            where: { id: existing.voucher.id },
            data: {
              status: validated.status === "CANCELLED" ? "CANCELLED" : "DRAFT",
              isPosted: false,
              postedAt: null,
            },
          });
          action = "REVERSE";
        }
      }

      const updated = await tx.bill.update({
        where: { id: billId },
        data: updateData,
        include: { party: true, items: { include: { item: true } } },
      });

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action,
        entityType: "Bill",
        entityId: billId,
        oldData: { status: existing.status, voucherId: existing.voucherId },
        newData: {
          status: updated.status,
          notes: updated.notes,
          vendorBillNo: updated.vendorBillNo,
          ...(action === "REVERSE" ? { reversedVoucherId: existing.voucherId } : {}),
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error patching bill");
    return NextResponse.json({ error: "Failed to update bill" }, { status: 500 });
  }
});

/**
 * DELETE a bill. Safety policy:
 *   - Refuse if any payment references this bill (would orphan payment rows
 *     and corrupt vendor AP balances). Caller must move the bill to
 *     CANCELLED (manual reversal) or void the payments first.
 *   - Refuse on PAID / PARTIAL / OVERDUE statuses for the same reason.
 *   - Refuse if Bill.voucherId is set — the linked voucher would orphan.
 *     Caller must PATCH to CANCELLED first (which reverses the voucher
 *     cleanly) before delete is allowed.
 *   - DRAFT, PENDING_APPROVAL, CANCELLED bills with no payments and no
 *     voucherId: hard delete OK.
 */
export const DELETE = withOrgAuth<{ billId: string }>(async (_request, { orgId, params }) => {
  try {
    const { billId } = params;

    const bill = await prisma.bill.findFirst({
      where: { id: billId, organizationId: orgId },
      select: {
        id: true,
        status: true,
        voucherId: true,
        _count: { select: { payments: true } },
      },
    });
    if (!bill) return notFound("Bill not found");

    if (bill._count.payments > 0) {
      return badRequest(
        "Cannot delete a bill that has payments recorded against it. Cancel the payments first."
      );
    }

    if (bill.voucherId) {
      return badRequest(
        "Cannot delete a bill that has been posted to GL. Move it to CANCELLED first (the voucher gets reversed cleanly)."
      );
    }

    if (bill.status === "APPROVED" || bill.status === "PAID" || bill.status === "PARTIAL" || bill.status === "OVERDUE") {
      return badRequest(
        `Cannot delete a bill in status ${bill.status}. Move it to CANCELLED first so the books are reversed cleanly.`
      );
    }

    await prisma.$transaction([
      prisma.billItem.deleteMany({ where: { billId } }),
      prisma.bill.delete({ where: { id: billId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting bill");
    return NextResponse.json({ error: "Failed to delete bill" }, { status: 500 });
  }
});

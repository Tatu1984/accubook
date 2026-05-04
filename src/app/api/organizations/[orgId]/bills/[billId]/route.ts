import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE a bill. Safety policy:
 *   - Refuse if any payment references this bill (would orphan payment rows
 *     and corrupt vendor AP balances). Caller must move the bill to
 *     CANCELLED (manual reversal) or void the payments first.
 *   - Refuse on PAID / PARTIAL / OVERDUE statuses for the same reason.
 *   - APPROVED bills with no payments yet: refuse — caller should cancel
 *     via the (future) PATCH endpoint so the GL gets reversed cleanly.
 *   - DRAFT, PENDING_APPROVAL, CANCELLED bills with no payments: hard delete OK.
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

    // After bill→GL posting (commit 2ce7a43), a posted bill carries a
    // voucherId. Even if status was somehow forced back to DRAFT, the
    // voucher row + ledger balances exist. Refuse to delete and orphan
    // the voucher; caller must reverse the voucher first (TODO: add a
    // reverse-bill PATCH path).
    if (bill.voucherId) {
      return badRequest(
        "Cannot delete a bill that has been posted to GL. Reverse the posting voucher first."
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

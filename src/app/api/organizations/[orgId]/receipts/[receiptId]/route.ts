import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound, hasPermission, forbidden } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D } from "@/backend/utils/money";
import { applyLedgerEntries, recomputeInvoiceStatus } from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateReceiptSchema = z.object({
  status: z.enum(["COMPLETED", "CANCELLED", "BOUNCED"]).optional(),
  /** Optional cancellation reason — surfaced in the audit log + receipt notes. */
  cancellationReason: z.string().max(500).nullable().optional(),
}).strict();

/**
 * PATCH a receipt. Today supports two reversal-shaped transitions
 * (CANCELLED for "we entered the wrong amount", BOUNCED for "the
 * customer's cheque didn't clear"). Both produce the same GL outcome:
 *
 *   COMPLETED → CANCELLED | BOUNCED
 *     - Reverses the posting voucher (Dr↔Cr swap on every entry).
 *     - Decrements BankAccount.currentBalance by the gross amount
 *       that was added at receipt time (= amount + tcs collected).
 *     - Drops the TcsCollection row — the collection never happened
 *       in legal terms once the receipt is reversed; Form 27D / 26AS
 *       must NOT report it.
 *     - Sets Voucher.status=CANCELLED, isPosted=false. Voucher row
 *       stays linked for audit chain.
 *     - Removes the InvoicePayment junction row.
 *     - Recomputes Invoice.amountPaid/amountDue/status.
 *
 * Permission: receipts:approve. Refuses on already-cancelled receipts.
 *
 * Mirror of cancel-payment (commit c04ec29) on the AR side.
 */
export const PATCH = withOrgAuth<{ receiptId: string }>(async (request, { orgId, params, orgUser, userId }) => {
  try {
    const { receiptId } = params;
    const validated = updateReceiptSchema.parse(await request.json());

    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, organizationId: orgId },
      include: {
        voucher: {
          include: {
            entries: { select: { ledgerId: true, debitAmount: true, creditAmount: true } },
          },
        },
        invoice: { select: { id: true } },
        bankAccount: { select: { id: true } },
      },
    });
    if (!receipt) return notFound("Receipt not found");

    if (validated.status === "CANCELLED" || validated.status === "BOUNCED") {
      if (!hasPermission(orgUser, "receipts", "approve")) {
        return forbidden("You don't have permission to cancel receipts");
      }
      if (receipt.status === validated.status) {
        return badRequest(`Receipt is already ${validated.status}`);
      }
      if (receipt.status !== "COMPLETED") {
        return badRequest(`Cannot reverse a receipt in status ${receipt.status}`);
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Reverse the GL voucher.
        if (receipt.voucher && receipt.voucher.isPosted) {
          const reversed = receipt.voucher.entries.map((e) => ({
            ledgerId: e.ledgerId,
            debitAmount: D(e.creditAmount),
            creditAmount: D(e.debitAmount),
          }));
          await applyLedgerEntries(tx, reversed);
          await tx.voucher.update({
            where: { id: receipt.voucher.id },
            data: {
              status: "CANCELLED",
              isPosted: false,
              postedAt: null,
            },
          });
        }

        // 2. Restore BankAccount.currentBalance — decrement by the
        // gross that was added (= amount + tcs). The tcs lives on
        // the TcsCollection row when present.
        const tcsRow = await tx.tcsCollection.findFirst({
          where: { receiptId, organizationId: orgId },
          select: { id: true, taxAmount: true },
        });
        const tcs = tcsRow ? D(tcsRow.taxAmount) : D(0);
        const bankGross = D(receipt.amount).plus(tcs);
        if (receipt.bankAccount) {
          await tx.bankAccount.update({
            where: { id: receipt.bankAccount.id },
            data: { currentBalance: { decrement: bankGross } },
          });
        }

        // 3. Drop the TcsCollection row (collection never happened
        // in legal terms once reversed).
        if (tcsRow) {
          await tx.tcsCollection.delete({ where: { id: tcsRow.id } });
        }

        // 4. Clean up the invoice linkage and recompute AR.
        if (receipt.invoice && receipt.voucher) {
          await tx.invoicePayment.deleteMany({
            where: { voucherId: receipt.voucher.id, invoiceId: receipt.invoice.id },
          });
        }

        // 5. Mark the receipt as CANCELLED or BOUNCED.
        const updated = await tx.receipt.update({
          where: { id: receiptId },
          data: {
            status: validated.status,
            notes: validated.cancellationReason
              ? `[${validated.status}] ${validated.cancellationReason}\n${receipt.notes ?? ""}`.trim()
              : receipt.notes,
          },
        });

        // 6. Recompute invoice status now that the InvoicePayment row is gone.
        if (receipt.invoice) {
          await recomputeInvoiceStatus(tx, receipt.invoice.id);
        }

        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "REVERSE",
          entityType: "Receipt",
          entityId: receiptId,
          oldData: {
            status: receipt.status,
            amount: receipt.amount.toString(),
            voucherId: receipt.voucher?.id ?? null,
          },
          newData: {
            status: validated.status,
            reason: validated.cancellationReason ?? null,
            reversedVoucherId: receipt.voucher?.id ?? null,
            tcsReversed: tcsRow !== null,
          },
        });

        return updated;
      });

      return NextResponse.json(result);
    }

    return badRequest("Unsupported PATCH — only status=CANCELLED|BOUNCED is supported today");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error patching receipt");
    return NextResponse.json({ error: "Failed to update receipt" }, { status: 500 });
  }
});

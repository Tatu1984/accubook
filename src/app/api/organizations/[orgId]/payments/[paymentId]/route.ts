import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound, hasPermission, forbidden } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D } from "@/backend/utils/money";
import { applyLedgerEntries, recomputeBillStatus } from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updatePaymentSchema = z.object({
  status: z.enum(["COMPLETED", "CANCELLED"]).optional(),
  /** Optional cancellation reason — surfaced in the audit log. */
  cancellationReason: z.string().max(500).nullable().optional(),
}).strict();

/**
 * PATCH a payment. Today supports a single transition:
 *
 *   COMPLETED → CANCELLED
 *     - Reverses the posting voucher (Dr↔Cr swap on every entry).
 *     - Restores BankAccount.currentBalance by the net amount that
 *       left it (= amount − tds, matching what payment POST debited).
 *     - Recomputes the linked Bill's amountPaid/amountDue/status so
 *       AP reflects the void.
 *     - Removes the TdsDeduction row (the deduction never happened
 *       in legal terms once the payment is cancelled — Form 16A
 *       must NOT report it).
 *     - Sets Voucher.status=CANCELLED, isPosted=false. The voucher
 *       row stays for audit chain.
 *     - Marks the InvoicePayment junction row as deleted (junction
 *       is purely a link table).
 *
 * Use cases: bounced cheque, accidental duplicate, wrong amount.
 * Permission: payments:approve. Refuses on already-cancelled.
 */
export const PATCH = withOrgAuth<{ paymentId: string }>(async (request, { orgId, params, orgUser, userId }) => {
  try {
    const { paymentId } = params;
    const validated = updatePaymentSchema.parse(await request.json());

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, organizationId: orgId },
      include: {
        voucher: {
          include: {
            entries: { select: { ledgerId: true, debitAmount: true, creditAmount: true } },
          },
        },
        bill: { select: { id: true } },
        bankAccount: { select: { id: true } },
      },
    });
    if (!payment) return notFound("Payment not found");

    // For now the only meaningful PATCH is a cancellation. Other
    // status flips (PENDING → COMPLETED, etc.) aren't part of the
    // user-facing flow today.
    if (validated.status === "CANCELLED") {
      if (!hasPermission(orgUser, "payments", "approve")) {
        return forbidden("You don't have permission to cancel payments");
      }
      if (payment.status === "CANCELLED") {
        return badRequest("Payment is already cancelled");
      }
      if (payment.status !== "COMPLETED") {
        return badRequest(`Cannot cancel a payment in status ${payment.status}`);
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Reverse the GL voucher.
        if (payment.voucher && payment.voucher.isPosted) {
          const reversed = payment.voucher.entries.map((e) => ({
            ledgerId: e.ledgerId,
            debitAmount: D(e.creditAmount),
            creditAmount: D(e.debitAmount),
          }));
          await applyLedgerEntries(tx, reversed);
          await tx.voucher.update({
            where: { id: payment.voucher.id },
            data: {
              status: "CANCELLED",
              isPosted: false,
              postedAt: null,
            },
          });
        }

        // 2. Restore BankAccount.currentBalance by the net amount the
        // posting flow decremented (= total - tds withheld). We can
        // re-derive that net from the voucher's "bank/cash ledger"
        // line — its credit is what was paid out — but it's simpler
        // to read from the TdsDeduction row when it exists.
        const tdsRow = await tx.tdsDeduction.findFirst({
          where: { paymentId, organizationId: orgId },
          select: { id: true, taxAmount: true },
        });
        const tds = tdsRow ? D(tdsRow.taxAmount) : D(0);
        const bankNet = D(payment.amount).minus(tds);
        if (payment.bankAccount) {
          await tx.bankAccount.update({
            where: { id: payment.bankAccount.id },
            data: { currentBalance: { increment: bankNet } },
          });
        }

        // 3. Drop the TdsDeduction so Form 16A / 26AS don't report it.
        // Voucher reversal already removed the GL impact; this row is
        // the queryable trace.
        if (tdsRow) {
          await tx.tdsDeduction.delete({ where: { id: tdsRow.id } });
        }

        // 4. Clean up the bill linkage and recompute AP.
        if (payment.bill && payment.voucher) {
          await tx.invoicePayment.deleteMany({
            where: { voucherId: payment.voucher.id, billId: payment.bill.id },
          });
        }

        // 5. Mark the payment cancelled.
        const updated = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: "CANCELLED",
            notes: validated.cancellationReason
              ? `[CANCELLED] ${validated.cancellationReason}\n${payment.notes ?? ""}`.trim()
              : payment.notes,
          },
        });

        // 6. Recompute bill status now that the InvoicePayment row is gone.
        if (payment.bill) {
          await recomputeBillStatus(tx, payment.bill.id);
        }

        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "REVERSE",
          entityType: "Payment",
          entityId: paymentId,
          oldData: {
            status: payment.status,
            amount: payment.amount.toString(),
            voucherId: payment.voucher?.id ?? null,
          },
          newData: {
            status: "CANCELLED",
            reason: validated.cancellationReason ?? null,
            reversedVoucherId: payment.voucher?.id ?? null,
            tdsReversed: tdsRow !== null,
          },
        });

        return updated;
      });

      return NextResponse.json(result);
    }

    // No-op fallthrough: PATCH with no recognized fields.
    return badRequest("Unsupported PATCH — only status=CANCELLED is supported today");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error patching payment");
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
});

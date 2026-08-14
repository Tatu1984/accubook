import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import {
  withOrgAuth,
  notFound,
  badRequest,
  forbidden,
  hasPermission,
} from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import {
  postInvoiceToGl,
  reverseInvoicePosting,
} from "@/backend/services/billing/post-invoice";
import { recomputeInvoiceStatus } from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/organizations/[orgId]/invoices/[invoiceId]
 *
 * Returns a single invoice with party + items + tax breakdown for the
 * detail / printable view. The list endpoint at /invoices already
 * supports filtering by id but pulls the rolled-up shape; this is
 * the dedicated single-record path with full nested data.
 */
export const GET = withOrgAuth<{ invoiceId: string }>(async (_req, { orgId, params }) => {
  try {
    const { invoiceId } = params;
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      include: {
        party: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            gstNo: true,
            panNo: true,
            billingAddress: true,
            billingCity: true,
            billingState: true,
            billingCountry: true,
            billingPostal: true,
            shippingAddress: true,
            shippingCity: true,
            shippingState: true,
            shippingPostal: true,
          },
        },
        items: {
          include: {
            item: { select: { id: true, name: true, sku: true, hsnCode: true } },
            tax: { select: { id: true, name: true, rate: true, taxType: true } },
          },
          orderBy: { sequence: "asc" },
        },
        taxes: true,
        receipts: {
          select: {
            id: true,
            receiptNumber: true,
            date: true,
            amount: true,
            paymentMode: true,
            status: true,
          },
          orderBy: { date: "desc" },
        },
      },
    });
    if (!invoice) return notFound("Invoice not found");
    return NextResponse.json(invoice);
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice");
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
});

/**
 * The invoice lifecycle.
 *
 *   DRAFT ──issue──▶ SENT ──receipts──▶ PARTIAL ──▶ PAID
 *     │                │                              (derived from money
 *     │                │                               by recomputeInvoiceStatus)
 *     └──────────┬─────┘
 *                ▼
 *            CANCELLED
 *
 * Only DRAFT → SENT and → CANCELLED are caller-driven. PARTIAL / PAID /
 * OVERDUE are derived from receipts and must not be set by hand, or the
 * document's status would stop agreeing with its own money.
 *
 * Issuing is the accounting event: revenue is recognised when the invoice
 * is issued, not when cash arrives. That is what `postInvoiceToGl` books.
 *
 * There was previously no PATCH handler at all. The invoice list UI called
 * this endpoint anyway and got a 405, so no invoice could ever leave DRAFT
 * and none of them reached the ledger, GSTR-1 or the AR aging report.
 */
const TERMINAL = new Set(["CANCELLED"]);
const DERIVED = new Set(["PARTIAL", "PAID", "OVERDUE"]);

const patchInvoiceSchema = z
  .object({
    status: optional(z.enum(["SENT", "CANCELLED", "DRAFT"])),
    notes: optional(z.string().max(2000)),
    terms: optional(z.string().max(2000)),
    cancellationReason: optional(z.string().max(500)),
  })
  .strict();

export const PATCH = withOrgAuth<{ invoiceId: string }>(
  async (request, { orgId, params, orgUser, userId }) => {
    try {
      const { invoiceId } = params;
      const body = await request.json();
      const validated = patchInvoiceSchema.parse(body);

      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: orgId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          voucherId: true,
          amountPaid: true,
          _count: { select: { receipts: true } },
        },
      });
      if (!invoice) return notFound("Invoice not found");

      const from = invoice.status;
      const to = validated.status;

      // Issuing and cancelling both move money in the ledger, so both sit
      // behind the same approve-class permission every other GL-posting
      // path uses.
      if (to && to !== from && !hasPermission(orgUser, "sales", "invoices", "approve")) {
        return forbidden("You don't have permission to issue or cancel invoices");
      }

      if (to && DERIVED.has(to)) {
        return badRequest(
          `Status "${to}" is derived from receipts against this invoice and cannot be set directly.`
        );
      }
      if (to && TERMINAL.has(from)) {
        return badRequest(`Invoice ${invoice.invoiceNumber} is cancelled and cannot change status.`);
      }

      const willIssue = to === "SENT" && from === "DRAFT";
      const willCancel = to === "CANCELLED" && from !== "CANCELLED";
      const willUnissue = to === "DRAFT" && from !== "DRAFT";

      if (to && !willIssue && !willCancel && !willUnissue && to !== from) {
        return badRequest(`Cannot move invoice from ${from} to ${to}.`);
      }

      // Money already received pins the document. Reversing underneath a
      // receipt would leave the receipt pointing at a document that no
      // longer exists in the ledger.
      if ((willCancel || willUnissue) && invoice._count.receipts > 0) {
        return badRequest(
          `Invoice ${invoice.invoiceNumber} has receipts against it. Cancel or bounce those first.`
        );
      }

      // An issued invoice is a document the customer has been given, and
      // its ledger entry is dated. Let the notes move; not the terms of
      // the deal.
      if (from !== "DRAFT" && validated.terms !== undefined) {
        return badRequest("Terms cannot be edited once an invoice has been issued.");
      }

      const result = await prisma.$transaction(async (tx) => {
        let posting: { voucherId: string; voucherNumber: string } | null = null;
        let reversedVoucherId: string | null = null;

        if (willIssue && !invoice.voucherId) {
          const r = await postInvoiceToGl(tx, {
            invoiceId,
            organizationId: orgId,
            userId,
          });
          posting = { voucherId: r.voucherId, voucherNumber: r.voucherNumber };
        }

        if ((willCancel || willUnissue) && invoice.voucherId) {
          const r = await reverseInvoicePosting(tx, { invoiceId, organizationId: orgId });
          reversedVoucherId = r?.reversedVoucherId ?? null;
        }

        const nextStatus = to ?? from;
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: nextStatus,
            ...(validated.notes !== undefined
              ? {
                  notes: validated.cancellationReason
                    ? `[CANCELLED] ${validated.cancellationReason}\n${validated.notes}`.trim()
                    : validated.notes,
                }
              : validated.cancellationReason
                ? { notes: `[CANCELLED] ${validated.cancellationReason}` }
                : {}),
            ...(validated.terms !== undefined ? { terms: validated.terms } : {}),
          },
        });

        // Re-derive PARTIAL / PAID / OVERDUE from the receipts now that the
        // lifecycle status has moved. A freshly issued invoice with no
        // receipts stays SENT; one already part-paid returns to PARTIAL.
        if (nextStatus !== "DRAFT" && nextStatus !== "CANCELLED") {
          await recomputeInvoiceStatus(tx, invoiceId);
        }

        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: willIssue ? "POST" : willCancel || willUnissue ? "REVERSE" : "UPDATE",
          entityType: "Invoice",
          entityId: invoiceId,
          oldData: { status: from, voucherId: invoice.voucherId },
          newData: {
            status: nextStatus,
            voucherId: posting?.voucherId ?? null,
            reversedVoucherId,
            reason: validated.cancellationReason ?? null,
          },
        });

        return tx.invoice.findUnique({
          where: { id: invoiceId },
          include: { party: { select: { id: true, name: true } } },
        });
      });

      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return badRequest("Validation failed", error.issues);
      }
      // Posting failures carry a message written for an accountant
      // ("Ledger group X is not configured", "carries GST but the
      // organization is on the composition scheme"). Surfacing it is the
      // difference between a fixable problem and a mystery 500.
      const message = error instanceof Error ? error.message : "Failed to update invoice";
      logger.error({ err: error }, "Error updating invoice");
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
);

/**
 * Hard-delete, for drafts only. Anything that has touched the ledger is
 * cancelled through PATCH instead, so the voucher trail survives.
 */
export const DELETE = withOrgAuth<{ invoiceId: string }>(
  async (_request, { orgId, params, userId }) => {
    try {
      const { invoiceId } = params;
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: orgId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          voucherId: true,
          _count: { select: { receipts: true } },
        },
      });
      if (!invoice) return notFound("Invoice not found");

      if (invoice.voucherId) {
        return badRequest(
          `Invoice ${invoice.invoiceNumber} is posted to the ledger. Cancel it instead of deleting it.`
        );
      }
      if (invoice.status !== "DRAFT") {
        return badRequest(`Only draft invoices can be deleted (this one is ${invoice.status}).`);
      }
      if (invoice._count.receipts > 0) {
        return badRequest(`Invoice ${invoice.invoiceNumber} has receipts against it.`);
      }

      await prisma.$transaction(async (tx) => {
        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "DELETE",
          entityType: "Invoice",
          entityId: invoiceId,
          oldData: { invoiceNumber: invoice.invoiceNumber, status: invoice.status },
        });
        await tx.invoice.delete({ where: { id: invoiceId } });
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting invoice");
      return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
    }
  }
);

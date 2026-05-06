import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { nextNumber } from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/invoices/[invoiceId]/duplicate
 *
 * Creates a DRAFT copy of an existing invoice. Copies header (party, place
 * of supply, supply type, RCM, terms, notes), items + tax breakdown.
 * Receipts, IRN, payment status, voucher link are NOT copied. New invoice
 * gets a fresh FY-scoped number, today's date, and dueDate offset by the
 * same gap as the source.
 */
export const POST = withOrgAuth<{ invoiceId: string }>(
  async (_req, { orgId, userId, params }) => {
    try {
      const { invoiceId } = params;
      const src = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: orgId },
        include: { items: true, taxes: true },
      });
      if (!src) return notFound("Invoice not found");

      const today = new Date();
      const srcDays =
        (new Date(src.dueDate).getTime() - new Date(src.date).getTime()) /
        86_400_000;
      const dueDate = new Date(today.getTime() + srcDays * 86_400_000);

      // FY label matches the existing POST convention.
      const month = today.getMonth();
      const year = today.getFullYear();
      const fyStart = month >= 3 ? year : year - 1;
      const fyLabel = `${fyStart}-${(fyStart + 1).toString().slice(-2)}`;

      const dup = await prisma.$transaction(async (tx) => {
        const seq = await nextNumber(tx, orgId, `INVOICE:${fyLabel}`);
        const invoiceNumber = `INV/${fyLabel}/${String(seq).padStart(5, "0")}`;

        const created = await tx.invoice.create({
          data: {
            organizationId: orgId,
            partyId: src.partyId,
            invoiceNumber,
            date: today,
            dueDate,
            type: src.type,
            status: "DRAFT",
            billingAddress: src.billingAddress,
            shippingAddress: src.shippingAddress,
            subtotal: src.subtotal,
            discountAmount: src.discountAmount,
            taxAmount: src.taxAmount,
            roundOff: src.roundOff,
            totalAmount: src.totalAmount,
            amountPaid: 0,
            amountDue: src.totalAmount,
            currencyId: src.currencyId,
            exchangeRate: src.exchangeRate,
            notes: src.notes,
            terms: src.terms,
            placeOfSupply: src.placeOfSupply,
            supplyType: src.supplyType,
            reverseCharge: src.reverseCharge,
            items: {
              create: src.items.map((it, idx) => ({
                itemId: it.itemId,
                taxId: it.taxId,
                description: it.description,
                hsnCode: it.hsnCode,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                discountPercent: it.discountPercent,
                discountAmount: it.discountAmount,
                taxableAmount: it.taxableAmount,
                taxAmount: it.taxAmount,
                cgstRate: it.cgstRate,
                cgstAmount: it.cgstAmount,
                sgstRate: it.sgstRate,
                sgstAmount: it.sgstAmount,
                igstRate: it.igstRate,
                igstAmount: it.igstAmount,
                cessRate: it.cessRate,
                cessAmount: it.cessAmount,
                totalAmount: it.totalAmount,
                sequence: idx + 1,
              })),
            },
            taxes: {
              create: src.taxes.map((t) => ({
                taxId: t.taxId,
                taxableAmount: t.taxableAmount,
                taxAmount: t.taxAmount,
              })),
            },
          },
          select: { id: true, invoiceNumber: true },
        });

        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "CREATE",
          entityType: "Invoice",
          entityId: created.id,
          newData: {
            duplicatedFrom: src.id,
            sourceInvoiceNumber: src.invoiceNumber,
          },
        });

        return created;
      });

      return NextResponse.json({ id: dup.id, invoiceNumber: dup.invoiceNumber });
    } catch (error) {
      logger.error({ err: error }, "Error duplicating invoice");
      return NextResponse.json(
        { error: "Failed to duplicate invoice" },
        { status: 500 }
      );
    }
  }
);

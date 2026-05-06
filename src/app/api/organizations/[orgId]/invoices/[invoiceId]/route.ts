import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

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

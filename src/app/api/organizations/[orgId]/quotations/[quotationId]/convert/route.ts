import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/quotations/[quotationId]/convert
 *
 * Turns an accepted quotation into a sales order, carrying the line items and
 * totals across verbatim, then marks the quotation CONVERTED and records the
 * resulting order id in `convertedToOrder`. The schema always had those two
 * fields; nothing wrote them until now.
 */
export const POST = withOrgAuth<{ quotationId: string }>(
  async (_request, { orgId, userId, params }) => {
    try {
      const { quotationId } = params;

      const quotation = await prisma.quotation.findFirst({
        where: { id: quotationId, organizationId: orgId },
        include: { items: true },
      });

      if (!quotation) return notFound("Quotation not found");

      if (quotation.status === "CONVERTED" || quotation.convertedToOrder) {
        return badRequest(
          "This quotation has already been converted to a sales order"
        );
      }
      if (quotation.status === "REJECTED" || quotation.status === "EXPIRED") {
        return badRequest(
          `A ${quotation.status.toLowerCase()} quotation cannot be converted`
        );
      }
      if (quotation.items.length === 0) {
        return badRequest("This quotation has no line items");
      }

      const result = await prisma.$transaction(async (tx) => {
        const lastOrder = await tx.salesOrder.findFirst({
          where: { organizationId: orgId },
          orderBy: { createdAt: "desc" },
          select: { orderNumber: true },
        });

        const orderNumber = lastOrder
          ? `SO-${String(
              parseInt(lastOrder.orderNumber.split("-")[1] || "0") + 1
            ).padStart(6, "0")}`
          : "SO-000001";

        const salesOrder = await tx.salesOrder.create({
          data: {
            organizationId: orgId,
            branchId: quotation.branchId,
            partyId: quotation.partyId,
            orderNumber,
            date: new Date(),
            referenceNo: quotation.quotationNumber,
            status: "CONFIRMED",
            billingAddress: quotation.billingAddress,
            shippingAddress: quotation.shippingAddress,
            subtotal: quotation.subtotal,
            discountAmount: quotation.discountAmount,
            taxAmount: quotation.taxAmount,
            totalAmount: quotation.totalAmount,
            notes: quotation.notes,
            terms: quotation.terms,
            items: {
              create: quotation.items.map((item, index) => ({
                itemId: item.itemId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountPercent: item.discountPercent,
                discountAmount: item.discountAmount,
                taxId: item.taxId,
                taxAmount: item.taxAmount,
                totalAmount: item.totalAmount,
                sequence: item.sequence ?? index,
              })),
            },
          },
          include: { party: { select: { id: true, name: true } } },
        });

        await tx.quotation.update({
          where: { id: quotation.id },
          data: { status: "CONVERTED", convertedToOrder: salesOrder.id },
        });

        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "UPDATE",
          entityType: "Quotation",
          entityId: quotation.id,
          oldData: { status: quotation.status },
          newData: {
            status: "CONVERTED",
            convertedToOrder: salesOrder.id,
            orderNumber: salesOrder.orderNumber,
          },
        });

        return salesOrder;
      });

      return NextResponse.json(
        { salesOrderId: result.id, orderNumber: result.orderNumber },
        { status: 201 }
      );
    } catch (error) {
      logger.error({ err: error }, "Error converting quotation to sales order");
      return NextResponse.json(
        { error: "Failed to convert quotation" },
        { status: 500 }
      );
    }
  }
);

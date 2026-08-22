import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOrgAuth<{ orderId: string }>(
  async (_request, { orgId, params }) => {
    try {
      const order = await prisma.salesOrder.findFirst({
        where: { id: params.orderId, organizationId: orgId },
        include: {
          party: { select: { id: true, name: true, email: true } },
          items: { include: { item: { select: { id: true, name: true, sku: true } } } },
        },
      });
      if (!order) return notFound("Sales order not found");
      return NextResponse.json(order);
    } catch (error) {
      logger.error({ err: error }, "Error fetching sales order");
      return NextResponse.json(
        { error: "Failed to fetch sales order" },
        { status: 500 }
      );
    }
  }
);

const updateSalesOrderSchema = z.object({
  partyId: optional(z.string().min(1)),
  date: optional(z.string()),
  expectedDate: optional(z.string()),
  referenceNo: optional(z.string()),
  status: optional(
    z.enum(["DRAFT", "CONFIRMED", "PARTIAL", "FULFILLED", "CANCELLED"])
  ),
  billingAddress: optional(z.string()),
  shippingAddress: optional(z.string()),
  notes: optional(z.string()),
  terms: optional(z.string()),
  items: optional(
    z
      .array(
        z.object({
          itemId: z.string().min(1),
          description: optional(z.string()),
          quantity: z.number().min(0.0001),
          unitPrice: z.number().min(0),
          discountPercent: z.number().min(0).max(100).default(0),
          taxId: optional(z.string()),
        })
      )
      .min(1, "At least one item is required")
  ),
});

/**
 * PATCH /api/organizations/[orgId]/sales-orders/[orderId]
 *
 * Edits an order's header and, when `items` is supplied, replaces the whole
 * line set and recomputes the totals the same way the create route does.
 * Fulfilled and cancelled orders are frozen — editing them would desync the
 * quantities already delivered.
 */
export const PATCH = withOrgAuth<{ orderId: string }>(
  async (request, { orgId, params }) => {
    try {
      const { orderId } = params;
      const body = await request.json();
      const data = updateSalesOrderSchema.parse(body);

      const existing = await prisma.salesOrder.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!existing) return notFound("Sales order not found");

      if (existing.status === "FULFILLED" || existing.status === "CANCELLED") {
        return badRequest(
          `A ${existing.status.toLowerCase()} sales order cannot be edited`
        );
      }

      if (data.partyId) {
        const party = await prisma.party.findFirst({
          where: { id: data.partyId, organizationId: orgId },
          select: { id: true },
        });
        if (!party) return notFound("Customer not found");
      }

      const updated = await prisma.$transaction(async (tx) => {
        let totals: {
          subtotal: number;
          discountAmount: number;
          taxAmount: number;
          totalAmount: number;
        } | null = null;

        if (data.items) {
          let subtotal = 0;
          let totalDiscount = 0;

          const itemsData = data.items.map((item, index) => {
            const lineTotal = item.quantity * item.unitPrice;
            const discountAmount = (lineTotal * item.discountPercent) / 100;
            subtotal += lineTotal;
            totalDiscount += discountAmount;
            return {
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              discountAmount,
              taxId: item.taxId,
              taxAmount: 0,
              totalAmount: lineTotal - discountAmount,
              description: item.description,
              sequence: index,
            };
          });

          await tx.salesOrderItem.deleteMany({ where: { salesOrderId: orderId } });
          await tx.salesOrderItem.createMany({
            data: itemsData.map((item) => ({ ...item, salesOrderId: orderId })),
          });

          totals = {
            subtotal,
            discountAmount: totalDiscount,
            taxAmount: 0,
            totalAmount: subtotal - totalDiscount,
          };
        }

        return tx.salesOrder.update({
          where: { id: orderId },
          data: {
            partyId: data.partyId,
            date: data.date ? new Date(data.date) : undefined,
            expectedDate: data.expectedDate
              ? new Date(data.expectedDate)
              : undefined,
            referenceNo: data.referenceNo,
            status: data.status,
            billingAddress: data.billingAddress,
            shippingAddress: data.shippingAddress,
            notes: data.notes,
            terms: data.terms,
            ...(totals ?? {}),
          },
          include: {
            party: { select: { id: true, name: true, email: true } },
            items: {
              include: { item: { select: { id: true, name: true, sku: true } } },
            },
          },
        });
      });

      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return badRequest("Validation failed", error.issues);
      }
      logger.error({ err: error }, "Error updating sales order");
      return NextResponse.json(
        { error: "Failed to update sales order" },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withOrgAuth<{ orderId: string }>(async (_request, { orgId, params }) => {
  try {
    const { orderId } = params;

    // Check if sales order exists and belongs to organization
    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
    });

    if (!order || order.organizationId !== orgId) {
      return notFound("Sales order not found");
    }

    // Delete sales order items first (if not cascading)
    await prisma.salesOrderItem.deleteMany({
      where: { salesOrderId: orderId },
    });

    // Delete sales order
    await prisma.salesOrder.delete({
      where: { id: orderId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting sales order");
    return NextResponse.json(
      { error: "Failed to delete sales order" },
      { status: 500 }
    );
  }
});

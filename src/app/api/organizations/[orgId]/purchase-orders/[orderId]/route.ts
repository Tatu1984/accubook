import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";
import { D } from "@/backend/utils/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single purchase order: read, amend, receive, delete.
 *
 * This file did not exist. The purchase orders screen already called
 * `DELETE /purchase-orders/[orderId]`, which answered 404 on every attempt,
 * and had no route at all behind "Edit" or "Mark as Received".
 */

export const GET = withOrgAuth<{ orderId: string }>(
  async (_request, { orgId, params }) => {
    try {
      const order = await prisma.purchaseOrder.findFirst({
        where: { id: params.orderId, organizationId: orgId },
        include: {
          party: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  primaryUnitId: true,
                },
              },
            },
          },
        },
      });
      if (!order) return notFound("Purchase order not found");
      return NextResponse.json(order);
    } catch (error) {
      logger.error({ err: error }, "Error fetching purchase order");
      return NextResponse.json(
        { error: "Failed to fetch purchase order" },
        { status: 500 }
      );
    }
  }
);

const updatePurchaseOrderSchema = z.object({
  partyId: optional(z.string().min(1)),
  date: optional(z.string()),
  expectedDate: optional(z.string()),
  referenceNo: optional(z.string()),
  status: optional(
    z.enum(["DRAFT", "SENT", "CONFIRMED", "PARTIAL", "RECEIVED", "CANCELLED"])
  ),
  notes: optional(z.string()),
  terms: optional(z.string()),
  /**
   * When set together with `status: "RECEIVED"`, the ordered quantities are
   * booked into this warehouse as GRN stock movements. Omit it to record the
   * status change only (for orders received against a separate GRN process).
   */
  receiveIntoWarehouseId: optional(z.string()),
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

export const PATCH = withOrgAuth<{ orderId: string }>(
  async (request, { orgId, userId, params }) => {
    try {
      const { orderId } = params;
      const body = await request.json();
      const data = updatePurchaseOrderSchema.parse(body);

      const existing = await prisma.purchaseOrder.findFirst({
        where: { id: orderId, organizationId: orgId },
        include: { items: true },
      });
      if (!existing) return notFound("Purchase order not found");

      if (existing.status === "CANCELLED" && data.status !== "DRAFT") {
        return badRequest("A cancelled purchase order cannot be modified");
      }
      if (data.items && existing.status === "RECEIVED") {
        return badRequest(
          "A received purchase order's line items cannot be changed"
        );
      }

      if (data.partyId) {
        const party = await prisma.party.findFirst({
          where: { id: data.partyId, organizationId: orgId },
          select: { id: true },
        });
        if (!party) return notFound("Vendor not found");
      }

      let warehouseId: string | undefined;
      if (data.status === "RECEIVED" && data.receiveIntoWarehouseId) {
        const warehouse = await prisma.warehouse.findFirst({
          where: { id: data.receiveIntoWarehouseId, organizationId: orgId },
          select: { id: true },
        });
        if (!warehouse) return notFound("Warehouse not found");
        warehouseId = warehouse.id;
      }

      const updated = await prisma.$transaction(async (tx) => {
        let totals:
          | {
              subtotal: number;
              discountAmount: number;
              taxAmount: number;
              totalAmount: number;
            }
          | undefined;

        if (data.items) {
          let subtotal = 0;
          let totalDiscount = 0;
          const itemsData = data.items.map((item, index) => {
            const lineTotal = item.quantity * item.unitPrice;
            const discountAmount = (lineTotal * item.discountPercent) / 100;
            subtotal += lineTotal;
            totalDiscount += discountAmount;
            return {
              purchaseOrderId: orderId,
              itemId: item.itemId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              discountAmount,
              taxId: item.taxId,
              taxAmount: 0,
              totalAmount: lineTotal - discountAmount,
              sequence: index,
            };
          });

          await tx.purchaseOrderItem.deleteMany({
            where: { purchaseOrderId: orderId },
          });
          await tx.purchaseOrderItem.createMany({ data: itemsData });

          totals = {
            subtotal,
            discountAmount: totalDiscount,
            taxAmount: 0,
            totalAmount: subtotal - totalDiscount,
          };
        }

        /**
         * Receiving into stores: one GRN movement per line, which also
         * recomputes the weighted-average cost at the destination — the same
         * path a manual goods receipt takes.
         */
        if (
          warehouseId &&
          data.status === "RECEIVED" &&
          existing.status !== "RECEIVED"
        ) {
          const itemIds = existing.items.map((i) => i.itemId);
          const masters = await tx.item.findMany({
            where: { id: { in: itemIds }, organizationId: orgId },
            select: { id: true, primaryUnitId: true, name: true },
          });
          const unitByItem = new Map(masters.map((m) => [m.id, m.primaryUnitId]));

          for (const line of existing.items) {
            const unitId = unitByItem.get(line.itemId);
            if (!unitId) continue;

            const qty = D(line.quantity);
            const rate = D(line.unitPrice);

            await tx.stockMovement.create({
              data: {
                itemId: line.itemId,
                toWarehouseId: warehouseId,
                unitId,
                movementType: "GRN",
                quantity: qty,
                rate,
                totalValue: qty.times(rate),
                referenceType: "PURCHASE_ORDER",
                referenceId: existing.orderNumber,
                narration: `Goods received against ${existing.orderNumber}`,
                date: new Date(),
              },
            });

            const stock = await tx.stock.findUnique({
              where: {
                itemId_warehouseId: { itemId: line.itemId, warehouseId },
              },
              select: { quantity: true, avgCost: true },
            });

            if (!stock) {
              await tx.stock.create({
                data: {
                  itemId: line.itemId,
                  warehouseId,
                  quantity: qty,
                  avgCost: rate,
                },
              });
            } else {
              const oldQty = D(stock.quantity);
              const oldAvg = D(stock.avgCost ?? 0);
              const newQty = oldQty.plus(qty);
              const newAvg = newQty.isZero()
                ? rate
                : oldQty.times(oldAvg).plus(qty.times(rate)).dividedBy(newQty);
              await tx.stock.update({
                where: {
                  itemId_warehouseId: { itemId: line.itemId, warehouseId },
                },
                data: { quantity: newQty, avgCost: newAvg },
              });
            }

            await tx.purchaseOrderItem.update({
              where: { id: line.id },
              data: { receivedQty: qty },
            });
          }
        }

        const order = await tx.purchaseOrder.update({
          where: { id: orderId },
          data: {
            partyId: data.partyId,
            date: data.date ? new Date(data.date) : undefined,
            expectedDate: data.expectedDate
              ? new Date(data.expectedDate)
              : undefined,
            referenceNo: data.referenceNo,
            status: data.status,
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

        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "UPDATE",
          entityType: "PurchaseOrder",
          entityId: orderId,
          oldData: { status: existing.status },
          newData: {
            status: order.status,
            stockReceivedInto: warehouseId ?? null,
          },
        });

        return order;
      });

      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return badRequest("Validation failed", error.issues);
      }
      logger.error({ err: error }, "Error updating purchase order");
      return NextResponse.json(
        { error: "Failed to update purchase order" },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withOrgAuth<{ orderId: string }>(
  async (_request, { orgId, userId, params }) => {
    try {
      const { orderId } = params;

      const order = await prisma.purchaseOrder.findFirst({
        where: { id: orderId, organizationId: orgId },
        include: { _count: { select: { bills: true } } },
      });
      if (!order) return notFound("Purchase order not found");

      if (order._count.bills > 0) {
        return badRequest(
          "This purchase order has bills raised against it — cancel it instead of deleting"
        );
      }
      if (order.status === "RECEIVED" || order.status === "PARTIAL") {
        return badRequest(
          `A ${order.status.toLowerCase()} purchase order cannot be deleted — cancel it instead`
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: orderId },
        });
        await tx.purchaseOrder.delete({ where: { id: orderId } });
        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "DELETE",
          entityType: "PurchaseOrder",
          entityId: orderId,
          oldData: { orderNumber: order.orderNumber, status: order.status },
        });
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting purchase order");
      return NextResponse.json(
        { error: "Failed to delete purchase order" },
        { status: 500 }
      );
    }
  }
);

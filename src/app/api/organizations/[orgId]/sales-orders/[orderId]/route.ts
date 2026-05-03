import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound } from "@/backend/utils/with-org-auth";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    console.error("Error deleting sales order:", error);
    return NextResponse.json(
      { error: "Failed to delete sales order" },
      { status: 500 }
    );
  }
});

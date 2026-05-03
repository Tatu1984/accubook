import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound } from "@/backend/utils/with-org-auth";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withOrgAuth<{ billId: string }>(async (_request, { orgId, params }) => {
  try {
    const { billId } = params;

    // Check if bill exists and belongs to organization
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
    });

    if (!bill || bill.organizationId !== orgId) {
      return notFound("Bill not found");
    }

    // Delete bill items first (if not cascading)
    await prisma.billItem.deleteMany({
      where: { billId },
    });

    // Delete bill
    await prisma.bill.delete({
      where: { id: billId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bill:", error);
    return NextResponse.json(
      { error: "Failed to delete bill" },
      { status: 500 }
    );
  }
});

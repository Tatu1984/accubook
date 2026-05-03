import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateVoucherSchema = z.object({
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  narration: z.string().optional(),
  date: z.string().optional(),
}).strict();

export const GET = withOrgAuth<{ voucherId: string }>(async (_request, { orgId, params }) => {
  try {
    const { voucherId } = params;

    const voucher = await prisma.voucher.findFirst({
      where: {
        id: voucherId,
        organizationId: orgId,
      },
      include: {
        voucherType: true,
        fiscalYear: true,
        branch: true,
        entries: {
          include: {
            ledger: {
              include: {
                group: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!voucher) {
      return notFound("Voucher not found");
    }

    return NextResponse.json(voucher);
  } catch (error) {
    console.error("Error fetching voucher:", error);
    return NextResponse.json(
      { error: "Failed to fetch voucher" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth<{ voucherId: string }>(async (request, { orgId, params, userId }) => {
  try {
    const { voucherId } = params;
    const body = await request.json();
    const validatedData = updateVoucherSchema.parse(body);

    // Check if voucher exists
    const existingVoucher = await prisma.voucher.findFirst({
      where: {
        id: voucherId,
        organizationId: orgId,
      },
    });

    if (!existingVoucher) {
      return notFound("Voucher not found");
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (validatedData.status) {
      updateData.status = validatedData.status;

      // Track approval
      if (validatedData.status === "APPROVED") {
        updateData.approvedBy = userId;
        updateData.approvedAt = new Date();
      }
    }

    if (validatedData.narration !== undefined) {
      updateData.narration = validatedData.narration;
    }

    if (validatedData.date) {
      updateData.date = new Date(validatedData.date);
    }

    const voucher = await prisma.voucher.update({
      where: { id: voucherId },
      data: updateData,
      include: {
        voucherType: true,
        entries: {
          include: {
            ledger: true,
          },
        },
      },
    });

    return NextResponse.json(voucher);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    console.error("Error updating voucher:", error);
    return NextResponse.json(
      { error: "Failed to update voucher" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth<{ voucherId: string }>(async (_request, { orgId, params }) => {
  try {
    const { voucherId } = params;

    // Check if voucher exists
    const voucher = await prisma.voucher.findFirst({
      where: {
        id: voucherId,
        organizationId: orgId,
      },
    });

    if (!voucher) {
      return notFound("Voucher not found");
    }

    // Don't allow deletion of approved vouchers
    if (voucher.status === "APPROVED") {
      return badRequest("Cannot delete an approved voucher. Cancel it instead.");
    }

    // Delete entries first, then voucher
    await prisma.$transaction([
      prisma.voucherEntry.deleteMany({
        where: { voucherId },
      }),
      prisma.voucher.delete({
        where: { id: voucherId },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting voucher:", error);
    return NextResponse.json(
      { error: "Failed to delete voucher" },
      { status: 500 }
    );
  }
});

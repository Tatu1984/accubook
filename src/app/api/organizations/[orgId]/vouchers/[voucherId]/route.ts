import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { z } from "zod";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateVoucherSchema = z.object({
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  narration: z.string().optional(),
  date: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; voucherId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, voucherId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }

    return NextResponse.json(voucher);
  } catch (error) {
    console.error("Error fetching voucher:", error);
    return NextResponse.json(
      { error: "Failed to fetch voucher" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; voucherId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, voucherId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (validatedData.status) {
      updateData.status = validatedData.status;

      // Track approval
      if (validatedData.status === "APPROVED") {
        updateData.approvedBy = session.user.id;
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
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating voucher:", error);
    return NextResponse.json(
      { error: "Failed to update voucher" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; voucherId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, voucherId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if voucher exists
    const voucher = await prisma.voucher.findFirst({
      where: {
        id: voucherId,
        organizationId: orgId,
      },
    });

    if (!voucher) {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }

    // Don't allow deletion of approved vouchers
    if (voucher.status === "APPROVED") {
      return NextResponse.json(
        { error: "Cannot delete an approved voucher. Cancel it instead." },
        { status: 400 }
      );
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
}

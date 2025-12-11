import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const updateLedgerSchema = z.object({
  name: z.string().min(1).optional(),
  groupId: z.string().optional(),
  code: z.string().optional(),
  description: z.string().optional(),
  openingBalance: z.number().optional(),
  openingBalanceType: z.enum(["DEBIT", "CREDIT"]).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; ledgerId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, ledgerId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ledger = await prisma.ledger.findFirst({
      where: {
        id: ledgerId,
        organizationId: orgId,
      },
      include: {
        group: true,
      },
    });

    if (!ledger) {
      return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
    }

    return NextResponse.json(ledger);
  } catch (error) {
    console.error("Error fetching ledger:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledger" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; ledgerId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, ledgerId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateLedgerSchema.parse(body);

    // Check if ledger exists and belongs to organization
    const existingLedger = await prisma.ledger.findFirst({
      where: {
        id: ledgerId,
        organizationId: orgId,
      },
    });

    if (!existingLedger) {
      return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
    }

    // Check for name uniqueness if name is being changed
    if (validatedData.name && validatedData.name !== existingLedger.name) {
      const nameExists = await prisma.ledger.findFirst({
        where: {
          organizationId: orgId,
          name: validatedData.name,
          NOT: { id: ledgerId },
        },
      });

      if (nameExists) {
        return NextResponse.json(
          { error: "A ledger with this name already exists" },
          { status: 400 }
        );
      }
    }

    const ledger = await prisma.ledger.update({
      where: { id: ledgerId },
      data: validatedData,
      include: {
        group: true,
      },
    });

    return NextResponse.json(ledger);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating ledger:", error);
    return NextResponse.json(
      { error: "Failed to update ledger" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; ledgerId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, ledgerId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if ledger exists and belongs to organization
    const ledger = await prisma.ledger.findFirst({
      where: {
        id: ledgerId,
        organizationId: orgId,
      },
    });

    if (!ledger) {
      return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
    }

    // Check if ledger has any voucher entries
    const hasEntries = await prisma.voucherEntry.findFirst({
      where: { ledgerId },
    });

    if (hasEntries) {
      // Soft delete by setting isActive to false
      await prisma.ledger.update({
        where: { id: ledgerId },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, softDeleted: true });
    }

    // Hard delete if no entries
    await prisma.ledger.delete({
      where: { id: ledgerId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting ledger:", error);
    return NextResponse.json(
      { error: "Failed to delete ledger" },
      { status: 500 }
    );
  }
}

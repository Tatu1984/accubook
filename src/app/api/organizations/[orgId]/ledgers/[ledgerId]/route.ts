import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateLedgerSchema = z.object({
  name: z.string().min(1).optional(),
  groupId: z.string().optional(),
  code: z.string().optional(),
  description: z.string().optional(),
  openingBalance: z.number().optional(),
  openingBalanceType: z.enum(["DEBIT", "CREDIT"]).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const GET = withOrgAuth<{ ledgerId: string }>(async (_request, { orgId, params }) => {
  try {
    const { ledgerId } = params;

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
      return notFound("Ledger not found");
    }

    return NextResponse.json(ledger);
  } catch (error) {
    console.error("Error fetching ledger:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledger" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth<{ ledgerId: string }>(async (request, { orgId, params }) => {
  try {
    const { ledgerId } = params;
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
      return notFound("Ledger not found");
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
        return badRequest("A ledger with this name already exists");
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
      return badRequest("Validation failed", error.issues);
    }
    console.error("Error updating ledger:", error);
    return NextResponse.json(
      { error: "Failed to update ledger" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth<{ ledgerId: string }>(async (_request, { orgId, params }) => {
  try {
    const { ledgerId } = params;

    // Check if ledger exists and belongs to organization
    const ledger = await prisma.ledger.findFirst({
      where: {
        id: ledgerId,
        organizationId: orgId,
      },
    });

    if (!ledger) {
      return notFound("Ledger not found");
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
});

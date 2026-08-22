import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateLedgerSchema = z.object({
  name: optional(z.string().min(1)),
  groupId: optional(z.string()),
  code: optional(z.string()),
  description: optional(z.string()),
  openingBalance: optional(z.number()),
  openingBalanceType: optional(z.enum(["DEBIT", "CREDIT"])),
  isActive: optional(z.boolean()),
}).strict();

/**
 * GET ?view=transactions returns the posted voucher entries hitting this
 * ledger, newest first, with a running balance.
 *
 * The ledgers screen offered "View Transactions" with nothing to call — the
 * only per-ledger read returned the master record and its group.
 */
export const GET = withOrgAuth<{ ledgerId: string }>(async (request, { orgId, params }) => {
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

    const { searchParams } = new URL(request.url);
    if (searchParams.get("view") === "transactions") {
      const limit = Math.min(
        parseInt(searchParams.get("limit") || "100", 10) || 100,
        500
      );

      const entries = await prisma.voucherEntry.findMany({
        where: {
          ledgerId,
          voucher: { organizationId: orgId, isPosted: true },
        },
        include: {
          voucher: {
            select: {
              id: true,
              voucherNumber: true,
              date: true,
              narration: true,
              voucherType: { select: { name: true } },
            },
          },
        },
        orderBy: [{ voucher: { date: "desc" } }, { createdAt: "desc" }],
        take: limit,
      });

      // Running balance is computed oldest-to-newest, then presented newest first.
      const chronological = [...entries].reverse();
      let running = Number(ledger.openingBalance ?? 0);
      const withBalance = chronological.map((entry) => {
        running += Number(entry.debitAmount) - Number(entry.creditAmount);
        return {
          id: entry.id,
          date: entry.voucher.date,
          voucherNumber: entry.voucher.voucherNumber,
          voucherType: entry.voucher.voucherType?.name ?? "Voucher",
          narration: entry.narration ?? entry.voucher.narration,
          debitAmount: entry.debitAmount,
          creditAmount: entry.creditAmount,
          balance: running,
        };
      });

      return NextResponse.json({
        ledger: { id: ledger.id, name: ledger.name, code: ledger.code },
        openingBalance: ledger.openingBalance,
        closingBalance: running,
        data: withBalance.reverse(),
      });
    }

    return NextResponse.json(ledger);
  } catch (error) {
    logger.error({ err: error }, "Error fetching ledger");
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
    logger.error({ err: error }, "Error updating ledger");
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
    logger.error({ err: error }, "Error deleting ledger");
    return NextResponse.json(
      { error: "Failed to delete ledger" },
      { status: 500 }
    );
  }
});

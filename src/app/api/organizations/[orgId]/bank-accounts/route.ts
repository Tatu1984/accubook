import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOUNT_TYPES = ["CURRENT", "SAVINGS", "CC", "OD"] as const;

const createBankAccountSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    bankName: z.string().min(1, "Bank name is required"),
    branch: z.string().optional(),
    accountNumber: z.string().min(1, "Account number is required"),
    ifscCode: z.string().optional(),
    swiftCode: z.string().optional(),
    accountType: z.enum(ACCOUNT_TYPES),
    openingBalance: z.number().finite().optional(),
  })
  .strict();

// currentBalance and openingBalance are intentionally NOT editable here —
// currentBalance is derived from posted payments/receipts; openingBalance is
// captured at creation and shifting it after the fact would silently restate
// the books. Use a journal voucher instead.
const updateBankAccountSchema = z
  .object({
    id: z.string().min(1, "Bank account ID is required"),
    name: z.string().min(1).optional(),
    bankName: z.string().min(1).optional(),
    branch: z.string().nullable().optional(),
    accountNumber: z.string().min(1).optional(),
    ifscCode: z.string().nullable().optional(),
    swiftCode: z.string().nullable().optional(),
    accountType: z.enum(ACCOUNT_TYPES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const GET = withOrgAuth(async (_request, { orgId }) => {
  try {
    const bankAccounts = await prisma.bankAccount.findMany({
      where: {
        organizationId: orgId,
      },
      include: {
        ledgers: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            receipts: true,
            payments: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(bankAccounts);
  } catch (error) {
    logger.error({ err: error }, "Error fetching bank accounts");
    return NextResponse.json(
      { error: "Failed to fetch bank accounts" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const data = createBankAccountSchema.parse(await request.json());
    const opening = data.openingBalance ?? 0;

    const bankAccount = await prisma.bankAccount.create({
      data: {
        organizationId: orgId,
        name: data.name,
        bankName: data.bankName,
        branch: data.branch,
        accountNumber: data.accountNumber,
        ifscCode: data.ifscCode,
        swiftCode: data.swiftCode,
        accountType: data.accountType,
        openingBalance: opening,
        currentBalance: opening,
      },
    });

    return NextResponse.json(bankAccount, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating bank account");
    return NextResponse.json(
      { error: "Failed to create bank account" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth(async (request, { orgId }) => {
  try {
    const { id, ...updateData } = updateBankAccountSchema.parse(await request.json());

    const existing = await prisma.bankAccount.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!existing) return notFound("Bank account not found");

    const bankAccount = await prisma.bankAccount.update({
      where: { id, organizationId: orgId },
      data: updateData,
    });

    return NextResponse.json(bankAccount);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating bank account");
    return NextResponse.json(
      { error: "Failed to update bank account" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return badRequest("Bank account ID is required");
    }

    // Check if bank account has transactions
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id, organizationId: orgId },
      include: {
        _count: {
          select: {
            receipts: true,
            payments: true,
          },
        },
      },
    });

    if (!bankAccount) {
      return notFound("Bank account not found");
    }

    if (bankAccount._count.receipts > 0 || bankAccount._count.payments > 0) {
      // Soft delete by marking as inactive
      await prisma.bankAccount.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ message: "Bank account deactivated", softDeleted: true });
    }

    await prisma.bankAccount.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Bank account deleted", softDeleted: false });
  } catch (error) {
    logger.error({ err: error }, "Error deleting bank account");
    return NextResponse.json(
      { error: "Failed to delete bank account" },
      { status: 500 }
    );
  }
});

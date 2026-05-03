import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const body = await request.json();

    const {
      name,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      swiftCode,
      accountType,
      openingBalance,
    } = body;

    if (!name || !bankName || !accountNumber || !accountType) {
      return badRequest("Name, bank name, account number, and account type are required");
    }

    const bankAccount = await prisma.bankAccount.create({
      data: {
        organizationId: orgId,
        name,
        bankName,
        branch,
        accountNumber,
        ifscCode,
        swiftCode,
        accountType,
        openingBalance: openingBalance || 0,
        currentBalance: openingBalance || 0,
      },
    });

    return NextResponse.json(bankAccount, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating bank account");
    return NextResponse.json(
      { error: "Failed to create bank account" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return badRequest("Bank account ID is required");
    }

    const bankAccount = await prisma.bankAccount.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: updateData,
    });

    return NextResponse.json(bankAccount);
  } catch (error) {
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

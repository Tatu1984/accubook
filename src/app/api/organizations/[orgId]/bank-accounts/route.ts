import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { getOrCreateBankLedger, getOrCreateNamedLedger } from "@/backend/utils/posting";
import { D } from "@/backend/utils/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOUNT_TYPES = ["CURRENT", "SAVINGS", "CC", "OD"] as const;

const createBankAccountSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    bankName: z.string().min(1, "Bank name is required"),
    branch: optional(z.string()),
    accountNumber: z.string().min(1, "Account number is required"),
    ifscCode: optional(z.string()),
    swiftCode: optional(z.string()),
    accountType: z.enum(ACCOUNT_TYPES),
    openingBalance: optional(z.number().finite()),
  })
  .strict();

// currentBalance and openingBalance are intentionally NOT editable here —
// currentBalance is derived from posted payments/receipts; openingBalance is
// captured at creation and shifting it after the fact would silently restate
// the books. Use a journal voucher instead.
const updateBankAccountSchema = z
  .object({
    id: z.string().min(1, "Bank account ID is required"),
    name: optional(z.string().min(1)),
    bankName: optional(z.string().min(1)),
    branch: z.string().nullable().optional(),
    accountNumber: optional(z.string().min(1)),
    ifscCode: z.string().nullable().optional(),
    swiftCode: z.string().nullable().optional(),
    accountType: optional(z.enum(ACCOUNT_TYPES)),
    isActive: optional(z.boolean()),
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

    /**
     * An opening balance has to reach the ledger, not just this table.
     *
     * Previously it was written to `bank_accounts` alone. The general
     * ledger knew nothing about it, so an account opened with 5,00,000
     * showed 4,66,300 in the bank register and a 33,700 *credit* in the
     * books — the company appeared overdrawn while holding cash, the
     * balance sheet reported negative assets, and reconciling the account
     * was impossible because the two sides disagreed by the opening
     * amount from the first day.
     *
     * The reporting stack already reads `Ledger.openingBalance`
     * (trial balance, balance sheet and cash flow all honour it), so the
     * fix is to populate it — together with its other half in Opening
     * Balance Equity, without which the trial balance would simply be out
     * by the same amount in the other direction.
     */
    const bankAccount = await prisma.$transaction(async (tx) => {
      const created = await tx.bankAccount.create({
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

      // The ledger is created either way, so the account is visible in the
      // chart of accounts before it has been transacted on.
      const bankLedger = await getOrCreateBankLedger(tx, orgId, created.id, created.name);

      if (opening !== 0) {
        const magnitude = D(Math.abs(opening));
        await tx.ledger.update({
          where: { id: bankLedger.id },
          data: {
            openingBalance: magnitude,
            // A negative opening balance is an overdraft: a credit balance
            // on what is otherwise an asset.
            openingBalanceType: opening > 0 ? "DR" : "CR",
            currentBalance: D(opening),
          },
        });

        const equity = await getOrCreateNamedLedger(
          tx,
          orgId,
          "Opening Balance Equity",
          "Capital Account"
        );
        // Accumulated across every account opened with a balance, so the
        // signed total is recovered before being re-expressed as DR or CR.
        const current = await tx.ledger.findUniqueOrThrow({
          where: { id: equity.id },
          select: { openingBalance: true, openingBalanceType: true },
        });
        const held = D(current.openingBalance ?? 0);
        const signedCredit = (current.openingBalanceType === "DR" ? held.negated() : held).plus(D(opening));
        await tx.ledger.update({
          where: { id: equity.id },
          data: {
            openingBalance: signedCredit.abs(),
            openingBalanceType: signedCredit.isNegative() ? "DR" : "CR",
          },
        });
      }

      return created;
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

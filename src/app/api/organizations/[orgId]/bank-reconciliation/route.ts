import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { z } from "zod";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Schema for importing bank transactions
const importTransactionSchema = z.object({
  bankAccountId: z.string(),
  transactions: z.array(z.object({
    date: z.string().transform(s => new Date(s)),
    description: z.string().optional(),
    referenceNo: z.string().optional(),
    debitAmount: z.number().default(0),
    creditAmount: z.number().default(0),
    balance: z.number().optional(),
  })),
});

// Schema for matching transactions
const matchTransactionSchema = z.object({
  bankTransactionId: z.string(),
  voucherId: z.string().optional(),
  action: z.enum(["match", "unmatch", "create_voucher"]),
});

// Schema for reconciliation
const reconciliationSchema = z.object({
  bankAccountId: z.string(),
  periodStart: z.string().transform(s => new Date(s)),
  periodEnd: z.string().transform(s => new Date(s)),
  statementBalance: z.number(),
  action: z.enum(["start", "complete"]),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const bankAccountId = searchParams.get("bankAccountId");
    const view = searchParams.get("view") || "summary"; // summary, transactions, unreconciled

    if (!bankAccountId) {
      // Return all bank accounts with reconciliation status
      const bankAccounts = await prisma.bankAccount.findMany({
        where: { organizationId: orgId, isActive: true },
        include: {
          _count: {
            select: {
              bankTransactions: {
                where: { isReconciled: false },
              },
            },
          },
        },
      });

      const accountsWithStatus = await Promise.all(
        bankAccounts.map(async (account) => {
          const lastRecon = await prisma.bankReconciliation.findFirst({
            where: { bankAccountId: account.id },
            orderBy: { periodEnd: "desc" },
          });

          return {
            id: account.id,
            name: account.name,
            bankName: account.bankName,
            accountNumber: account.accountNumber,
            currentBalance: Number(account.currentBalance),
            unreconciledCount: account._count.bankTransactions,
            lastReconciliation: lastRecon ? {
              periodEnd: lastRecon.periodEnd,
              status: lastRecon.status,
              statementBalance: Number(lastRecon.statementBalance),
              difference: Number(lastRecon.difference),
            } : null,
          };
        })
      );

      return NextResponse.json(accountsWithStatus);
    }

    // Get specific bank account data
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId: orgId },
    });

    if (!bankAccount) {
      return notFound("Bank account not found");
    }

    if (view === "transactions") {
      const startDate = searchParams.get("startDate")
        ? new Date(searchParams.get("startDate")!)
        : new Date(new Date().setMonth(new Date().getMonth() - 1));
      const endDate = searchParams.get("endDate")
        ? new Date(searchParams.get("endDate")!)
        : new Date();

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          bankAccountId,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: "desc" },
      });

      return NextResponse.json({
        bankAccount: {
          id: bankAccount.id,
          name: bankAccount.name,
          currentBalance: Number(bankAccount.currentBalance),
        },
        transactions: transactions.map(t => ({
          id: t.id,
          date: t.date,
          description: t.description,
          referenceNo: t.referenceNo,
          debitAmount: Number(t.debitAmount),
          creditAmount: Number(t.creditAmount),
          balance: Number(t.balance),
          isReconciled: t.isReconciled,
          reconciledAt: t.reconciledAt,
          matchedVoucherId: t.matchedVoucherId,
        })),
      });
    }

    if (view === "unreconciled") {
      // Get unreconciled bank transactions
      const bankTransactions = await prisma.bankTransaction.findMany({
        where: { bankAccountId, isReconciled: false },
        orderBy: { date: "desc" },
      });

      // Get unreconciled book transactions (vouchers with bank account)
      // Find ledger linked to this bank account
      const bankLedger = await prisma.ledger.findFirst({
        where: { bankAccountId, organizationId: orgId },
      });

      let bookEntries: Array<{
        id: string;
        voucherId: string;
        voucherNumber: string;
        date: Date;
        description: string;
        debitAmount: number;
        creditAmount: number;
        isMatched: boolean;
      }> = [];

      if (bankLedger) {
        const matchedVoucherIds = bankTransactions
          .filter(t => t.matchedVoucherId)
          .map(t => t.matchedVoucherId!);

        const entries = await prisma.voucherEntry.findMany({
          where: {
            ledgerId: bankLedger.id,
            voucher: {
              status: { in: ["APPROVED", "DRAFT"] },
              id: { notIn: matchedVoucherIds },
            },
          },
          include: {
            voucher: {
              select: {
                id: true,
                voucherNumber: true,
                date: true,
                narration: true,
              },
            },
          },
          orderBy: { voucher: { date: "desc" } },
          take: 100,
        });

        bookEntries = entries.map(e => ({
          id: e.id,
          voucherId: e.voucher.id,
          voucherNumber: e.voucher.voucherNumber,
          date: e.voucher.date,
          description: e.narration || e.voucher.narration || "",
          debitAmount: Number(e.debitAmount),
          creditAmount: Number(e.creditAmount),
          isMatched: false,
        }));
      }

      return NextResponse.json({
        bankAccount: {
          id: bankAccount.id,
          name: bankAccount.name,
          currentBalance: Number(bankAccount.currentBalance),
        },
        bankTransactions: bankTransactions.map(t => ({
          id: t.id,
          date: t.date,
          description: t.description,
          referenceNo: t.referenceNo,
          debitAmount: Number(t.debitAmount),
          creditAmount: Number(t.creditAmount),
          balance: Number(t.balance),
          category: t.category,
        })),
        bookEntries,
        summary: {
          unreconciledBankCount: bankTransactions.length,
          unreconciledBookCount: bookEntries.length,
          unreconciledBankTotal: bankTransactions.reduce(
            (sum, t) => sum + Number(t.creditAmount) - Number(t.debitAmount),
            0
          ),
          unreconciledBookTotal: bookEntries.reduce(
            (sum, e) => sum + e.debitAmount - e.creditAmount,
            0
          ),
        },
      });
    }

    // Default: summary view
    const lastRecon = await prisma.bankReconciliation.findFirst({
      where: { bankAccountId },
      orderBy: { periodEnd: "desc" },
    });

    const unreconciledTransactions = await prisma.bankTransaction.count({
      where: { bankAccountId, isReconciled: false },
    });

    const recentTransactions = await prisma.bankTransaction.findMany({
      where: { bankAccountId },
      orderBy: { date: "desc" },
      take: 10,
    });

    return NextResponse.json({
      bankAccount: {
        id: bankAccount.id,
        name: bankAccount.name,
        bankName: bankAccount.bankName,
        accountNumber: bankAccount.accountNumber,
        currentBalance: Number(bankAccount.currentBalance),
        openingBalance: Number(bankAccount.openingBalance),
      },
      lastReconciliation: lastRecon ? {
        id: lastRecon.id,
        periodStart: lastRecon.periodStart,
        periodEnd: lastRecon.periodEnd,
        statementBalance: Number(lastRecon.statementBalance),
        bookBalance: Number(lastRecon.bookBalance),
        difference: Number(lastRecon.difference),
        status: lastRecon.status,
        completedAt: lastRecon.completedAt,
      } : null,
      unreconciledCount: unreconciledTransactions,
      recentTransactions: recentTransactions.map(t => ({
        id: t.id,
        date: t.date,
        description: t.description,
        debitAmount: Number(t.debitAmount),
        creditAmount: Number(t.creditAmount),
        isReconciled: t.isReconciled,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching reconciliation data");
    return NextResponse.json(
      { error: "Failed to fetch reconciliation data" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "import": {
        const validationResult = importTransactionSchema.safeParse(body);
        if (!validationResult.success) {
          return badRequest("Validation failed", validationResult.error.issues);
        }

        const { bankAccountId, transactions } = validationResult.data;

        // Verify bank account belongs to org
        const bankAccount = await prisma.bankAccount.findFirst({
          where: { id: bankAccountId, organizationId: orgId },
        });

        if (!bankAccount) {
          return notFound("Bank account not found");
        }

        // Import transactions
        const created = await prisma.bankTransaction.createMany({
          data: transactions.map(t => ({
            bankAccountId,
            date: t.date,
            description: t.description || "",
            referenceNo: t.referenceNo,
            debitAmount: t.debitAmount,
            creditAmount: t.creditAmount,
            balance: t.balance || 0,
            importSource: "CSV",
          })),
          skipDuplicates: true,
        });

        return NextResponse.json({
          message: `Imported ${created.count} transactions`,
          count: created.count,
        });
      }

      case "match": {
        const validationResult = matchTransactionSchema.safeParse(body);
        if (!validationResult.success) {
          return badRequest("Validation failed", validationResult.error.issues);
        }

        const { bankTransactionId, voucherId, action: matchAction } = validationResult.data;

        const bankTransaction = await prisma.bankTransaction.findFirst({
          where: { id: bankTransactionId },
          include: { bankAccount: true },
        });

        if (!bankTransaction || bankTransaction.bankAccount.organizationId !== orgId) {
          return notFound("Transaction not found");
        }

        if (matchAction === "match" && voucherId) {
          await prisma.bankTransaction.update({
            where: { id: bankTransactionId },
            data: {
              matchedVoucherId: voucherId,
              isReconciled: true,
              reconciledAt: new Date(),
            },
          });
          return NextResponse.json({ message: "Transaction matched successfully" });
        }

        if (matchAction === "unmatch") {
          await prisma.bankTransaction.update({
            where: { id: bankTransactionId },
            data: {
              matchedVoucherId: null,
              isReconciled: false,
              reconciledAt: null,
            },
          });
          return NextResponse.json({ message: "Transaction unmatched" });
        }

        return badRequest("Invalid match action");
      }

      case "auto-match": {
        const { bankAccountId } = body;

        const bankAccount = await prisma.bankAccount.findFirst({
          where: { id: bankAccountId, organizationId: orgId },
        });

        if (!bankAccount) {
          return notFound("Bank account not found");
        }

        // Get bank ledger
        const bankLedger = await prisma.ledger.findFirst({
          where: { bankAccountId, organizationId: orgId },
        });

        if (!bankLedger) {
          return badRequest("No ledger linked to bank account");
        }

        // Get unreconciled bank transactions
        const bankTransactions = await prisma.bankTransaction.findMany({
          where: { bankAccountId, isReconciled: false },
        });

        // Get unmatched voucher entries for this bank
        const matchedVoucherIds = bankTransactions
          .filter(t => t.matchedVoucherId)
          .map(t => t.matchedVoucherId!);

        const voucherEntries = await prisma.voucherEntry.findMany({
          where: {
            ledgerId: bankLedger.id,
            voucher: {
              status: { in: ["APPROVED", "DRAFT"] },
              id: { notIn: matchedVoucherIds },
            },
          },
          include: {
            voucher: {
              select: { id: true, date: true, narration: true, referenceNo: true },
            },
          },
        });

        let matchedCount = 0;

        // Try to match by amount and date (within 3 days)
        for (const bankTx of bankTransactions) {
          const bankAmount = Number(bankTx.creditAmount) - Number(bankTx.debitAmount);

          const potentialMatch = voucherEntries.find(entry => {
            const bookAmount = Number(entry.debitAmount) - Number(entry.creditAmount);

            // Amount should match
            if (Math.abs(bankAmount - bookAmount) > 0.01) return false;

            // Date should be within 3 days
            const bankDate = new Date(bankTx.date);
            const bookDate = new Date(entry.voucher.date);
            const daysDiff = Math.abs(bankDate.getTime() - bookDate.getTime()) / (1000 * 60 * 60 * 24);

            return daysDiff <= 3;
          });

          if (potentialMatch) {
            await prisma.bankTransaction.update({
              where: { id: bankTx.id },
              data: {
                matchedVoucherId: potentialMatch.voucher.id,
                isReconciled: true,
                reconciledAt: new Date(),
              },
            });

            // Remove from available matches
            const index = voucherEntries.indexOf(potentialMatch);
            voucherEntries.splice(index, 1);
            matchedCount++;
          }
        }

        return NextResponse.json({
          message: `Auto-matched ${matchedCount} transactions`,
          matchedCount,
          remainingUnmatched: bankTransactions.length - matchedCount,
        });
      }

      case "reconcile": {
        const validationResult = reconciliationSchema.safeParse(body);
        if (!validationResult.success) {
          return badRequest("Validation failed", validationResult.error.issues);
        }

        const { bankAccountId, periodStart, periodEnd, statementBalance, action: reconAction } = validationResult.data;

        const bankAccount = await prisma.bankAccount.findFirst({
          where: { id: bankAccountId, organizationId: orgId },
        });

        if (!bankAccount) {
          return notFound("Bank account not found");
        }

        // Calculate book balance
        const bankLedger = await prisma.ledger.findFirst({
          where: { bankAccountId, organizationId: orgId },
        });

        let bookBalance = Number(bankAccount.openingBalance);

        if (bankLedger) {
          const entries = await prisma.voucherEntry.findMany({
            where: {
              ledgerId: bankLedger.id,
              voucher: {
                date: { lte: periodEnd },
                status: { in: ["APPROVED", "DRAFT"] },
              },
            },
          });

          entries.forEach(entry => {
            bookBalance += Number(entry.debitAmount) - Number(entry.creditAmount);
          });
        }

        const difference = statementBalance - bookBalance;

        if (reconAction === "start") {
          const reconciliation = await prisma.bankReconciliation.create({
            data: {
              bankAccountId,
              periodStart,
              periodEnd,
              statementBalance,
              bookBalance,
              difference,
              status: "IN_PROGRESS",
            },
          });

          return NextResponse.json({
            id: reconciliation.id,
            statementBalance,
            bookBalance,
            difference,
            status: "IN_PROGRESS",
          });
        }

        if (reconAction === "complete") {
          // Get or create reconciliation
          let reconciliation = await prisma.bankReconciliation.findFirst({
            where: {
              bankAccountId,
              periodEnd,
              status: "IN_PROGRESS",
            },
          });

          if (!reconciliation) {
            reconciliation = await prisma.bankReconciliation.create({
              data: {
                bankAccountId,
                periodStart,
                periodEnd,
                statementBalance,
                bookBalance,
                difference,
                status: "IN_PROGRESS",
              },
            });
          }

          // Update to completed
          const completed = await prisma.bankReconciliation.update({
            where: { id: reconciliation.id },
            data: {
              statementBalance,
              bookBalance,
              difference,
              status: "COMPLETED",
              completedAt: new Date(),
              completedBy: userId,
            },
          });

          return NextResponse.json({
            id: completed.id,
            status: "COMPLETED",
            completedAt: completed.completedAt,
            statementBalance: Number(completed.statementBalance),
            bookBalance: Number(completed.bookBalance),
            difference: Number(completed.difference),
          });
        }

        return badRequest("Invalid reconciliation action");
      }

      default:
        return badRequest("Invalid action");
    }
  } catch (error) {
    logger.error({ err: error }, "Error in reconciliation");
    return NextResponse.json(
      { error: "Failed to process reconciliation" },
      { status: 500 }
    );
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { reconcileBankTransactions } from "@/backend/services/banking/reconcile";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  bankAccountId: z.string().min(1, "bankAccountId is required"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST /api/organizations/[orgId]/banking/reconcile?bankAccountId=...&from=...&to=...
 *
 * Runs the auto-reconciliation matcher: tries to match every unreconciled
 * bank transaction against an existing payment (debit) or receipt (credit)
 * on the same bank account. Returns counts + low-confidence matches the
 * UI can prompt the user to confirm.
 */
export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      bankAccountId: url.searchParams.get("bankAccountId"),
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) {
      return badRequest("Invalid query parameters", parsed.error.issues);
    }

    const fromDate = parsed.data.from
      ? new Date(`${parsed.data.from}T00:00:00.000Z`)
      : undefined;
    const toDate = parsed.data.to
      ? new Date(`${parsed.data.to}T23:59:59.999Z`)
      : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      return badRequest("`from` must be on or before `to`");
    }

    const result = await prisma.$transaction(async (tx) => {
      const r = await reconcileBankTransactions(tx, {
        organizationId: orgId,
        bankAccountId: parsed.data.bankAccountId,
        fromDate,
        toDate,
      });
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "UPDATE",
        entityType: "BankReconciliation",
        newData: {
          bankAccountId: parsed.data.bankAccountId,
          considered: r.considered,
          matched: r.matched,
          ambiguous: r.ambiguous,
        },
      });
      return r;
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "Bank reconciliation failed");
    return NextResponse.json(
      { error: "Bank reconciliation failed", message: (error as Error).message },
      { status: 500 }
    );
  }
});

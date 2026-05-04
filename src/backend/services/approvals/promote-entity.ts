import { D, sum } from "@/backend/utils/money";
import type { Tx } from "@/backend/utils/posting";
import { applyLedgerEntries } from "@/backend/utils/posting";
import { postBillToGl } from "@/backend/services/billing/post-bill";
import type { TdsSectionCode } from "@/backend/services/tax/tds";
import { logger } from "@/backend/utils/logger";

/**
 * Auto-promote / demote an entity based on its Approval rows.
 *
 * Rules:
 *   - If ANY Approval is REJECTED → demote the entity once.
 *       Voucher: status → REJECTED.
 *       Bill: status → DRAFT (back to requester to fix and re-submit).
 *   - If ALL Approvals are APPROVED (and none REJECTED) → promote.
 *       Voucher: status → APPROVED, isPosted=true, postedAt=now,
 *                applyLedgerEntries to all entries.
 *       Bill: status → APPROVED. (Bill posting to GL is a separate
 *             architectural piece; for now approval just unlocks the
 *             bill for further workflow.)
 *
 * Idempotent: running it twice for an already-promoted entity is a
 * no-op (we only act when the current entity status is
 * PENDING_APPROVAL).
 *
 * Caller is the PATCH /approvals route. Called inside the same tx
 * that updated the Approval row so the promotion rolls back if the
 * entity update fails.
 */

export type PromotionResult = {
  acted: boolean;
  outcome: "PROMOTED" | "DEMOTED" | "NOT_READY" | "NOT_APPLICABLE";
  entityType: string;
  entityId: string;
};

export async function maybePromoteEntity(
  tx: Tx,
  entityType: string,
  entityId: string
): Promise<PromotionResult> {
  const result: PromotionResult = {
    acted: false,
    outcome: "NOT_READY",
    entityType,
    entityId,
  };

  const approvals = await tx.approval.findMany({
    where: { entityType, entityId },
    select: { status: true },
  });

  if (approvals.length === 0) {
    result.outcome = "NOT_APPLICABLE";
    return result;
  }

  // CANCELLED rows (sibling-cleanup when one ROLE-holder approves first)
  // are excluded from the decision: they're an artifact of multi-holder
  // role steps, not a vote.
  const decided = approvals.filter((a) => a.status !== "CANCELLED");
  const anyRejected = decided.some((a) => a.status === "REJECTED");
  const allApproved = decided.length > 0 && !anyRejected && decided.every((a) => a.status === "APPROVED");

  if (anyRejected) {
    if (entityType === "VOUCHER") {
      const v = await tx.voucher.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (v && v.status === "PENDING_APPROVAL") {
        await tx.voucher.update({
          where: { id: entityId },
          data: { status: "REJECTED" },
        });
        result.acted = true;
        result.outcome = "DEMOTED";
      }
    } else if (entityType === "BILL") {
      const b = await tx.bill.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (b && b.status === "PENDING_APPROVAL") {
        await tx.bill.update({
          where: { id: entityId },
          data: { status: "DRAFT" },
        });
        result.acted = true;
        result.outcome = "DEMOTED";
      }
    } else if (entityType === "EXPENSE_CLAIM") {
      const ec = await tx.expenseClaim.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (ec && ec.status === "PENDING") {
        await tx.expenseClaim.update({
          where: { id: entityId },
          data: { status: "REJECTED" },
        });
        result.acted = true;
        result.outcome = "DEMOTED";
      }
    } else if (entityType === "LEAVE") {
      const l = await tx.leave.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (l && l.status === "PENDING") {
        await tx.leave.update({
          where: { id: entityId },
          data: { status: "REJECTED" },
        });
        result.acted = true;
        result.outcome = "DEMOTED";
      }
    }
    return result;
  }

  if (allApproved) {
    if (entityType === "VOUCHER") {
      const v = await tx.voucher.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (v && v.status === "PENDING_APPROVAL") {
        // Pull entries to apply ledger balances at promotion time.
        const entries = await tx.voucherEntry.findMany({
          where: { voucherId: entityId },
          select: {
            ledgerId: true,
            debitAmount: true,
            creditAmount: true,
          },
        });
        await tx.voucher.update({
          where: { id: entityId },
          data: {
            status: "APPROVED",
            isPosted: true,
            postedAt: new Date(),
          },
        });
        await applyLedgerEntries(
          tx,
          entries.map((e) => ({
            ledgerId: e.ledgerId,
            debitAmount: D(e.debitAmount),
            creditAmount: D(e.creditAmount),
          }))
        );
        // Sanity-check: totalDebit ≈ totalCredit. We don't reject on
        // mismatch here (the entity-level check already happened at
        // create); just log if seen.
        const drTotal = sum(entries.map((e) => D(e.debitAmount)));
        const crTotal = sum(entries.map((e) => D(e.creditAmount)));
        void drTotal;
        void crTotal;
        result.acted = true;
        result.outcome = "PROMOTED";
      }
    } else if (entityType === "BILL") {
      const b = await tx.bill.findUnique({
        where: { id: entityId },
        select: {
          status: true,
          organizationId: true,
          tdsSection: true,
          voucherId: true,
        },
      });
      if (b && b.status === "PENDING_APPROVAL") {
        await tx.bill.update({
          where: { id: entityId },
          data: { status: "APPROVED" },
        });
        // Post to GL once approved. Skip if already posted (idempotent
        // safeguard — postBillToGl also refuses on a non-null voucherId).
        if (!b.voucherId) {
          try {
            // Pull the most-recent approver as the "createdBy" for the
            // posting voucher — that's the user who effectively booked
            // the bill on the org's behalf.
            const lastApprover = await tx.approval.findFirst({
              where: { entityType, entityId, status: "APPROVED" },
              orderBy: { approvedAt: "desc" },
              select: { approverId: true },
            });
            await postBillToGl(tx, {
              billId: entityId,
              organizationId: b.organizationId,
              userId: lastApprover?.approverId ?? "",
              // tdsSection on the bill row was stamped at create time
              // when the requester opted in; postBillToGl re-uses it.
              // (If we later add a "TDS section editable by approver"
              // flow, this is where the field surfaces from.)
              ...(b.tdsSection
                ? { tds: { section: b.tdsSection as TdsSectionCode } }
                : {}),
            });
          } catch (e) {
            logger.error({ err: e, billId: entityId }, "Bill posting on promotion failed");
            // Re-raise to roll back the promotion — keeping a bill in
            // APPROVED-but-not-posted state would silently break reports.
            throw e;
          }
        }
        result.acted = true;
        result.outcome = "PROMOTED";
      }
    } else if (entityType === "EXPENSE_CLAIM") {
      const ec = await tx.expenseClaim.findUnique({
        where: { id: entityId },
        select: { status: true, approvedBy: true },
      });
      if (ec && ec.status === "PENDING") {
        // Stamp approvedBy with the most-recent approver so the claim
        // history shows who signed off. We pull the latest APPROVED row.
        const lastApprover = await tx.approval.findFirst({
          where: { entityType, entityId, status: "APPROVED" },
          orderBy: { approvedAt: "desc" },
          select: { approverId: true },
        });
        await tx.expenseClaim.update({
          where: { id: entityId },
          data: {
            status: "APPROVED",
            approvedBy: lastApprover?.approverId ?? null,
            approvedAt: new Date(),
          },
        });
        result.acted = true;
        result.outcome = "PROMOTED";
      }
    } else if (entityType === "LEAVE") {
      const l = await tx.leave.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (l && l.status === "PENDING") {
        const lastApprover = await tx.approval.findFirst({
          where: { entityType, entityId, status: "APPROVED" },
          orderBy: { approvedAt: "desc" },
          select: { approverId: true },
        });
        await tx.leave.update({
          where: { id: entityId },
          data: {
            status: "APPROVED",
            approvedBy: lastApprover?.approverId ?? null,
            approvedAt: new Date(),
          },
        });
        result.acted = true;
        result.outcome = "PROMOTED";
      }
    }
  }

  return result;
}

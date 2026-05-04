import { D, type DecimalLike } from "@/backend/utils/money";
import type { Tx } from "@/backend/utils/posting";

/**
 * Approval routing.
 *
 * When an entity (Voucher, Bill, ExpenseClaim, ...) is created in a
 * pending state, look up the active ApprovalWorkflow for that entity
 * type and create the per-step Approval rows. Each row is assigned to
 * one or more approvers based on the step's approverType:
 *
 *   USER    — single Approval row, approverId = step.approverId.
 *   ROLE    — one Approval row per user holding that role in the org
 *             (any holder can approve; the inbox shows it to all of
 *             them; once one approves the rest auto-cancel — caller
 *             is responsible for that follow-up).
 *   MANAGER — Not yet implemented. We skip these steps with a TODO
 *             so the workflow doesn't silently miss approvers when
 *             the manager relationship isn't set.
 *
 * `amountLimit` semantics: when set, this step is required only when
 * the entity's amount ≥ the limit. Steps without a limit are always
 * required. This lets you build "up to ₹10k auto-approve, ₹10k–₹1L
 * needs CFO, > ₹1L needs board" by adding steps with rising limits.
 */

export type RouteEntityOptions = {
  organizationId: string;
  entityType: "VOUCHER" | "BILL" | "INVOICE" | "EXPENSE_CLAIM" | "PURCHASE_ORDER" | "LEAVE";
  entityId: string;
  requesterId: string;
  /** Total amount the entity is being approved for. Drives `amountLimit` checks. */
  amount?: DecimalLike;
};

export type RouteEntityResult = {
  /** ID of the workflow that matched (null when none did). */
  workflowId: string | null;
  /** Number of Approval rows actually created. */
  approvalsCreated: number;
  /** Steps that were silently skipped (with reason). */
  skipped: Array<{ stepNumber: number; reason: string }>;
};

export async function routeEntityForApproval(
  tx: Tx,
  opts: RouteEntityOptions
): Promise<RouteEntityResult> {
  const result: RouteEntityResult = {
    workflowId: null,
    approvalsCreated: 0,
    skipped: [],
  };

  // Pick the first active workflow for this entity type. The schema
  // supports `conditions` JSON for matching; for now we don't evaluate
  // them — first-active wins. Multi-workflow conditional matching is
  // a follow-up.
  const workflow = await tx.approvalWorkflow.findFirst({
    where: {
      organizationId: opts.organizationId,
      entityType: opts.entityType,
      isActive: true,
    },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
    },
  });
  if (!workflow) return result;
  result.workflowId = workflow.id;

  const amount = opts.amount !== undefined ? D(opts.amount) : null;

  for (const step of workflow.steps) {
    // Amount-limit gate.
    if (step.amountLimit && amount && amount.lessThan(D(step.amountLimit))) {
      result.skipped.push({
        stepNumber: step.stepNumber,
        reason: `amount ${amount.toString()} below step limit ${step.amountLimit.toString()}`,
      });
      continue;
    }

    if (step.approverType === "USER") {
      if (!step.approverId) {
        result.skipped.push({
          stepNumber: step.stepNumber,
          reason: "USER step has no approverId",
        });
        continue;
      }
      await tx.approval.create({
        data: {
          entityType: opts.entityType,
          entityId: opts.entityId,
          stepNumber: step.stepNumber,
          approverId: step.approverId,
          requesterId: opts.requesterId,
          status: "PENDING",
        },
      });
      result.approvalsCreated++;
    } else if (step.approverType === "ROLE") {
      if (!step.approverId) {
        result.skipped.push({
          stepNumber: step.stepNumber,
          reason: "ROLE step has no approverId (role id)",
        });
        continue;
      }
      const orgUsers = await tx.organizationUser.findMany({
        where: {
          organizationId: opts.organizationId,
          roleId: step.approverId,
          isActive: true,
        },
        select: { userId: true },
      });
      if (orgUsers.length === 0) {
        result.skipped.push({
          stepNumber: step.stepNumber,
          reason: `no active users hold role ${step.approverId}`,
        });
        continue;
      }
      for (const ou of orgUsers) {
        await tx.approval.create({
          data: {
            entityType: opts.entityType,
            entityId: opts.entityId,
            stepNumber: step.stepNumber,
            approverId: ou.userId,
            requesterId: opts.requesterId,
            status: "PENDING",
          },
        });
        result.approvalsCreated++;
      }
    } else if (step.approverType === "MANAGER") {
      // Not yet implemented — would resolve from Employee.reportingTo.
      result.skipped.push({
        stepNumber: step.stepNumber,
        reason: "MANAGER approver type not yet implemented",
      });
    }
  }

  return result;
}

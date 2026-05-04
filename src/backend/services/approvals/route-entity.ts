import { D, type DecimalLike } from "@/backend/utils/money";
import type { Tx } from "@/backend/utils/posting";
import { sendApprovalRequestEmail } from "@/backend/services/email/send";
import { logger } from "@/backend/utils/logger";
import type { PrismaClient } from "@/generated/prisma";

/**
 * Approval routing.
 *
 * When an entity (Voucher, Bill, ExpenseClaim, ...) is created in a
 * pending state, look up the active ApprovalWorkflow for that entity
 * type and create the per-step Approval rows. Each row is assigned to
 * one or more approvers based on the step's approverType:
 *
 *   USER    — single Approval row, approverId = step.approverId.
 *             Validated to be an active OrganizationUser of the
 *             entity's org (cross-tenant defense).
 *   ROLE    — one Approval row per user holding that role in the org
 *             (any holder can approve; the inbox shows it to all of
 *             them; the PATCH /approvals route auto-CANCELLs the
 *             siblings when one approver decides).
 *   MANAGER — resolves the requester's `Employee.userId` →
 *             `Employee.reportingTo` → manager's `Employee.userId`.
 *             Skipped with a logged reason if the requester has no
 *             Employee row or no reportingTo configured (won't
 *             silently lose approvers).
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
  /**
   * Approver user-ids notified by email post-tx (deduped). Populated by
   * `notifyApprovers` after the routing tx commits, NOT inside the
   * routing tx itself — email sending shouldn't hold row locks.
   */
  notifiedApproverIds?: string[];
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
      // Cross-tenant defense: never route an Approval to a user outside
      // the entity's org. The workflow create UI should prevent this,
      // but enforce at write time so a corrupted workflow row can't
      // leak entities across orgs.
      const isMember = await tx.organizationUser.findUnique({
        where: {
          organizationId_userId: {
            organizationId: opts.organizationId,
            userId: step.approverId,
          },
        },
        select: { isActive: true },
      });
      if (!isMember || !isMember.isActive) {
        result.skipped.push({
          stepNumber: step.stepNumber,
          reason: `USER step skipped — approverId is not an active member of org ${opts.organizationId}`,
        });
        continue;
      }
      await tx.approval.create({
        data: {
          organizationId: opts.organizationId,
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
            organizationId: opts.organizationId,
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
      // Resolve from Employee.reportingTo. Requires the requester to
      // be linked to an Employee row (via Employee.userId). Skip if
      // missing — the workflow won't auto-route to a non-existent
      // manager.
      const requesterEmployee = await tx.employee.findFirst({
        where: { organizationId: opts.organizationId, userId: opts.requesterId },
        select: { reportingTo: true },
      });
      if (!requesterEmployee?.reportingTo) {
        result.skipped.push({
          stepNumber: step.stepNumber,
          reason: "MANAGER step skipped — requester has no Employee.reportingTo configured",
        });
        continue;
      }
      const manager = await tx.employee.findUnique({
        where: { id: requesterEmployee.reportingTo },
        select: { userId: true },
      });
      if (!manager?.userId) {
        result.skipped.push({
          stepNumber: step.stepNumber,
          reason: "MANAGER step skipped — manager Employee has no linked user",
        });
        continue;
      }
      await tx.approval.create({
        data: {
          organizationId: opts.organizationId,
          entityType: opts.entityType,
          entityId: opts.entityId,
          stepNumber: step.stepNumber,
          approverId: manager.userId,
          requesterId: opts.requesterId,
          status: "PENDING",
        },
      });
      result.approvalsCreated++;
    }
  }

  return result;
}

/**
 * Send "you have an approval waiting" emails to every PENDING approver
 * for the given entity. Call AFTER the routing tx commits — uses the
 * normal Prisma client (not the tx) and tolerates email failures.
 *
 * Caller provides the entity label + amount + requester name so the
 * email body has useful context. Pass through the `prisma` client at
 * the call site to avoid coupling to the tx.
 */
export async function notifyNewApprovers(
  prisma: PrismaClient,
  ctx: {
    entityType: string;
    entityId: string;
    entityLabel: string;
    amount?: string;
    requesterName: string;
  }
): Promise<string[]> {
  const rows = await prisma.approval.findMany({
    where: {
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      status: "PENDING",
    },
    include: {
      approver: { select: { id: true, name: true, email: true } },
    },
  });

  const seen = new Set<string>();
  const notified: string[] = [];

  for (const row of rows) {
    if (seen.has(row.approverId)) continue;
    seen.add(row.approverId);
    if (!row.approver?.email) continue;
    try {
      await sendApprovalRequestEmail({
        approverEmail: row.approver.email,
        approverName: row.approver.name ?? undefined,
        requesterName: ctx.requesterName,
        entityType: ctx.entityType,
        entityLabel: ctx.entityLabel,
        amount: ctx.amount,
      });
      notified.push(row.approverId);
    } catch (e) {
      logger.error({ err: e, approverId: row.approverId }, "Approval email failed");
    }
  }
  return notified;
}

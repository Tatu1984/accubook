import type { Prisma } from "@/generated/prisma";
import type { Tx } from "@/backend/utils/posting";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "POST"
  | "REVERSE"
  | "ISSUE"     // raw materials issued to a work order
  | "COMPLETE"  // work order produced finished good
  | "EXPORT"
  | "LOGIN"
  | "LOGOUT";

export type AuditOptions = {
  organizationId: string;
  userId: string;
  action: AuditAction;
  entityType: string;       // e.g. "Voucher", "Invoice", "Bill", "Payment", "Receipt"
  entityId?: string;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Write an entry to the audit log.
 *
 * Best practice: call this inside the same `prisma.$transaction` that performs
 * the underlying mutation, so the audit row rolls back if the mutation fails.
 * The transaction client signature is `tx: Tx` (from posting.ts) so it works
 * with Prisma's interactive transactions.
 *
 * Schema sets `oldData` and `newData` as `Json?`. We accept `unknown` and let
 * Prisma's JSON serializer handle Decimal / Date / nested objects.
 */
export async function writeAudit(tx: Tx, opts: AuditOptions): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: opts.organizationId,
      userId: opts.userId,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      oldData: opts.oldData as Prisma.InputJsonValue | undefined,
      newData: opts.newData as Prisma.InputJsonValue | undefined,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
    },
  });
}

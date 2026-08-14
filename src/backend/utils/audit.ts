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
      ...(await requestOrigin(opts)),
    },
  });
}

/**
 * Fill in who the request came from, so callers don't have to.
 *
 * Every existing call site omitted `ipAddress` / `userAgent`, which meant
 * every row in the audit log carried a null IP — the one column an auditor
 * actually asks about. Reading the incoming request here fixes the whole
 * table at once instead of threading a request object through every
 * service that writes an entry.
 *
 * An explicit value always wins: sign-in records the IP itself, because it
 * already holds the request that rate limiting was keyed on.
 *
 * `next/headers` is imported lazily and defensively — it throws outside a
 * request scope, and audit entries are also written from cron sweeps, the
 * seed script and tests, where there is no request and no IP to record.
 */
async function requestOrigin(
  opts: Pick<AuditOptions, "ipAddress" | "userAgent">
): Promise<{ ipAddress?: string; userAgent?: string }> {
  if (opts.ipAddress && opts.userAgent) {
    return { ipAddress: opts.ipAddress, userAgent: opts.userAgent };
  }
  let ipAddress = opts.ipAddress;
  let userAgent = opts.userAgent;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    if (!ipAddress) {
      // Behind Vercel the socket address is the proxy; the client is the
      // first entry of X-Forwarded-For.
      const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
      ipAddress = forwarded || h.get("x-real-ip")?.trim() || undefined;
    }
    if (!userAgent) userAgent = h.get("user-agent") ?? undefined;
  } catch {
    // No request in scope — leave both unset rather than inventing a value.
  }
  return { ipAddress, userAgent };
}

import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, forbidden, notFound } from "@/backend/utils/with-org-auth";
import { hasPermission } from "@/backend/utils/permissions";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/organizations/[orgId]/api-keys/[keyId]
 *
 * Two modes:
 *   - Default: soft revoke. Sets isActive=false + revokedAt now. The row
 *     stays in the DB so the prefix and creation metadata remain
 *     identifiable in audit logs.
 *   - `?force=true`: HARD delete. Only allowed when the key has already
 *     been revoked (i.e. isActive=false). Removes the row entirely.
 *     The AuditLog entry for the prior revoke (and the original
 *     creation) stays — it carries the keyPrefix as a stable
 *     identifier for forensic traceability.
 *
 * Both modes are admin-only and refuse API-key auth (only humans with
 * sessions can revoke / delete keys).
 */
export const DELETE = withOrgAuth<{ keyId: string }>(
  async (request, { orgId, userId, orgUser, params, apiKey }) => {
    if (apiKey) {
      return forbidden("API keys cannot revoke other API keys");
    }
    if (!hasPermission(orgUser, "settings", "delete") && !hasPermission(orgUser, "*", "*")) {
      return forbidden("Only admins can revoke API keys");
    }

    const url = new URL(request.url);
    const reason = url.searchParams.get("reason") || null;
    const force = url.searchParams.get("force") === "true";

    const target = await prisma.apiKey.findFirst({
      where: { id: params.keyId, organizationId: orgId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
        revokedAt: true,
      },
    });
    if (!target) return notFound("API key not found");

    // ---- HARD DELETE PATH ----
    if (force) {
      if (target.isActive) {
        return NextResponse.json(
          {
            error:
              "Refusing to hard-delete an active key. Revoke it first (DELETE without ?force=true), then try again with ?force=true.",
          },
          { status: 400 }
        );
      }
      try {
        await prisma.$transaction(async (tx) => {
          await tx.apiKey.delete({ where: { id: target.id } });
          await writeAudit(tx, {
            organizationId: orgId,
            userId,
            action: "DELETE",
            entityType: "ApiKey",
            entityId: target.id,
            oldData: {
              name: target.name,
              keyPrefix: target.keyPrefix,
              revokedAt: target.revokedAt,
              hardDelete: true,
            },
          });
        });
        return NextResponse.json({ ok: true, hardDeleted: true });
      } catch (error) {
        logger.error({ err: error }, "Error hard-deleting API key");
        return NextResponse.json(
          { error: "Failed to delete API key" },
          { status: 500 }
        );
      }
    }

    // ---- SOFT REVOKE PATH (default) ----
    if (!target.isActive) {
      return NextResponse.json({ ok: true, alreadyRevoked: true });
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.apiKey.update({
          where: { id: target.id },
          data: {
            isActive: false,
            revokedAt: new Date(),
            revokedReason: reason,
          },
        });
        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "DELETE",
          entityType: "ApiKey",
          entityId: target.id,
          oldData: { name: target.name, keyPrefix: target.keyPrefix },
          newData: { revokedReason: reason },
        });
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      logger.error({ err: error }, "Error revoking API key");
      return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
    }
  }
);

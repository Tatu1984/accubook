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
 * Revokes (soft-deletes) an API key. Sets isActive=false + revokedAt now.
 * The row is kept so audit history stays intact and the visible prefix
 * remains identifiable in past logs.
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

    const target = await prisma.apiKey.findFirst({
      where: { id: params.keyId, organizationId: orgId },
      select: { id: true, name: true, keyPrefix: true, isActive: true },
    });
    if (!target) return notFound("API key not found");
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

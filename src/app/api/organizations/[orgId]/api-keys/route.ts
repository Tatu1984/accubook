import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, forbidden } from "@/backend/utils/with-org-auth";
import { hasPermission } from "@/backend/utils/permissions";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";
import { generateApiKey, KEY_PREFIX } from "@/backend/utils/verify-api-key";
import { isValidScopes } from "@/backend/utils/api-scope";
import type { Prisma } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scopeSchema = z.object({
  module: z.string().min(1),
  category: z.string().min(1),
  actions: z
    .array(z.enum(["read", "write", "delete", "*"]))
    .min(1, "At least one action per scope"),
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  scopes: z.array(scopeSchema).min(1, "Select at least one scope"),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
});

/**
 * GET /api/organizations/[orgId]/api-keys
 *
 * Lists API keys for the org. Returns metadata only — never the hash
 * and never the full token. The `keyPrefix` is the visible identifier
 * (matches the part of the token after `acb_live_`).
 */
export const GET = withOrgAuth(async (_req, { orgId, orgUser }) => {
  // Refuse to leak even prefixes to a request that came in via an API key —
  // session-only management surface.
  if (!hasPermission(orgUser, "settings", "read") && !hasPermission(orgUser, "*", "*")) {
    return forbidden("Only admins can view API keys");
  }
  const keys = await prisma.apiKey.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      isActive: true,
      revokedAt: true,
      revokedReason: true,
      expiresAt: true,
      lastUsedAt: true,
      lastUsedIp: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({ data: keys });
});

/**
 * POST /api/organizations/[orgId]/api-keys
 *
 * Body: { name, scopes: [{module, category, actions[]}], expiresAt?: ISO }
 *
 * Returns the full token EXACTLY ONCE. After this response the server
 * stores only the SHA-256 hash and the visible prefix — there is no way
 * to recover the token if the user loses it.
 */
export const POST = withOrgAuth(async (request, { orgId, userId, orgUser, apiKey }) => {
  // Refuse API-key auth on this endpoint — only humans (with sessions)
  // can mint new keys. This stops a leaked low-privilege key from
  // bootstrapping a higher-privilege one.
  if (apiKey) {
    return forbidden("API keys cannot create or manage other API keys");
  }
  if (!hasPermission(orgUser, "settings", "update") && !hasPermission(orgUser, "*", "*")) {
    return forbidden("Only admins can create API keys");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", parsed.error.issues);
  if (!isValidScopes(parsed.data.scopes)) {
    return badRequest("Invalid scope shape");
  }

  const { token, keyHash, keyPrefix } = generateApiKey();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.apiKey.create({
        data: {
          organizationId: orgId,
          name: parsed.data.name,
          keyPrefix,
          keyHash,
          scopes: parsed.data.scopes as unknown as Prisma.InputJsonValue,
          createdById: userId,
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "CREATE",
        entityType: "ApiKey",
        entityId: row.id,
        newData: {
          name: row.name,
          keyPrefix: row.keyPrefix,
          scopes: row.scopes,
          expiresAt: row.expiresAt,
        },
      });
      return row;
    });

    return NextResponse.json(
      {
        ...created,
        token,                       // shown ONCE — client must capture immediately
        tokenPrefix: KEY_PREFIX,     // for clearer copy UI
        warning:
          "This is the only time the full key will be shown. Store it securely; lose it and you must rotate.",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "Error creating API key");
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
});

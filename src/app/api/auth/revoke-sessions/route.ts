import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { auth } from "@/backend/services/auth.service";
import { prisma } from "@/backend/database/client";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/revoke-sessions
 *
 * Bumps `User.tokensRevokedAt` to now, which invalidates every JWT
 * previously issued to that user. On the next session refresh (within
 * 60s) NextAuth's jwt callback compares the token's issuedAt against
 * tokensRevokedAt, returns null, and the cookie is cleared.
 *
 * Body schema (all fields optional):
 *   { userId?: string }  - if omitted, defaults to the caller. Self-
 *                          service "log out of all sessions" button.
 *
 * Authorization:
 *   - Caller must be authenticated.
 *   - Revoking another user requires SUPER_ADMIN / ADMIN privileges
 *     (via the role.name fallback used elsewhere). We avoid the org-
 *     scoped permission check here because this is a global identity
 *     action — a user might be admin in org A but not org B; revoking
 *     their tokens is allowed if they're admin anywhere.
 */
const bodySchema = z
  .object({
    userId: optional(z.string().min(1)),
  })
  .strict();

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId?: string } = {};
  try {
    const raw = await request.text();
    if (raw) body = bodySchema.parse(JSON.parse(raw));
  } catch (e) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const targetUserId = body.userId ?? session.user.id;
  const isSelf = targetUserId === session.user.id;

  if (!isSelf) {
    // Only an admin (anywhere in the system) can revoke a different user.
    const isAdmin = await prisma.organizationUser.findFirst({
      where: {
        userId: session.user.id,
        isActive: true,
        role: { name: { in: ["ADMIN", "SUPER_ADMIN", "OWNER"] } },
      },
      select: { id: true },
    });
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: targetUserId },
    data: { tokensRevokedAt: now },
  });

  logger.info(
    { actorUserId: session.user.id, targetUserId, isSelf },
    "Sessions revoked"
  );

  return NextResponse.json({ ok: true, revokedAt: now.toISOString() });
}

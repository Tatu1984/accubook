import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/backend/services/auth.service";
import { prisma } from "@/backend/database/client";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/password
 *
 * Self-service password change. The Profile screen had a "Change Password"
 * button with nothing behind it — the only way to get a new password was for
 * an administrator to reset it.
 *
 * On success every previously issued JWT is invalidated by bumping
 * `tokensRevokedAt`, so a session opened with the old password on another
 * device is signed out.
 */

const bodySchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(12, "Use at least 12 characters")
      .max(200, "That password is unreasonably long"),
  })
  .strict();

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = bodySchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true },
    });
    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "This account has no password set — sign in with your provider" },
        { status: 400 }
      );
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      logger.warn({ userId: user.id }, "Password change rejected: wrong current password");
      return NextResponse.json(
        { error: "Your current password is incorrect" },
        { status: 400 }
      );
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return NextResponse.json(
        { error: "The new password must differ from the current one" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokensRevokedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Validation failed" },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error changing password");
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}

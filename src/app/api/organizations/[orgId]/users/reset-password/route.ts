import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/backend/database/client";
import {
  withOrgAuth,
  badRequest,
  forbidden,
  notFound,
} from "@/backend/utils/with-org-auth";
import { hasPermission } from "@/backend/utils/permissions";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";
import { sendEmail } from "@/backend/services/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/users/reset-password
 *
 * Issues a new temporary password for a member of this organization, revokes
 * their existing sessions so an attacker holding one is cut off, and emails
 * the credential to them. The Users screen offered "Reset Password" with no
 * route behind it.
 *
 * The temporary password is returned in the response ONLY when no email
 * provider is configured — otherwise an admin would be handed a credential
 * that was also mailed out, and there would be no way to tell which channel
 * leaked it. The caller is told which case applies.
 */

const resetPasswordSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export const POST = withOrgAuth(async (request, { orgId, userId, orgUser }) => {
  try {
    if (!hasPermission(orgUser, "organization", "users", "write")) {
      return forbidden("You don't have permission to reset passwords");
    }

    const body = await request.json();
    const { userId: targetUserId } = resetPasswordSchema.parse(body);

    const membership = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: targetUserId },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!membership) return notFound("User not found in organization");
    if (!membership.user.email) {
      return badRequest("This user has no email address on record");
    }

    // 16 random bytes → 22-char base64url string (~128 bits of entropy),
    // matching how the invite flow mints its first password.
    const tempPassword = randomBytes(16).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: { passwordHash },
      });
      // Any live session was authenticated with the old credential.
      await tx.session.deleteMany({ where: { userId: targetUserId } });
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "UPDATE",
        entityType: "User",
        entityId: targetUserId,
        newData: { event: "PASSWORD_RESET", email: membership.user.email },
      });
    });

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const issuer = organization?.name ?? "accubook";

    const result = await sendEmail({
      to: membership.user.email,
      subject: `Your ${issuer} password has been reset`,
      text:
        `Hi ${membership.user.name ?? ""},\n\n` +
        `An administrator reset your ${issuer} password.\n\n` +
        `Temporary password: ${tempPassword}\n\n` +
        `Sign in with it and change it immediately. Any existing sessions ` +
        `have been signed out.\n\n— ${issuer}`,
      tags: [{ name: "kind", value: "password-reset" }],
    });

    const delivered = result.ok && result.provider !== "noop";

    return NextResponse.json({
      ok: true,
      delivered,
      email: membership.user.email,
      // Only surfaced when the email could not go out, so the admin has some
      // way to hand the credential over.
      temporaryPassword: delivered ? undefined : tempPassword,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error resetting password");
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    );
  }
});

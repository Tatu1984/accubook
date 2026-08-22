import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { auth } from "@/backend/services/auth.service";
import { prisma } from "@/backend/database/client";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in user's own profile.
 *
 * `PATCH /api/organizations/[orgId]/users` only ever set another member's role
 * and active flag, so there was no way for a user to correct their own name or
 * phone number — the Profile screen presented those fields read-only with a
 * permanently disabled Save button.
 *
 * Email is deliberately not editable here: it is the login identifier and the
 * unique key other members are invited against, so changing it needs an admin
 * flow with re-verification rather than a self-service text box.
 */

const patchSchema = z
  .object({
    name: optional(z.string().min(1).max(120)),
    phone: z.string().max(30).nullable().optional(),
    /**
     * Data URL for a small avatar. Capped well under the 1 MB Postgres text
     * comfort zone; anything larger belongs in object storage.
     */
    avatar: z
      .string()
      .max(400_000, "Image is too large — use one under about 250 KB")
      .nullable()
      .optional(),
  })
  .strict();

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatar: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ data: user });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = patchSchema.parse(body);

    if (data.avatar && !data.avatar.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Avatar must be an image data URL" },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: { id: true, name: true, email: true, phone: true, avatar: true },
    });

    return NextResponse.json({ data: user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating profile");
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

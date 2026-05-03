import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, forbidden, notFound, hasPermission } from "@/backend/utils/with-org-auth";

// Helper: returns true when the target user is the org's last active ADMIN.
// Used to refuse demote/delete operations that would orphan the organization.
async function isLastAdmin(orgId: string, targetUserId: string): Promise<boolean> {
  const adminCount = await prisma.organizationUser.count({
    where: {
      organizationId: orgId,
      isActive: true,
      role: { name: "ADMIN" },
      NOT: { userId: targetUserId },
    },
  });
  return adminCount === 0;
}

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inviteUserSchema = z.object({
  email: z.string().email("Invalid email"),
  name: z.string().min(1, "Name is required"),
  roleId: z.string().min(1, "Role is required"),
});

const updateUserSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  roleId: z.string().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const roleId = searchParams.get("roleId");
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (roleId) {
      where.roleId = roleId;
    }

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [users, total] = await Promise.all([
      prisma.organizationUser.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              createdAt: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
              permissions: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.organizationUser.count({ where }),
    ]);

    return NextResponse.json({
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId, orgUser }) => {
  try {
    if (!hasPermission(orgUser, "users", "create")) {
      return forbidden("You don't have permission to invite users");
    }

    const body = await request.json();
    const validatedData = inviteUserSchema.parse(body);

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    // Check if user is already part of organization
    if (user) {
      const existingOrgUser = await prisma.organizationUser.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: user.id,
          },
        },
      });

      if (existingOrgUser) {
        return badRequest("User is already a member of this organization");
      }
    } else {
      // Create new user with cryptographically-random temporary password.
      // 16 random bytes → 22-char base64url string (~128 bits of entropy).
      const { randomBytes } = await import("node:crypto");
      const tempPassword = randomBytes(16).toString("base64url");
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      user = await prisma.user.create({
        data: {
          email: validatedData.email,
          name: validatedData.name,
          passwordHash: hashedPassword,
        },
      });

      // TODO: Send invitation email with temp password
    }

    // Add user to organization
    const newOrgUser = await prisma.organizationUser.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        roleId: validatedData.roleId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(newOrgUser, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    console.error("Error inviting user:", error);
    return NextResponse.json(
      { error: "Failed to invite user" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth(async (request, { orgId, orgUser: currentOrgUser }) => {
  try {
    if (!hasPermission(currentOrgUser, "users", "update")) {
      return forbidden("You don't have permission to manage users");
    }

    const body = await request.json();
    const validatedData = updateUserSchema.parse(body);

    // Verify user is part of organization
    const targetOrgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: validatedData.userId,
        },
      },
      include: {
        role: true,
      },
    });

    if (!targetOrgUser) {
      return notFound("User not found in organization");
    }

    // Refuse to demote or deactivate the last admin (would orphan the org).
    const isAdminTarget = targetOrgUser.role?.name === "ADMIN";
    const willDemote =
      validatedData.roleId !== undefined && validatedData.roleId !== targetOrgUser.roleId;
    const willDeactivate = validatedData.isActive === false;
    if (isAdminTarget && (willDemote || willDeactivate) && (await isLastAdmin(orgId, validatedData.userId))) {
      return forbidden("Cannot demote or deactivate the only remaining admin");
    }

    const updateData: Record<string, unknown> = {};
    if (validatedData.roleId !== undefined) {
      updateData.roleId = validatedData.roleId;
    }
    if (validatedData.isActive !== undefined) {
      updateData.isActive = validatedData.isActive;
    }

    const updatedOrgUser = await prisma.organizationUser.update({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: validatedData.userId,
        },
      },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(updatedOrgUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth(async (request, { orgId, orgUser: currentOrgUser, userId }) => {
  try {
    if (!hasPermission(currentOrgUser, "users", "delete")) {
      return forbidden("You don't have permission to remove users");
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return badRequest("User ID is required");
    }

    // Cannot remove yourself
    if (targetUserId === userId) {
      return badRequest("Cannot remove yourself from the organization");
    }

    // Verify user is part of organization
    const targetOrgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: targetUserId,
        },
      },
      include: {
        role: true,
      },
    });

    if (!targetOrgUser) {
      return notFound("User not found in organization");
    }

    // Refuse to remove the last admin (would orphan the org).
    if (targetOrgUser.role?.name === "ADMIN" && (await isLastAdmin(orgId, targetUserId))) {
      return forbidden("Cannot remove the only remaining admin");
    }

    await prisma.organizationUser.delete({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: targetUserId,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing user:", error);
    return NextResponse.json(
      { error: "Failed to remove user" },
      { status: 500 }
    );
  }
});

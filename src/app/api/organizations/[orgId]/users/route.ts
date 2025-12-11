import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";
import bcrypt from "bcryptjs";

const inviteUserSchema = z.object({
  email: z.string().email("Invalid email"),
  name: z.string().min(1, "Name is required"),
  roleId: z.string().min(1, "Role is required"),
});

const updateUserSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  roleId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

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
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
      include: {
        role: true,
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if user has permission to invite users
    const permissions = orgUser.role?.permissions as string[] | null;
    if (!permissions?.includes("manage_users") && orgUser.role?.name !== "Owner") {
      return NextResponse.json(
        { error: "You don't have permission to invite users" },
        { status: 403 }
      );
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
        return NextResponse.json(
          { error: "User is already a member of this organization" },
          { status: 400 }
        );
      }
    } else {
      // Create new user with temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
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
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error inviting user:", error);
    return NextResponse.json(
      { error: "Failed to invite user" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentOrgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
      include: {
        role: true,
      },
    });

    if (!currentOrgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if user has permission to manage users
    const permissions = currentOrgUser.role?.permissions as string[] | null;
    if (!permissions?.includes("manage_users") && currentOrgUser.role?.name !== "Owner") {
      return NextResponse.json(
        { error: "You don't have permission to manage users" },
        { status: 403 }
      );
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
      return NextResponse.json(
        { error: "User not found in organization" },
        { status: 404 }
      );
    }

    // Prevent modifying owner unless you're the owner
    if (targetOrgUser.role?.name === "Owner" && currentOrgUser.role?.name !== "Owner") {
      return NextResponse.json(
        { error: "Cannot modify owner's permissions" },
        { status: 403 }
      );
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
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentOrgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
      include: {
        role: true,
      },
    });

    if (!currentOrgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if user has permission to manage users
    const permissions = currentOrgUser.role?.permissions as string[] | null;
    if (!permissions?.includes("manage_users") && currentOrgUser.role?.name !== "Owner") {
      return NextResponse.json(
        { error: "You don't have permission to remove users" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Cannot remove yourself
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself from the organization" },
        { status: 400 }
      );
    }

    // Verify user is part of organization
    const targetOrgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId,
        },
      },
      include: {
        role: true,
      },
    });

    if (!targetOrgUser) {
      return NextResponse.json(
        { error: "User not found in organization" },
        { status: 404 }
      );
    }

    // Cannot remove owner
    if (targetOrgUser.role?.name === "Owner") {
      return NextResponse.json(
        { error: "Cannot remove the owner from the organization" },
        { status: 403 }
      );
    }

    await prisma.organizationUser.delete({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId,
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
}

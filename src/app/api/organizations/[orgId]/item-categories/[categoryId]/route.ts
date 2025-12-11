import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  hsnCode: z.string().optional().nullable(),
  sacCode: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; categoryId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, categoryId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const category = await prisma.itemCategory.findFirst({
      where: {
        id: categoryId,
        organizationId: orgId,
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    return NextResponse.json(category);
  } catch (error) {
    console.error("Error fetching category:", error);
    return NextResponse.json(
      { error: "Failed to fetch category" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; categoryId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, categoryId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateCategorySchema.parse(body);

    // Check if category exists
    const existingCategory = await prisma.itemCategory.findFirst({
      where: {
        id: categoryId,
        organizationId: orgId,
      },
    });

    if (!existingCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Check for name uniqueness if name is being changed
    if (validatedData.name && validatedData.name !== existingCategory.name) {
      const nameExists = await prisma.itemCategory.findFirst({
        where: {
          organizationId: orgId,
          name: validatedData.name,
          NOT: { id: categoryId },
        },
      });

      if (nameExists) {
        return NextResponse.json(
          { error: "A category with this name already exists" },
          { status: 400 }
        );
      }
    }

    // Prevent circular parent reference
    if (validatedData.parentId === categoryId) {
      return NextResponse.json(
        { error: "Category cannot be its own parent" },
        { status: 400 }
      );
    }

    const category = await prisma.itemCategory.update({
      where: { id: categoryId },
      data: validatedData,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating category:", error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; categoryId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, categoryId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if category exists
    const category = await prisma.itemCategory.findFirst({
      where: {
        id: categoryId,
        organizationId: orgId,
      },
    });

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Check if category has items or children
    const hasItems = await prisma.item.findFirst({
      where: { categoryId },
    });

    const hasChildren = await prisma.itemCategory.findFirst({
      where: { parentId: categoryId },
    });

    if (hasItems || hasChildren) {
      // Soft delete
      await prisma.itemCategory.update({
        where: { id: categoryId },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, softDeleted: true });
    }

    // Hard delete
    await prisma.itemCategory.delete({
      where: { id: categoryId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}

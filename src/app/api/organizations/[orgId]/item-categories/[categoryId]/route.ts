import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  hsnCode: z.string().optional().nullable(),
  sacCode: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

export const GET = withOrgAuth<{ categoryId: string }>(async (_request, { orgId, params }) => {
  try {
    const { categoryId } = params;

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
      return notFound("Category not found");
    }

    return NextResponse.json(category);
  } catch (error) {
    logger.error({ err: error }, "Error fetching category");
    return NextResponse.json(
      { error: "Failed to fetch category" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth<{ categoryId: string }>(async (request, { orgId, params }) => {
  try {
    const { categoryId } = params;
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
      return notFound("Category not found");
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
        return badRequest("A category with this name already exists");
      }
    }

    // Prevent circular parent reference
    if (validatedData.parentId === categoryId) {
      return badRequest("Category cannot be its own parent");
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
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating category");
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth<{ categoryId: string }>(async (_request, { orgId, params }) => {
  try {
    const { categoryId } = params;

    // Check if category exists
    const category = await prisma.itemCategory.findFirst({
      where: {
        id: categoryId,
        organizationId: orgId,
      },
    });

    if (!category) {
      return notFound("Category not found");
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
    logger.error({ err: error }, "Error deleting category");
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
});

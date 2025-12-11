import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { z } from "zod";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().optional().nullable(),
  type: z.enum(["GOODS", "SERVICE"]).optional(),
  categoryId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  hsnCode: z.string().optional().nullable(),
  sacCode: z.string().optional().nullable(),
  primaryUnitId: z.string().optional(),
  purchasePrice: z.number().optional().nullable(),
  sellingPrice: z.number().optional().nullable(),
  taxConfigId: z.string().optional().nullable(),
  reorderLevel: z.number().optional().nullable(),
  reorderQuantity: z.number().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; itemId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, itemId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const item = await prisma.item.findFirst({
      where: {
        id: itemId,
        organizationId: orgId,
      },
      include: {
        category: true,
        primaryUnit: true,
        purchaseTax: true,
        salesTax: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error fetching item:", error);
    return NextResponse.json(
      { error: "Failed to fetch item" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; itemId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, itemId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateItemSchema.parse(body);

    // Check if item exists
    const existingItem = await prisma.item.findFirst({
      where: {
        id: itemId,
        organizationId: orgId,
      },
    });

    if (!existingItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Check for name uniqueness if name is being changed
    if (validatedData.name && validatedData.name !== existingItem.name) {
      const nameExists = await prisma.item.findFirst({
        where: {
          organizationId: orgId,
          name: validatedData.name,
          NOT: { id: itemId },
        },
      });

      if (nameExists) {
        return NextResponse.json(
          { error: "An item with this name already exists" },
          { status: 400 }
        );
      }
    }

    const item = await prisma.item.update({
      where: { id: itemId },
      data: validatedData,
      include: {
        category: true,
        primaryUnit: true,
        purchaseTax: true,
        salesTax: true,
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating item:", error);
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; itemId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, itemId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if item exists
    const item = await prisma.item.findFirst({
      where: {
        id: itemId,
        organizationId: orgId,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Check if item has stock or invoices
    const hasStock = await prisma.stock.findFirst({
      where: { itemId },
    });

    const hasInvoiceItems = await prisma.invoiceItem.findFirst({
      where: { itemId },
    });

    if (hasStock || hasInvoiceItems) {
      // Soft delete
      await prisma.item.update({
        where: { id: itemId },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, softDeleted: true });
    }

    // Hard delete
    await prisma.item.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting item:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}

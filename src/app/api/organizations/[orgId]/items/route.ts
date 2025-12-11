import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  primaryUnitId: z.string().min(1, "Unit is required"),
  type: z.string().default("GOODS"),
  purchasePrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  mrp: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  maxStock: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  reorderQty: z.number().min(0).optional(),
  hsnCode: z.string().optional(),
  sacCode: z.string().optional(),
  purchaseTaxId: z.string().optional(),
  salesTaxId: z.string().optional(),
  valuationMethod: z.string().default("FIFO"),
  trackBatch: z.boolean().default(false),
  trackSerial: z.boolean().default(false),
  trackExpiry: z.boolean().default(false),
  isActive: z.boolean().default(true),
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
    const categoryId = searchParams.get("categoryId");
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (type) {
      where.type = type;
    }

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
        { barcode: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          primaryUnit: {
            select: {
              id: true,
              name: true,
              symbol: true,
            },
          },
          stocks: {
            select: {
              warehouseId: true,
              quantity: true,
            },
          },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.item.count({ where }),
    ]);

    // Calculate total stock for each item
    const itemsWithStock = items.map((item) => ({
      ...item,
      totalStock: item.stocks.reduce((sum, s) => sum + Number(s.quantity), 0),
    }));

    return NextResponse.json({
      data: itemsWithStock,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching items:", error);
    return NextResponse.json(
      { error: "Failed to fetch items" },
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
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = createItemSchema.parse(body);

    // Check if SKU already exists
    if (validatedData.sku) {
      const existingSku = await prisma.item.findFirst({
        where: {
          organizationId: orgId,
          sku: validatedData.sku,
        },
      });

      if (existingSku) {
        return NextResponse.json(
          { error: "SKU already exists" },
          { status: 400 }
        );
      }
    }

    const item = await prisma.item.create({
      data: {
        organizationId: orgId,
        name: validatedData.name,
        sku: validatedData.sku,
        barcode: validatedData.barcode,
        description: validatedData.description,
        categoryId: validatedData.categoryId,
        primaryUnitId: validatedData.primaryUnitId,
        type: validatedData.type,
        purchasePrice: validatedData.purchasePrice,
        sellingPrice: validatedData.sellingPrice,
        mrp: validatedData.mrp,
        minStock: validatedData.minStock,
        maxStock: validatedData.maxStock,
        reorderLevel: validatedData.reorderLevel,
        reorderQty: validatedData.reorderQty,
        hsnCode: validatedData.hsnCode,
        sacCode: validatedData.sacCode,
        purchaseTaxId: validatedData.purchaseTaxId,
        salesTaxId: validatedData.salesTaxId,
        valuationMethod: validatedData.valuationMethod,
        trackBatch: validatedData.trackBatch,
        trackSerial: validatedData.trackSerial,
        trackExpiry: validatedData.trackExpiry,
        isActive: validatedData.isActive,
      },
      include: {
        category: true,
        primaryUnit: true,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating item:", error);
    return NextResponse.json(
      { error: "Failed to create item" },
      { status: 500 }
    );
  }
}

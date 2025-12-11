import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createTaxConfigSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  taxType: z.enum(["GST", "IGST", "CGST", "SGST", "VAT", "TDS", "TCS", "CESS"]),
  rate: z.number().min(0).max(100),
  accountId: z.string().optional(),
  description: z.string().optional(),
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
    const taxType = searchParams.get("taxType");
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (taxType) {
      where.taxType = taxType;
    }

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    const [taxConfigs, total] = await Promise.all([
      prisma.taxConfig.findMany({
        where,
        orderBy: [
          { taxType: "asc" },
          { rate: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.taxConfig.count({ where }),
    ]);

    return NextResponse.json({
      data: taxConfigs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching tax configs:", error);
    return NextResponse.json(
      { error: "Failed to fetch tax configurations" },
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
    const validatedData = createTaxConfigSchema.parse(body);

    // Check for duplicate code
    const existingTax = await prisma.taxConfig.findFirst({
      where: {
        organizationId: orgId,
        code: validatedData.code,
      },
    });

    if (existingTax) {
      return NextResponse.json(
        { error: "Tax configuration with this code already exists" },
        { status: 400 }
      );
    }

    const taxConfig = await prisma.taxConfig.create({
      data: {
        organizationId: orgId,
        ...validatedData,
      },
    });

    return NextResponse.json(taxConfig, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating tax config:", error);
    return NextResponse.json(
      { error: "Failed to create tax configuration" },
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
    const { taxId, ...updateData } = body;

    if (!taxId) {
      return NextResponse.json(
        { error: "Tax ID is required" },
        { status: 400 }
      );
    }

    // Verify tax config exists and belongs to organization
    const existingTax = await prisma.taxConfig.findFirst({
      where: {
        id: taxId,
        organizationId: orgId,
      },
    });

    if (!existingTax) {
      return NextResponse.json(
        { error: "Tax configuration not found" },
        { status: 404 }
      );
    }

    const validatedData = createTaxConfigSchema.partial().parse(updateData);

    const taxConfig = await prisma.taxConfig.update({
      where: { id: taxId },
      data: validatedData,
    });

    return NextResponse.json(taxConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating tax config:", error);
    return NextResponse.json(
      { error: "Failed to update tax configuration" },
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
    const taxId = searchParams.get("taxId");

    if (!taxId) {
      return NextResponse.json(
        { error: "Tax ID is required" },
        { status: 400 }
      );
    }

    // Verify tax config exists and belongs to organization
    const existingTax = await prisma.taxConfig.findFirst({
      where: {
        id: taxId,
        organizationId: orgId,
      },
    });

    if (!existingTax) {
      return NextResponse.json(
        { error: "Tax configuration not found" },
        { status: 404 }
      );
    }

    await prisma.taxConfig.delete({
      where: { id: taxId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tax config:", error);
    return NextResponse.json(
      { error: "Failed to delete tax configuration" },
      { status: 500 }
    );
  }
}

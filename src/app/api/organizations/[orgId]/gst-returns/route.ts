import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createGSTReturnSchema = z.object({
  returnType: z.enum(["GSTR1", "GSTR3B", "GSTR9"]),
  period: z.string().min(1, "Period is required"),
  dueDate: z.string().transform((val) => new Date(val)),
  filingDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  totalTaxLiability: z.number().optional(),
  totalItcClaimed: z.number().optional(),
  netPayable: z.number().optional(),
  arn: z.string().optional(),
  status: z.enum(["PENDING", "FILED", "REVISED"]).default("PENDING"),
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
    const returnType = searchParams.get("returnType");
    const status = searchParams.get("status");
    const year = searchParams.get("year");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (returnType) {
      where.returnType = returnType;
    }

    if (status) {
      where.status = status;
    }

    if (year) {
      where.period = { contains: year };
    }

    const [returns, total] = await Promise.all([
      prisma.gSTReturn.findMany({
        where,
        orderBy: [
          { dueDate: "desc" },
          { returnType: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.gSTReturn.count({ where }),
    ]);

    return NextResponse.json({
      data: returns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching GST returns:", error);
    return NextResponse.json(
      { error: "Failed to fetch GST returns" },
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
    const validatedData = createGSTReturnSchema.parse(body);

    const gstReturn = await prisma.gSTReturn.create({
      data: {
        organizationId: orgId,
        returnType: validatedData.returnType,
        period: validatedData.period,
        dueDate: validatedData.dueDate,
        filingDate: validatedData.filingDate,
        totalTaxLiability: validatedData.totalTaxLiability,
        totalItcClaimed: validatedData.totalItcClaimed,
        netPayable: validatedData.netPayable,
        arn: validatedData.arn,
        status: validatedData.status,
      },
    });

    return NextResponse.json(gstReturn, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating GST return:", error);
    return NextResponse.json(
      { error: "Failed to create GST return" },
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
    const { returnId, ...updateData } = body;

    if (!returnId) {
      return NextResponse.json(
        { error: "Return ID is required" },
        { status: 400 }
      );
    }

    // Verify return belongs to organization
    const existing = await prisma.gSTReturn.findFirst({
      where: {
        id: returnId,
        organizationId: orgId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "GST return not found" },
        { status: 404 }
      );
    }

    // Parse dates if provided
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }
    if (updateData.filingDate) {
      updateData.filingDate = new Date(updateData.filingDate);
    }

    const gstReturn = await prisma.gSTReturn.update({
      where: { id: returnId },
      data: updateData,
    });

    return NextResponse.json(gstReturn);
  } catch (error) {
    console.error("Error updating GST return:", error);
    return NextResponse.json(
      { error: "Failed to update GST return" },
      { status: 500 }
    );
  }
}

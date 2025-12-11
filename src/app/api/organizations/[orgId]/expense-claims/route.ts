import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createExpenseClaimSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  date: z.string().transform((val) => new Date(val)),
  category: z.enum(["TRAVEL", "FOOD", "ACCOMMODATION", "OFFICE_SUPPLIES", "OTHER"]),
  description: z.string().min(1, "Description is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  attachments: z.array(z.string()).optional(),
  notes: z.string().optional(),
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
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      employee: { organizationId: orgId },
    };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    const [claims, total] = await Promise.all([
      prisma.expenseClaim.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.expenseClaim.count({ where }),
    ]);

    return NextResponse.json({
      data: claims,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching expense claims:", error);
    return NextResponse.json(
      { error: "Failed to fetch expense claims" },
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
    const validatedData = createExpenseClaimSchema.parse(body);

    // Verify employee belongs to organization
    const employee = await prisma.employee.findFirst({
      where: {
        id: validatedData.employeeId,
        organizationId: orgId,
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Generate claim number
    const lastClaim = await prisma.expenseClaim.findFirst({
      where: { employee: { organizationId: orgId } },
      orderBy: { createdAt: "desc" },
      select: { claimNumber: true },
    });

    const claimNumber = lastClaim
      ? `EXP-${String(parseInt(lastClaim.claimNumber.split("-")[1] || "0") + 1).padStart(6, "0")}`
      : "EXP-000001";

    const claim = await prisma.expenseClaim.create({
      data: {
        employeeId: validatedData.employeeId,
        userId: session.user.id,
        claimNumber,
        date: validatedData.date,
        category: validatedData.category,
        description: validatedData.description,
        amount: validatedData.amount,
        attachments: validatedData.attachments,
        notes: validatedData.notes,
        status: "PENDING",
      },
      include: {
        employee: true,
        user: true,
      },
    });

    return NextResponse.json(claim, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating expense claim:", error);
    return NextResponse.json(
      { error: "Failed to create expense claim" },
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
      include: { role: true },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { claimId, action, notes } = body;

    if (!claimId || !action) {
      return NextResponse.json(
        { error: "Claim ID and action are required" },
        { status: 400 }
      );
    }

    const claim = await prisma.expenseClaim.findFirst({
      where: {
        id: claimId,
        employee: { organizationId: orgId },
      },
    });

    if (!claim) {
      return NextResponse.json(
        { error: "Expense claim not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (action === "APPROVE") {
      updateData.status = "APPROVED";
      updateData.approvedBy = session.user.name || session.user.id;
      updateData.approvedAt = new Date();
    } else if (action === "REJECT") {
      updateData.status = "REJECTED";
      updateData.approvedBy = session.user.name || session.user.id;
      updateData.approvedAt = new Date();
    } else if (action === "REIMBURSE") {
      updateData.status = "REIMBURSED";
      updateData.reimbursedAt = new Date();
    }

    if (notes) {
      updateData.notes = notes;
    }

    const updatedClaim = await prisma.expenseClaim.update({
      where: { id: claimId },
      data: updateData,
      include: {
        employee: true,
        user: true,
      },
    });

    return NextResponse.json(updatedClaim);
  } catch (error) {
    console.error("Error updating expense claim:", error);
    return NextResponse.json(
      { error: "Failed to update expense claim" },
      { status: 500 }
    );
  }
}

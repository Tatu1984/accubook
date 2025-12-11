import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const budgetLineSchema = z.object({
  ledgerId: z.string().min(1),
  month1: z.number().default(0),
  month2: z.number().default(0),
  month3: z.number().default(0),
  month4: z.number().default(0),
  month5: z.number().default(0),
  month6: z.number().default(0),
  month7: z.number().default(0),
  month8: z.number().default(0),
  month9: z.number().default(0),
  month10: z.number().default(0),
  month11: z.number().default(0),
  month12: z.number().default(0),
});

const createBudgetSchema = z.object({
  fiscalYearId: z.string().min(1, "Fiscal year is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).default("DRAFT"),
  lines: z.array(budgetLineSchema).optional(),
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
    const fiscalYearId = searchParams.get("fiscalYearId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (fiscalYearId) {
      where.fiscalYearId = fiscalYearId;
    }

    if (status) {
      where.status = status;
    }

    const [budgets, total] = await Promise.all([
      prisma.budget.findMany({
        where,
        include: {
          fiscalYear: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
            },
          },
          lines: {
            include: {
              ledger: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.budget.count({ where }),
    ]);

    // Calculate totals for each budget
    const budgetsWithTotals = budgets.map((budget) => {
      const totalBudget = budget.lines.reduce((sum, line) => {
        const lineTotal =
          Number(line.month1) +
          Number(line.month2) +
          Number(line.month3) +
          Number(line.month4) +
          Number(line.month5) +
          Number(line.month6) +
          Number(line.month7) +
          Number(line.month8) +
          Number(line.month9) +
          Number(line.month10) +
          Number(line.month11) +
          Number(line.month12);
        return sum + lineTotal;
      }, 0);

      return {
        ...budget,
        totalBudget,
        lineCount: budget.lines.length,
      };
    });

    return NextResponse.json({
      data: budgetsWithTotals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return NextResponse.json(
      { error: "Failed to fetch budgets" },
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
    const validatedData = createBudgetSchema.parse(body);

    // Check for duplicate
    const existing = await prisma.budget.findUnique({
      where: {
        organizationId_fiscalYearId_name: {
          organizationId: orgId,
          fiscalYearId: validatedData.fiscalYearId,
          name: validatedData.name,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Budget with this name already exists for this fiscal year" },
        { status: 400 }
      );
    }

    const linesData = validatedData.lines?.map((line) => ({
      ledgerId: line.ledgerId,
      month1: line.month1,
      month2: line.month2,
      month3: line.month3,
      month4: line.month4,
      month5: line.month5,
      month6: line.month6,
      month7: line.month7,
      month8: line.month8,
      month9: line.month9,
      month10: line.month10,
      month11: line.month11,
      month12: line.month12,
      annual:
        line.month1 +
        line.month2 +
        line.month3 +
        line.month4 +
        line.month5 +
        line.month6 +
        line.month7 +
        line.month8 +
        line.month9 +
        line.month10 +
        line.month11 +
        line.month12,
    }));

    const budget = await prisma.budget.create({
      data: {
        organizationId: orgId,
        fiscalYearId: validatedData.fiscalYearId,
        name: validatedData.name,
        description: validatedData.description,
        status: validatedData.status,
        lines: linesData
          ? {
              create: linesData,
            }
          : undefined,
      },
      include: {
        fiscalYear: true,
        lines: {
          include: {
            ledger: true,
          },
        },
      },
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating budget:", error);
    return NextResponse.json(
      { error: "Failed to create budget" },
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
    const { budgetId, status, lines, ...updateData } = body;

    if (!budgetId) {
      return NextResponse.json(
        { error: "Budget ID is required" },
        { status: 400 }
      );
    }

    // Verify budget belongs to organization
    const existing = await prisma.budget.findFirst({
      where: {
        id: budgetId,
        organizationId: orgId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Budget not found" },
        { status: 404 }
      );
    }

    const budget = await prisma.budget.update({
      where: { id: budgetId },
      data: {
        ...updateData,
        status,
      },
      include: {
        fiscalYear: true,
        lines: {
          include: {
            ledger: true,
          },
        },
      },
    });

    return NextResponse.json(budget);
  } catch (error) {
    console.error("Error updating budget:", error);
    return NextResponse.json(
      { error: "Failed to update budget" },
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
    const budgetId = searchParams.get("budgetId");

    if (!budgetId) {
      return NextResponse.json(
        { error: "Budget ID is required" },
        { status: 400 }
      );
    }

    // Verify budget belongs to organization
    const existing = await prisma.budget.findFirst({
      where: {
        id: budgetId,
        organizationId: orgId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Budget not found" },
        { status: 404 }
      );
    }

    await prisma.budget.delete({
      where: { id: budgetId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting budget:", error);
    return NextResponse.json(
      { error: "Failed to delete budget" },
      { status: 500 }
    );
  }
}

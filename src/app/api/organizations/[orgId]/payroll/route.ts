import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const earningSchema = z.object({
  name: z.string(),
  amount: z.number(),
});

const deductionSchema = z.object({
  name: z.string(),
  amount: z.number(),
});

const createPayslipSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  month: z.number().min(1).max(12),
  year: z.number().min(2000),
  basicSalary: z.number().min(0),
  earnings: z.array(earningSchema).default([]),
  deductions: z.array(deductionSchema).default([]),
  workingDays: z.number().min(0),
  presentDays: z.number().min(0),
  lopDays: z.number().min(0).default(0),
  status: z.enum(["DRAFT", "PROCESSED", "APPROVED", "PAID"]).default("DRAFT"),
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
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      employee: { organizationId: orgId },
    };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (month) {
      where.month = parseInt(month);
    }

    if (year) {
      where.year = parseInt(year);
    }

    if (status) {
      where.status = status;
    }

    const [payslips, total] = await Promise.all([
      prisma.payslip.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              email: true,
              department: {
                select: {
                  name: true,
                },
              },
              designation: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [
          { year: "desc" },
          { month: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payslip.count({ where }),
    ]);

    return NextResponse.json({
      data: payslips,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching payslips:", error);
    return NextResponse.json(
      { error: "Failed to fetch payslips" },
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
    const validatedData = createPayslipSchema.parse(body);

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

    // Check if payslip already exists for this month/year
    const existingPayslip = await prisma.payslip.findFirst({
      where: {
        employeeId: validatedData.employeeId,
        month: validatedData.month,
        year: validatedData.year,
      },
    });

    if (existingPayslip) {
      return NextResponse.json(
        { error: "Payslip already exists for this period" },
        { status: 400 }
      );
    }

    // Calculate gross salary from basic + earnings
    const earningsTotal = validatedData.earnings.reduce((sum, e) => sum + e.amount, 0);
    const grossSalary = validatedData.basicSalary + earningsTotal;

    // Calculate total deductions
    const totalDeductions = validatedData.deductions.reduce((sum, d) => sum + d.amount, 0);

    const netSalary = grossSalary - totalDeductions;

    const payslip = await prisma.payslip.create({
      data: {
        employeeId: validatedData.employeeId,
        month: validatedData.month,
        year: validatedData.year,
        basicSalary: validatedData.basicSalary,
        earnings: validatedData.earnings,
        deductions: validatedData.deductions,
        grossSalary,
        totalDeductions,
        netSalary,
        workingDays: validatedData.workingDays,
        presentDays: validatedData.presentDays,
        lopDays: validatedData.lopDays,
        status: validatedData.status,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            email: true,
            department: {
              select: {
                name: true,
              },
            },
            designation: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(payslip, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating payslip:", error);
    return NextResponse.json(
      { error: "Failed to create payslip" },
      { status: 500 }
    );
  }
}

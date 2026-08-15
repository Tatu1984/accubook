import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A payslip line. `component` is the canonical key — it is what the payroll
 * calculator writes and what `buildPayrollJournal` reads out of the stored
 * JSON when it books the month.
 *
 * This route used to accept and store `{ name, amount }`, so a payslip
 * entered here was unreadable to the journal: every deduction came back
 * `undefined`, the entire credit side was dropped, and the month posted as
 * an unbalanced voucher. `name` is still accepted so existing callers keep
 * working, and is normalised to `component` on the way in.
 */
const payslipLineSchema = z
  .object({
    component: optional(z.string().min(1)),
    name: optional(z.string().min(1)),
    amount: z.number(),
  })
  .refine((v) => v.component || v.name, {
    message: "Each earning/deduction needs a component name",
  })
  .transform((v) => ({ component: (v.component ?? v.name)!, amount: v.amount }));

const earningSchema = payslipLineSchema;
const deductionSchema = payslipLineSchema;

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

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
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
    logger.error({ err: error }, "Error fetching payslips");
    return NextResponse.json(
      { error: "Failed to fetch payslips" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
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
      return notFound("Employee not found");
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
      return badRequest("Payslip already exists for this period");
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
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating payslip");
    return NextResponse.json(
      { error: "Failed to create payslip" },
      { status: 500 }
    );
  }
});

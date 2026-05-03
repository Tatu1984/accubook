import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import {
  calculatePayroll,
  calculatePF,
  calculateESI,
  calculateTDS,
  generateSalaryStructure,
  PF_CONFIG,
  ESI_CONFIG,
  NEW_REGIME_SLABS,
  OLD_REGIME_SLABS,
} from "@/backend/utils/payroll-calculations.util";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const calculatePayslipSchema = z.object({
  employeeId: z.string(),
  month: z.number().min(1).max(12),
  year: z.number(),
  workingDays: z.number().optional(),
  presentDays: z.number().optional(),
  lopDays: z.number().default(0),
  overtimePay: z.number().default(0),
  bonus: z.number().default(0),
  otherDeductions: z.number().default(0),
  taxRegime: z.enum(["new", "old"]).default("new"),
  declarations: z.object({
    section80C: z.number().optional(),
    section80D: z.number().optional(),
    hra: z.number().optional(),
    otherDeductions: z.number().optional(),
  }).optional(),
});

const bulkCalculateSchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number(),
  employeeIds: z.array(z.string()).optional(),
});

export const GET = withOrgAuth(async (request) => {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "config";

    if (view === "config") {
      // Return payroll configuration including tax slabs
      return NextResponse.json({
        pf: {
          wageLimit: PF_CONFIG.wageLimit,
          employeeContribution: PF_CONFIG.employeeContribution,
          employerContribution: PF_CONFIG.employerContribution,
          employerEPSContribution: PF_CONFIG.employerEPSContribution,
          employerEPFContribution: PF_CONFIG.employerEPFContribution,
        },
        esi: {
          wageLimit: ESI_CONFIG.wageLimit,
          employeeContribution: ESI_CONFIG.employeeContribution,
          employerContribution: ESI_CONFIG.employerContribution,
        },
        tds: {
          newRegimeSlabs: NEW_REGIME_SLABS.map(s => ({
            min: s.min,
            max: s.max === Infinity ? null : s.max,
            rate: s.rate,
          })),
          oldRegimeSlabs: OLD_REGIME_SLABS.map(s => ({
            min: s.min,
            max: s.max === Infinity ? null : s.max,
            rate: s.rate,
          })),
          standardDeductionNew: 75000,
          standardDeductionOld: 50000,
        },
        professionalTax: {
          slabs: [
            { min: 0, max: 7500, tax: 0 },
            { min: 7500, max: 10000, tax: 175 },
            { min: 10000, max: null, tax: 200 },
          ],
          note: "Maharashtra rates. February has Rs.300 for highest slab.",
        },
      });
    }

    if (view === "ctc-breakdown") {
      const annualCtc = parseFloat(searchParams.get("ctc") || "0");
      if (annualCtc <= 0) {
        return badRequest("CTC required");
      }

      const structure = generateSalaryStructure(annualCtc);
      const monthlyGross = structure.monthlyGross;

      // Calculate deductions
      const pf = calculatePF(structure.basic, structure.da || 0);
      const esi = calculateESI(monthlyGross);
      const tds = calculateTDS(annualCtc, "new");

      return NextResponse.json({
        annualCtc,
        monthlyCTC: annualCtc / 12,
        monthlyGross,
        structure: {
          basic: structure.basic,
          hra: structure.hra,
          da: structure.da,
          conveyance: structure.conveyance,
          specialAllowance: structure.specialAllowance,
        },
        employeeDeductions: {
          pf: pf.employee,
          esi: esi.employee,
          tds: tds.monthlyTds,
          total: pf.employee + esi.employee + tds.monthlyTds,
        },
        employerContributions: {
          pf: pf.employer,
          esi: esi.employer,
          total: pf.employer + esi.employer,
        },
        netSalary: monthlyGross - pf.employee - esi.employee - tds.monthlyTds,
        annualTax: tds.annualTax,
      });
    }

    return badRequest("Invalid view");
  } catch (error) {
    logger.error({ err: error }, "Error");
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { action = "calculate" } = body;

    if (action === "calculate") {
      const validationResult = calculatePayslipSchema.safeParse(body);
      if (!validationResult.success) {
        return badRequest("Validation failed", validationResult.error.issues);
      }

      const input = validationResult.data;

      // Get employee details
      const employee = await prisma.employee.findFirst({
        where: { id: input.employeeId, organizationId: orgId },
        include: {
          salaryStructure: true,
        },
      });

      if (!employee) {
        return notFound("Employee not found");
      }

      // Get attendance for the month
      const startOfMonth = new Date(input.year, input.month - 1, 1);
      const endOfMonth = new Date(input.year, input.month, 0);

      const attendance = await prisma.attendance.findMany({
        where: {
          employeeId: input.employeeId,
          date: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      const presentDays = input.presentDays ?? attendance.filter(
        a => ["PRESENT", "HALF_DAY", "LATE"].includes(a.status)
      ).length;

      const workingDays = input.workingDays ?? endOfMonth.getDate() -
        attendance.filter(a => ["HOLIDAY", "WEEKEND"].includes(a.status)).length;

      const lopDays = input.lopDays ?? attendance.filter(
        a => a.status === "ABSENT"
      ).length;

      // Parse salary structure
      const earnings = {
        basic: Number(employee.ctc || 0) / 12 * 0.5,
        hra: 0,
        da: 0,
        conveyance: 1600,
        specialAllowance: 0,
        otherAllowances: 0,
        overtimePay: input.overtimePay,
        bonus: input.bonus,
      };

      if (employee.salaryStructure?.components) {
        const components = employee.salaryStructure.components as Record<string, unknown>;
        if (components.basic) earnings.basic = Number(components.basic);
        if (components.hra) earnings.hra = Number(components.hra);
        if (components.da) earnings.da = Number(components.da);
        if (components.conveyance) earnings.conveyance = Number(components.conveyance);
        if (components.specialAllowance) earnings.specialAllowance = Number(components.specialAllowance);
      }

      // Calculate payroll
      const result = calculatePayroll({
        employeeId: employee.id,
        month: input.month,
        year: input.year,
        basicSalary: earnings.basic,
        earnings,
        workingDays,
        presentDays,
        lopDays,
        taxRegime: input.taxRegime,
        annualIncome: Number(employee.ctc || 0),
        declarations: input.declarations,
      });

      return NextResponse.json({
        employee: {
          id: employee.id,
          code: employee.employeeCode,
          name: `${employee.firstName} ${employee.lastName || ""}`.trim(),
        },
        month: input.month,
        year: input.year,
        attendance: {
          workingDays,
          presentDays,
          lopDays,
        },
        ...result,
      });
    }

    if (action === "bulk-calculate") {
      const validationResult = bulkCalculateSchema.safeParse(body);
      if (!validationResult.success) {
        return badRequest("Validation failed", validationResult.error.issues);
      }

      const { month, year, employeeIds } = validationResult.data;

      // Get all active employees
      const employees = await prisma.employee.findMany({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          ...(employeeIds ? { id: { in: employeeIds } } : {}),
        },
        include: {
          salaryStructure: true,
        },
      });

      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0);

      const results = await Promise.all(
        employees.map(async (employee) => {
          // Get attendance
          const attendance = await prisma.attendance.findMany({
            where: {
              employeeId: employee.id,
              date: { gte: startOfMonth, lte: endOfMonth },
            },
          });

          const presentDays = attendance.filter(
            a => ["PRESENT", "HALF_DAY", "LATE"].includes(a.status)
          ).length;

          const workingDays = endOfMonth.getDate() -
            attendance.filter(a => ["HOLIDAY", "WEEKEND"].includes(a.status)).length;

          const lopDays = attendance.filter(
            a => a.status === "ABSENT"
          ).length;

          // Parse salary structure
          const earnings = {
            basic: Number(employee.ctc || 0) / 12 * 0.5,
            hra: 0,
            da: 0,
            conveyance: 1600,
            specialAllowance: 0,
            otherAllowances: 0,
          };

          if (employee.salaryStructure?.components) {
            const components = employee.salaryStructure.components as Record<string, unknown>;
            if (components.basic) earnings.basic = Number(components.basic);
            if (components.hra) earnings.hra = Number(components.hra);
            if (components.da) earnings.da = Number(components.da);
            if (components.conveyance) earnings.conveyance = Number(components.conveyance);
            if (components.specialAllowance) earnings.specialAllowance = Number(components.specialAllowance);
          }

          const result = calculatePayroll({
            employeeId: employee.id,
            month,
            year,
            basicSalary: earnings.basic,
            earnings,
            workingDays,
            presentDays,
            lopDays,
            taxRegime: "new",
            annualIncome: Number(employee.ctc || 0),
          });

          return {
            employeeId: employee.id,
            employeeCode: employee.employeeCode,
            employeeName: `${employee.firstName} ${employee.lastName || ""}`.trim(),
            ...result,
          };
        })
      );

      const summary = {
        totalEmployees: results.length,
        totalGross: results.reduce((sum, r) => sum + r.grossSalary, 0),
        totalDeductions: results.reduce((sum, r) => sum + r.totalDeductions, 0),
        totalNet: results.reduce((sum, r) => sum + r.netSalary, 0),
        totalPF: results.reduce((sum, r) => sum + r.deductions.pf + r.employerContributions.pf, 0),
        totalESI: results.reduce((sum, r) => sum + r.deductions.esi + r.employerContributions.esi, 0),
        totalTDS: results.reduce((sum, r) => sum + r.deductions.tds, 0),
      };

      return NextResponse.json({
        month,
        year,
        payslips: results,
        summary,
      });
    }

    if (action === "generate-payslips") {
      const validationResult = bulkCalculateSchema.safeParse(body);
      if (!validationResult.success) {
        return badRequest("Validation failed", validationResult.error.issues);
      }

      const { month, year, employeeIds } = validationResult.data;

      // Get employees and calculate
      const employees = await prisma.employee.findMany({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          ...(employeeIds ? { id: { in: employeeIds } } : {}),
        },
        include: { salaryStructure: true },
      });

      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0);

      const createdPayslips = [];

      for (const employee of employees) {
        // Check if payslip already exists
        const existing = await prisma.payslip.findUnique({
          where: {
            employeeId_month_year: {
              employeeId: employee.id,
              month,
              year,
            },
          },
        });

        if (existing) continue;

        // Get attendance
        const attendance = await prisma.attendance.findMany({
          where: {
            employeeId: employee.id,
            date: { gte: startOfMonth, lte: endOfMonth },
          },
        });

        const presentDays = attendance.filter(
          a => ["PRESENT", "HALF_DAY", "LATE"].includes(a.status)
        ).length;

        const workingDays = endOfMonth.getDate() -
          attendance.filter(a => ["HOLIDAY", "WEEKEND"].includes(a.status)).length;

        const lopDays = attendance.filter(a => a.status === "ABSENT").length;

        // Calculate
        const earnings = {
          basic: Number(employee.ctc || 0) / 12 * 0.5,
          hra: 0,
          da: 0,
          conveyance: 1600,
          specialAllowance: 0,
        };

        if (employee.salaryStructure?.components) {
          const components = employee.salaryStructure.components as Record<string, unknown>;
          if (components.basic) earnings.basic = Number(components.basic);
          if (components.hra) earnings.hra = Number(components.hra);
          if (components.da) earnings.da = Number(components.da);
          if (components.conveyance) earnings.conveyance = Number(components.conveyance);
          if (components.specialAllowance) earnings.specialAllowance = Number(components.specialAllowance);
        }

        const result = calculatePayroll({
          employeeId: employee.id,
          month,
          year,
          basicSalary: earnings.basic,
          earnings,
          workingDays,
          presentDays,
          lopDays,
          taxRegime: "new",
          annualIncome: Number(employee.ctc || 0),
        });

        // Create payslip
        const payslip = await prisma.payslip.create({
          data: {
            employeeId: employee.id,
            month,
            year,
            basicSalary: earnings.basic,
            earnings: result.breakdown.filter(b => b.type === "earning").map(b => ({
              component: b.component,
              amount: b.amount,
            })),
            deductions: result.breakdown.filter(b => b.type === "deduction").map(b => ({
              component: b.component,
              amount: b.amount,
            })),
            grossSalary: result.grossSalary,
            totalDeductions: result.totalDeductions,
            netSalary: result.netSalary,
            workingDays,
            presentDays,
            lopDays,
            status: "DRAFT",
          },
        });

        createdPayslips.push(payslip);
      }

      return NextResponse.json({
        message: `Generated ${createdPayslips.length} payslips`,
        count: createdPayslips.length,
        payslipIds: createdPayslips.map(p => p.id),
      });
    }

    return badRequest("Invalid action");
  } catch (error) {
    logger.error({ err: error }, "Error");
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single employee: read, amend, deactivate.
 *
 * The employees list offered Edit and Deactivate with no route behind either —
 * `/employees` only ever exposed GET and POST, so a record could be created
 * but never corrected and a leaver could never be taken off the active roll.
 */

export const GET = withOrgAuth<{ employeeId: string }>(
  async (_request, { orgId, params }) => {
    try {
      const employee = await prisma.employee.findFirst({
        where: { id: params.employeeId, organizationId: orgId },
        include: {
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      });
      if (!employee) return notFound("Employee not found");
      return NextResponse.json(employee);
    } catch (error) {
      logger.error({ err: error }, "Error fetching employee");
      return NextResponse.json(
        { error: "Failed to fetch employee" },
        { status: 500 }
      );
    }
  }
);

const updateEmployeeSchema = z.object({
  employeeCode: optional(z.string().min(1)),
  firstName: optional(z.string().min(1)),
  lastName: optional(z.string()),
  email: optional(z.string().email()),
  phone: optional(z.string()),
  dateOfBirth: optional(z.string()),
  gender: optional(z.string()),
  maritalStatus: optional(z.string()),
  address: optional(z.string()),
  city: optional(z.string()),
  state: optional(z.string()),
  country: optional(z.string()),
  postalCode: optional(z.string()),
  departmentId: optional(z.string()),
  designationId: optional(z.string()),
  branchId: optional(z.string()),
  reportingTo: optional(z.string()),
  joiningDate: optional(z.string()),
  resignationDate: optional(z.string()),
  relievingDate: optional(z.string()),
  employmentType: optional(z.string()),
  status: optional(z.enum(["ACTIVE", "ON_NOTICE", "RELIEVED", "TERMINATED"])),
  panNo: optional(z.string()),
  aadharNo: optional(z.string()),
  uan: optional(z.string()),
  pfNo: optional(z.string()),
  esiNo: optional(z.string()),
  bankName: optional(z.string()),
  bankBranch: optional(z.string()),
  bankAccountNo: optional(z.string()),
  bankIfsc: optional(z.string()),
  ctc: optional(z.number().min(0)),
});

export const PATCH = withOrgAuth<{ employeeId: string }>(
  async (request, { orgId, userId, params }) => {
    try {
      const { employeeId } = params;
      const body = await request.json();
      const data = updateEmployeeSchema.parse(body);

      const existing = await prisma.employee.findFirst({
        where: { id: employeeId, organizationId: orgId },
      });
      if (!existing) return notFound("Employee not found");

      // Employee codes are unique per organization.
      if (data.employeeCode && data.employeeCode !== existing.employeeCode) {
        const clash = await prisma.employee.findFirst({
          where: {
            organizationId: orgId,
            employeeCode: data.employeeCode,
            NOT: { id: employeeId },
          },
          select: { id: true },
        });
        if (clash) {
          return badRequest(
            `Employee code ${data.employeeCode} is already in use`
          );
        }
      }

      const toDate = (value?: string) => (value ? new Date(value) : undefined);

      const updated = await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.update({
          where: { id: employeeId },
          data: {
            ...data,
            dateOfBirth: toDate(data.dateOfBirth),
            joiningDate: toDate(data.joiningDate),
            resignationDate: toDate(data.resignationDate),
            relievingDate: toDate(data.relievingDate),
          },
          include: {
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        });

        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "UPDATE",
          entityType: "Employee",
          entityId: employeeId,
          oldData: {
            status: existing.status,
            employeeCode: existing.employeeCode,
          },
          newData: { status: employee.status, employeeCode: employee.employeeCode },
        });

        return employee;
      });

      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return badRequest("Validation failed", error.issues);
      }
      logger.error({ err: error }, "Error updating employee");
      return NextResponse.json(
        { error: "Failed to update employee" },
        { status: 500 }
      );
    }
  }
);

/**
 * Employees are never hard-deleted once they have payroll, attendance or
 * leave history — that history is a statutory record. The delete falls back
 * to marking the employee TERMINATED, and reports which it did.
 */
export const DELETE = withOrgAuth<{ employeeId: string }>(
  async (_request, { orgId, userId, params }) => {
    try {
      const { employeeId } = params;

      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, organizationId: orgId },
        include: {
          _count: {
            select: {
              payslips: true,
              attendances: true,
              leaves: true,
              expenseClaims: true,
            },
          },
        },
      });
      if (!employee) return notFound("Employee not found");

      const hasHistory =
        employee._count.payslips > 0 ||
        employee._count.attendances > 0 ||
        employee._count.leaves > 0 ||
        employee._count.expenseClaims > 0;

      await prisma.$transaction(async (tx) => {
        if (hasHistory) {
          await tx.employee.update({
            where: { id: employeeId },
            data: { status: "TERMINATED", relievingDate: new Date() },
          });
        } else {
          await tx.employee.delete({ where: { id: employeeId } });
        }
        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: hasHistory ? "UPDATE" : "DELETE",
          entityType: "Employee",
          entityId: employeeId,
          oldData: { employeeCode: employee.employeeCode, status: employee.status },
          newData: hasHistory ? { status: "TERMINATED" } : undefined,
        });
      });

      return NextResponse.json({ success: true, softDeleted: hasHistory });
    } catch (error) {
      logger.error({ err: error }, "Error deleting employee");
      return NextResponse.json(
        { error: "Failed to delete employee" },
        { status: 500 }
      );
    }
  }
);

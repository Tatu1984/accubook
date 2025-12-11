import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

const registerSchema = z.object({
  // User details
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),

  // Organization details
  companyName: z.string().min(1, "Company name is required"),
  gstin: z.string().optional(),
  country: z.string().default("IN"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Get the admin role (system role)
    const adminRole = await prisma.role.findFirst({
      where: { name: "ADMIN", isSystem: true },
    });

    if (!adminRole) {
      return NextResponse.json(
        { error: "System not configured. Please contact administrator." },
        { status: 500 }
      );
    }

    // Create user, organization in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          name: `${validatedData.firstName} ${validatedData.lastName}`,
          email: validatedData.email,
          phone: validatedData.phone,
          passwordHash: hashedPassword,
        },
      });

      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: validatedData.companyName,
          gstNo: validatedData.gstin,
          country: validatedData.country,
          fiscalYearStart: 4, // April (month number)
        },
      });

      // Link user to organization with admin role
      await tx.organizationUser.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          roleId: adminRole.id,
          isActive: true,
        },
      });

      // Create default fiscal year
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;
      const fiscalStartYear = currentMonth >= 4 ? currentYear : currentYear - 1;

      await tx.fiscalYear.create({
        data: {
          organizationId: organization.id,
          name: `FY ${fiscalStartYear}-${(fiscalStartYear + 1).toString().slice(-2)}`,
          startDate: new Date(`${fiscalStartYear}-04-01`),
          endDate: new Date(`${fiscalStartYear + 1}-03-31`),
          isClosed: false,
        },
      });

      // Create default ledger groups for the organization
      const ledgerGroups = [
        { name: "Assets", nature: "ASSETS" },
        { name: "Current Assets", nature: "ASSETS", parentName: "Assets" },
        { name: "Fixed Assets", nature: "ASSETS", parentName: "Assets" },
        { name: "Liabilities", nature: "LIABILITIES" },
        { name: "Current Liabilities", nature: "LIABILITIES", parentName: "Liabilities" },
        { name: "Long-term Liabilities", nature: "LIABILITIES", parentName: "Liabilities" },
        { name: "Equity", nature: "EQUITY" },
        { name: "Income", nature: "INCOME" },
        { name: "Sales Income", nature: "INCOME", parentName: "Income" },
        { name: "Other Income", nature: "INCOME", parentName: "Income" },
        { name: "Expenses", nature: "EXPENSES" },
        { name: "Direct Expenses", nature: "EXPENSES", parentName: "Expenses" },
        { name: "Indirect Expenses", nature: "EXPENSES", parentName: "Expenses" },
      ];

      const createdGroups: Record<string, string> = {};

      for (const group of ledgerGroups) {
        const parentId = group.parentName ? createdGroups[group.parentName] : null;
        const created = await tx.ledgerGroup.create({
          data: {
            organizationId: organization.id,
            name: group.name,
            nature: group.nature,
            parentId,
            isSystem: true,
          },
        });
        createdGroups[group.name] = created.id;
      }

      // Create default warehouse
      await tx.warehouse.create({
        data: {
          organizationId: organization.id,
          name: "Main Warehouse",
          code: "WH-001",
          isDefault: true,
          isActive: true,
        },
      });

      return { user, organization };
    });

    return NextResponse.json(
      {
        message: "Registration successful",
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
        },
        organization: {
          id: result.organization.id,
          name: result.organization.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}

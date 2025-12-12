import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  legalName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default("IN"),
  postalCode: z.string().optional(),
  gstNo: z.string().optional(),
  panNo: z.string().optional(),
  tanNo: z.string().optional(),
  baseCurrencyId: z.string(),
  fiscalYearStart: z.number().min(1).max(12).default(4),
});

export async function GET() {
  try {
    await cookies();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizations = await prisma.organization.findMany({
      where: {
        users: {
          some: {
            userId: session.user.id,
          },
        },
      },
      include: {
        baseCurrency: true,
        branches: true,
        _count: {
          select: {
            users: true,
            ledgers: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(organizations);
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await cookies();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createOrganizationSchema.parse(body);

    // Find or create the admin role
    let adminRole = await prisma.role.findFirst({
      where: { name: "Admin" },
    });

    if (!adminRole) {
      adminRole = await prisma.role.create({
        data: {
          name: "Admin",
          description: "Full administrative access",
          permissions: [
            "manage_organization",
            "manage_users",
            "manage_roles",
            "view_all_data",
            "create_vouchers",
            "approve_vouchers",
            "manage_parties",
            "manage_inventory",
            "manage_banking",
            "view_reports",
            "manage_hr",
            "approve_leaves",
            "approve_expenses",
          ],
          isSystem: true,
        },
      });
    }

    const organization = await prisma.organization.create({
      data: {
        ...validatedData,
        users: {
          create: {
            userId: session.user.id,
            roleId: adminRole.id,
          },
        },
      },
      include: {
        baseCurrency: true,
      },
    });

    return NextResponse.json(organization, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating organization:", error);
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}

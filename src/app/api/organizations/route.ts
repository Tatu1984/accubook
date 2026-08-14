import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/backend/services/auth.service";
import { prisma } from "@/backend/database/client";
import { cookies } from "next/headers";
import { logger } from "@/backend/utils/logger";
import { provisionOrganization } from "@/backend/services/organization/provision";
import { getOrCreateAdminRoleId } from "@/backend/services/organization/roles";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";
import { optional } from "@/backend/validators/common";

const createOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  legalName: optional(z.string()),
  email: optional(z.string().email()),
  phone: optional(z.string()),
  address: optional(z.string()),
  city: optional(z.string()),
  state: optional(z.string()),
  country: z.string().default("IN"),
  postalCode: optional(z.string()),
  gstNo: optional(z.string()),
  panNo: optional(z.string()),
  tanNo: optional(z.string()),
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
    logger.error({ err: error }, "Error fetching organizations");
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

    // One transaction: the organization, its creator as ADMIN, and the
    // chart of accounts / fiscal year / branch / warehouse that make it
    // usable. Previously this created a role named "Admin" whose
    // permissions were a flat list of strings — a shape `hasPermission`
    // has never understood — so the person who created the organization
    // could not approve anything in it. It also skipped provisioning
    // entirely, so the first payment failed on a missing ledger group.
    const organization = await prisma.$transaction(async (tx) => {
      const adminRoleId = await getOrCreateAdminRoleId(tx);

      const org = await tx.organization.create({
        data: {
          ...validatedData,
          users: {
            create: {
              userId: session.user.id,
              roleId: adminRoleId,
            },
          },
        },
        include: {
          baseCurrency: true,
        },
      });

      await provisionOrganization(tx, {
        organizationId: org.id,
        fiscalYearStartMonth: validatedData.fiscalYearStart,
      });

      return org;
    });

    return NextResponse.json(organization, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating organization");
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}

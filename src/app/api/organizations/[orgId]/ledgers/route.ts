import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createLedgerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: optional(z.string()),
  groupId: z.string().min(1, "Group is required"),
  description: optional(z.string()),
  openingBalance: z.number().default(0),
  openingBalanceType: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
  gstNo: optional(z.string()),
  panNo: optional(z.string()),
  address: optional(z.string()),
  city: optional(z.string()),
  state: optional(z.string()),
  country: optional(z.string()),
  contactPerson: optional(z.string()),
  phone: optional(z.string()),
  email: optional(z.string().email()).or(z.literal("")),
  creditLimit: optional(z.number()),
  creditDays: optional(z.number()),
  bankAccountNo: optional(z.string()),
  bankName: optional(z.string()),
  ifscCode: optional(z.string()),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    const search = searchParams.get("search");
    const type = searchParams.get("type"); // customer, vendor, bank, etc.

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (groupId) {
      where.groupId = groupId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    if (type === "customer") {
      where.group = {
        name: "Sundry Debtors",
      };
    } else if (type === "vendor") {
      where.group = {
        name: "Sundry Creditors",
      };
    } else if (type === "bank") {
      where.group = {
        name: "Cash & Bank",
      };
    }

    const ledgers = await prisma.ledger.findMany({
      where,
      include: {
        group: {
          select: {
            id: true,
            name: true,
            nature: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(ledgers);
  } catch (error) {
    logger.error({ err: error }, "Error fetching ledgers");
    return NextResponse.json(
      { error: "Failed to fetch ledgers" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createLedgerSchema.parse(body);

    // Check if name already exists
    const existing = await prisma.ledger.findUnique({
      where: {
        organizationId_name: {
          organizationId: orgId,
          name: validatedData.name,
        },
      },
    });

    if (existing) {
      return badRequest("Ledger with this name already exists");
    }

    // Handle empty email
    const data = { ...validatedData };
    if (data.email === "") {
      delete data.email;
    }

    const ledger = await prisma.ledger.create({
      data: {
        organizationId: orgId,
        ...data,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            nature: true,
          },
        },
      },
    });

    return NextResponse.json(ledger, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating ledger");
    return NextResponse.json(
      { error: "Failed to create ledger" },
      { status: 500 }
    );
  }
});

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createLedgerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().optional(),
  groupId: z.string().min(1, "Group is required"),
  description: z.string().optional(),
  openingBalance: z.number().default(0),
  openingBalanceType: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
  gstNo: z.string().optional(),
  panNo: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  creditLimit: z.number().optional(),
  creditDays: z.number().optional(),
  bankAccountNo: z.string().optional(),
  bankName: z.string().optional(),
  ifscCode: z.string().optional(),
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
    console.error("Error fetching ledgers:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledgers" },
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
      return NextResponse.json(
        { error: "Ledger with this name already exists" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating ledger:", error);
    return NextResponse.json(
      { error: "Failed to create ledger" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createPartySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["CUSTOMER", "VENDOR", "BOTH"]),
  code: z.string().optional(),
  contactPerson: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  website: z.string().optional(),
  gstNo: z.string().optional(),
  panNo: z.string().optional(),
  gstRegistrationType: z.string().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingCountry: z.string().optional(),
  billingPostal: z.string().optional(),
  shippingAddress: z.string().optional(),
  shippingCity: z.string().optional(),
  shippingState: z.string().optional(),
  shippingCountry: z.string().optional(),
  shippingPostal: z.string().optional(),
  creditLimit: z.number().min(0).optional(),
  creditDays: z.number().min(0).optional(),
  paymentTerms: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  bankAccountNo: z.string().optional(),
  bankIfsc: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
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
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    const andConditions: Record<string, unknown>[] = [];

    if (type) {
      // Support both lowercase and uppercase type values
      const normalizedType = type.toUpperCase();
      // Handle CUSTOMER/VENDOR/BOTH + support for 'customer' mapping to CUSTOMER or BOTH
      if (normalizedType === "CUSTOMER") {
        andConditions.push({ OR: [{ type: "CUSTOMER" }, { type: "BOTH" }] });
      } else if (normalizedType === "VENDOR") {
        andConditions.push({ OR: [{ type: "VENDOR" }, { type: "BOTH" }] });
      } else {
        where.type = normalizedType;
      }
    }

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    if (search) {
      andConditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { gstNo: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [parties, total] = await Promise.all([
      prisma.party.findMany({
        where,
        include: {
          ledgers: {
            select: {
              id: true,
              name: true,
              currentBalance: true,
            },
            take: 1,
          },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.party.count({ where }),
    ]);

    return NextResponse.json({
      data: parties,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching parties:", error);
    return NextResponse.json(
      { error: "Failed to fetch parties" },
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
    const validatedData = createPartySchema.parse(body);

    // Check if GSTIN already exists
    if (validatedData.gstNo) {
      const existingGstin = await prisma.party.findFirst({
        where: {
          organizationId: orgId,
          gstNo: validatedData.gstNo,
        },
      });

      if (existingGstin) {
        return NextResponse.json(
          { error: "GSTIN already exists" },
          { status: 400 }
        );
      }
    }

    const party = await prisma.party.create({
      data: {
        organizationId: orgId,
        ...validatedData,
        email: validatedData.email || null,
      },
      include: {
        ledgers: true,
      },
    });

    return NextResponse.json(party, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating party:", error);
    return NextResponse.json(
      { error: "Failed to create party" },
      { status: 500 }
    );
  }
}

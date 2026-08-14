import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createPartySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["CUSTOMER", "VENDOR", "BOTH"]),
  code: optional(z.string()),
  contactPerson: optional(z.string()),
  email: optional(z.string().email()).or(z.literal("")),
  phone: optional(z.string()),
  mobile: optional(z.string()),
  website: optional(z.string()),
  gstNo: optional(z.string()),
  panNo: optional(z.string()),
  gstRegistrationType: optional(z.string()),
  billingAddress: optional(z.string()),
  billingCity: optional(z.string()),
  billingState: optional(z.string()),
  billingCountry: optional(z.string()),
  billingPostal: optional(z.string()),
  shippingAddress: optional(z.string()),
  shippingCity: optional(z.string()),
  shippingState: optional(z.string()),
  shippingCountry: optional(z.string()),
  shippingPostal: optional(z.string()),
  creditLimit: optional(z.number().min(0)),
  creditDays: optional(z.number().min(0)),
  paymentTerms: optional(z.string()),
  bankName: optional(z.string()),
  bankBranch: optional(z.string()),
  bankAccountNo: optional(z.string()),
  bankIfsc: optional(z.string()),
  notes: optional(z.string()),
  tags: optional(z.array(z.string())),
  isActive: z.boolean().default(true),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
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
    logger.error({ err: error }, "Error fetching parties");
    return NextResponse.json(
      { error: "Failed to fetch parties" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
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
        return badRequest("GSTIN already exists");
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
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating party");
    return NextResponse.json(
      { error: "Failed to create party" },
      { status: 500 }
    );
  }
});

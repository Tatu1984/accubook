import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { z } from "zod";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createGSTReturnSchema = z.object({
  returnType: z.enum(["GSTR1", "GSTR3B", "GSTR9"]),
  period: z.string().min(1, "Period is required"),
  dueDate: z.string().transform((val) => new Date(val)),
  filingDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  totalTaxLiability: z.number().optional(),
  totalItcClaimed: z.number().optional(),
  netPayable: z.number().optional(),
  arn: z.string().optional(),
  status: z.enum(["PENDING", "FILED", "REVISED"]).default("PENDING"),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const returnType = searchParams.get("returnType");
    const status = searchParams.get("status");
    const year = searchParams.get("year");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (returnType) {
      where.returnType = returnType;
    }

    if (status) {
      where.status = status;
    }

    if (year) {
      where.period = { contains: year };
    }

    const [returns, total] = await Promise.all([
      prisma.gSTReturn.findMany({
        where,
        orderBy: [
          { dueDate: "desc" },
          { returnType: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.gSTReturn.count({ where }),
    ]);

    return NextResponse.json({
      data: returns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching GST returns:", error);
    return NextResponse.json(
      { error: "Failed to fetch GST returns" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createGSTReturnSchema.parse(body);

    const gstReturn = await prisma.gSTReturn.create({
      data: {
        organizationId: orgId,
        returnType: validatedData.returnType,
        period: validatedData.period,
        dueDate: validatedData.dueDate,
        filingDate: validatedData.filingDate,
        totalTaxLiability: validatedData.totalTaxLiability,
        totalItcClaimed: validatedData.totalItcClaimed,
        netPayable: validatedData.netPayable,
        arn: validatedData.arn,
        status: validatedData.status,
      },
    });

    return NextResponse.json(gstReturn, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    console.error("Error creating GST return:", error);
    return NextResponse.json(
      { error: "Failed to create GST return" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { returnId, ...updateData } = body;

    if (!returnId) {
      return badRequest("Return ID is required");
    }

    // Verify return belongs to organization
    const existing = await prisma.gSTReturn.findFirst({
      where: {
        id: returnId,
        organizationId: orgId,
      },
    });

    if (!existing) {
      return notFound("GST return not found");
    }

    // Parse dates if provided
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }
    if (updateData.filingDate) {
      updateData.filingDate = new Date(updateData.filingDate);
    }

    const gstReturn = await prisma.gSTReturn.update({
      where: { id: returnId },
      data: updateData,
    });

    return NextResponse.json(gstReturn);
  } catch (error) {
    console.error("Error updating GST return:", error);
    return NextResponse.json(
      { error: "Failed to update GST return" },
      { status: 500 }
    );
  }
});

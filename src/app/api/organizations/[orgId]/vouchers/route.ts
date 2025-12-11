import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const voucherEntrySchema = z.object({
  ledgerId: z.string().min(1, "Ledger is required"),
  debitAmount: z.number().min(0).default(0),
  creditAmount: z.number().min(0).default(0),
  narration: z.string().optional(),
  costCenterId: z.string().optional(),
  projectId: z.string().optional(),
});

const createVoucherSchema = z.object({
  voucherTypeId: z.string().min(1, "Voucher type is required"),
  fiscalYearId: z.string().min(1, "Fiscal year is required"),
  date: z.string().min(1, "Date is required"),
  narration: z.string().optional(),
  referenceNo: z.string().optional(),
  branchId: z.string().optional(),
  entries: z.array(voucherEntrySchema).min(2, "At least 2 entries required"),
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
    const voucherTypeId = searchParams.get("voucherTypeId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (voucherTypeId) {
      where.voucherTypeId = voucherTypeId;
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { voucherNumber: { contains: search, mode: "insensitive" } },
        { narration: { contains: search, mode: "insensitive" } },
        { referenceNo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [vouchers, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        include: {
          voucherType: {
            select: {
              id: true,
              name: true,
              code: true,
              nature: true,
            },
          },
          entries: {
            include: {
              ledger: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.voucher.count({ where }),
    ]);

    return NextResponse.json({
      data: vouchers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching vouchers:", error);
    return NextResponse.json(
      { error: "Failed to fetch vouchers" },
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
    const validatedData = createVoucherSchema.parse(body);

    // Validate double-entry: total debit must equal total credit
    const totalDebit = validatedData.entries.reduce((sum, e) => sum + e.debitAmount, 0);
    const totalCredit = validatedData.entries.reduce((sum, e) => sum + e.creditAmount, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json(
        { error: "Total debit must equal total credit" },
        { status: 400 }
      );
    }

    // Get voucher type for numbering
    const voucherType = await prisma.voucherType.findUnique({
      where: { id: validatedData.voucherTypeId },
    });

    if (!voucherType) {
      return NextResponse.json(
        { error: "Invalid voucher type" },
        { status: 400 }
      );
    }

    // Generate voucher number
    const lastVoucher = await prisma.voucher.findFirst({
      where: {
        organizationId: orgId,
        voucherTypeId: validatedData.voucherTypeId,
      },
      orderBy: { createdAt: "desc" },
    });

    const nextNumber = lastVoucher
      ? parseInt(lastVoucher.voucherNumber.split("/").pop() || "0") + 1
      : 1;

    const voucherNumber = `${voucherType.numberingPrefix}${new Date().getFullYear()}/${nextNumber.toString().padStart(5, "0")}`;

    // Create voucher with entries in transaction
    const voucher = await prisma.$transaction(async (tx) => {
      const newVoucher = await tx.voucher.create({
        data: {
          organizationId: orgId,
          voucherTypeId: validatedData.voucherTypeId,
          fiscalYearId: validatedData.fiscalYearId,
          voucherNumber,
          date: new Date(validatedData.date),
          narration: validatedData.narration,
          referenceNo: validatedData.referenceNo,
          branchId: validatedData.branchId,
          totalDebit,
          totalCredit,
          status: "PENDING",
          createdById: session.user.id,
          entries: {
            create: validatedData.entries.map((entry, index) => ({
              ledgerId: entry.ledgerId,
              debitAmount: entry.debitAmount,
              creditAmount: entry.creditAmount,
              narration: entry.narration,
              costCenterId: entry.costCenterId,
              projectId: entry.projectId,
              sequence: index + 1,
            })),
          },
        },
        include: {
          voucherType: true,
          entries: {
            include: {
              ledger: true,
            },
          },
        },
      });

      return newVoucher;
    });

    return NextResponse.json(voucher, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating voucher:", error);
    return NextResponse.json(
      { error: "Failed to create voucher" },
      { status: 500 }
    );
  }
}

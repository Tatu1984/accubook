import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createReceiptSchema = z.object({
  partyId: z.string().min(1, "Party is required"),
  invoiceId: z.string().optional(),
  date: z.string().transform((val) => new Date(val)),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMode: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "CARD"]),
  bankAccountId: z.string().optional(),
  chequeNo: z.string().optional(),
  chequeDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  transactionRef: z.string().optional(),
  notes: z.string().optional(),
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
    const partyId = searchParams.get("partyId");
    const status = searchParams.get("status");
    const paymentMode = searchParams.get("paymentMode");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (partyId) {
      where.partyId = partyId;
    }

    if (status) {
      where.status = status;
    }

    if (paymentMode) {
      where.paymentMode = paymentMode;
    }

    if (search) {
      where.OR = [
        { receiptNumber: { contains: search, mode: "insensitive" } },
        { transactionRef: { contains: search, mode: "insensitive" } },
        { party: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        include: {
          party: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
            },
          },
          bankAccount: {
            select: {
              id: true,
              name: true,
              bankName: true,
            },
          },
        },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.receipt.count({ where }),
    ]);

    return NextResponse.json({
      data: receipts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching receipts:", error);
    return NextResponse.json(
      { error: "Failed to fetch receipts" },
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
    const validatedData = createReceiptSchema.parse(body);

    // Generate receipt number
    const lastReceipt = await prisma.receipt.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      select: { receiptNumber: true },
    });

    const receiptNumber = lastReceipt
      ? `RCT-${String(parseInt(lastReceipt.receiptNumber.split("-")[1] || "0") + 1).padStart(6, "0")}`
      : "RCT-000001";

    const receipt = await prisma.receipt.create({
      data: {
        organizationId: orgId,
        receiptNumber,
        partyId: validatedData.partyId,
        invoiceId: validatedData.invoiceId,
        date: validatedData.date,
        amount: validatedData.amount,
        paymentMode: validatedData.paymentMode,
        bankAccountId: validatedData.bankAccountId,
        chequeNo: validatedData.chequeNo,
        chequeDate: validatedData.chequeDate,
        transactionRef: validatedData.transactionRef,
        notes: validatedData.notes,
        status: "COMPLETED",
      },
      include: {
        party: true,
        invoice: true,
        bankAccount: true,
      },
    });

    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating receipt:", error);
    return NextResponse.json(
      { error: "Failed to create receipt" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createPaymentSchema = z.object({
  partyId: z.string().min(1, "Party is required"),
  billId: z.string().optional(),
  date: z.string().transform((val) => new Date(val)),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMode: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "NEFT", "RTGS", "UPI"]),
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
        { paymentNumber: { contains: search, mode: "insensitive" } },
        { transactionRef: { contains: search, mode: "insensitive" } },
        { party: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          party: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          bill: {
            select: {
              id: true,
              billNumber: true,
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
      prisma.payment.count({ where }),
    ]);

    return NextResponse.json({
      data: payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    return NextResponse.json(
      { error: "Failed to fetch payments" },
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
    const validatedData = createPaymentSchema.parse(body);

    // Generate payment number
    const lastPayment = await prisma.payment.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      select: { paymentNumber: true },
    });

    const paymentNumber = lastPayment
      ? `PAY-${String(parseInt(lastPayment.paymentNumber.split("-")[1] || "0") + 1).padStart(6, "0")}`
      : "PAY-000001";

    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        paymentNumber,
        partyId: validatedData.partyId,
        billId: validatedData.billId,
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
        bill: true,
        bankAccount: true,
      },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating payment:", error);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}

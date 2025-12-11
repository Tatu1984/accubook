import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const invoiceItemSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  hsnCode: z.string().optional(),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxId: z.string().optional(),
  taxAmount: z.number().min(0).default(0),
});

const createInvoiceSchema = z.object({
  partyId: z.string().min(1, "Customer is required"),
  date: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  type: z.enum(["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "PROFORMA"]).default("INVOICE"),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  salesOrderId: z.string().optional(),
  currencyId: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, "At least 1 item required"),
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
    const type = searchParams.get("type");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
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

    if (type) {
      where.type = type;
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { party: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          party: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                },
              },
            },
          },
          payments: true,
          _count: {
            select: {
              items: true,
            },
          },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json({
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
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
    const validatedData = createInvoiceSchema.parse(body);

    // Generate invoice number
    const lastInvoice = await prisma.invoice.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });

    const currentFY =
      new Date().getMonth() >= 3
        ? new Date().getFullYear()
        : new Date().getFullYear() - 1;

    const nextNumber = lastInvoice
      ? parseInt(lastInvoice.invoiceNumber.split("/").pop() || "0") + 1
      : 1;

    const invoiceNumber = `INV/${currentFY}-${(currentFY + 1)
      .toString()
      .slice(-2)}/${nextNumber.toString().padStart(5, "0")}`;

    // Calculate totals
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    const itemsWithCalculations = validatedData.items.map((item) => {
      const lineTotal = item.quantity * item.unitPrice;
      const discountAmount = (lineTotal * item.discountPercent) / 100;
      const taxableAmount = lineTotal - discountAmount;
      const taxAmount = item.taxAmount;
      const total = taxableAmount + taxAmount;

      subtotal += taxableAmount;
      totalTax += taxAmount;
      totalDiscount += discountAmount;

      return {
        ...item,
        discountAmount,
        taxableAmount,
        totalAmount: total,
      };
    });

    const grandTotal = subtotal + totalTax;

    // Create invoice with items
    const invoice = await prisma.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          organizationId: orgId,
          invoiceNumber,
          partyId: validatedData.partyId,
          date: new Date(validatedData.date),
          dueDate: new Date(validatedData.dueDate),
          type: validatedData.type,
          billingAddress: validatedData.billingAddress,
          shippingAddress: validatedData.shippingAddress,
          notes: validatedData.notes,
          terms: validatedData.terms,
          salesOrderId: validatedData.salesOrderId,
          currencyId: validatedData.currencyId,
          subtotal,
          taxAmount: totalTax,
          discountAmount: totalDiscount,
          totalAmount: grandTotal,
          amountDue: grandTotal,
          status: "DRAFT",
          items: {
            create: itemsWithCalculations.map((item, index) => ({
              itemId: item.itemId,
              description: item.description,
              hsnCode: item.hsnCode,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              discountAmount: item.discountAmount,
              taxableAmount: item.taxableAmount,
              taxId: item.taxId,
              taxAmount: item.taxAmount,
              totalAmount: item.totalAmount,
              sequence: index + 1,
            })),
          },
        },
        include: {
          party: true,
          items: {
            include: {
              item: true,
            },
          },
        },
      });

      return newInvoice;
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating invoice:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}

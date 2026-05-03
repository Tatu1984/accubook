import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { D, sum } from "@/backend/utils/money";
import { nextNumber } from "@/backend/utils/posting";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
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
    logger.error({ err: error }, "Error fetching invoices");
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createInvoiceSchema.parse(body);

    // FY label for the invoice number prefix. India fiscal year starts April.
    const currentFY =
      new Date().getMonth() >= 3
        ? new Date().getFullYear()
        : new Date().getFullYear() - 1;
    const fyLabel = `${currentFY}-${(currentFY + 1).toString().slice(-2)}`;

    // All money math via Decimal — never via JS floats.
    const itemsWithCalculations = validatedData.items.map((item) => {
      const lineTotal = D(item.quantity).times(D(item.unitPrice));
      const discountAmount = lineTotal.times(D(item.discountPercent)).dividedBy(D(100));
      const taxableAmount = lineTotal.minus(discountAmount);
      const taxAmount = D(item.taxAmount);
      const totalAmount = taxableAmount.plus(taxAmount);

      return {
        ...item,
        quantity: D(item.quantity),
        unitPrice: D(item.unitPrice),
        discountPercent: D(item.discountPercent),
        discountAmount,
        taxableAmount,
        taxAmount,
        totalAmount,
      };
    });

    const subtotal = sum(itemsWithCalculations.map((i) => i.taxableAmount));
    const totalTax = sum(itemsWithCalculations.map((i) => i.taxAmount));
    const totalDiscount = sum(itemsWithCalculations.map((i) => i.discountAmount));
    const grandTotal = subtotal.plus(totalTax);

    // Create invoice with items, race-safe numbering inside the same tx.
    // Scope = "INVOICE:<fyLabel>" so each fiscal year resets to 1.
    const invoice = await prisma.$transaction(async (tx) => {
      const seq = await nextNumber(tx, orgId, `INVOICE:${fyLabel}`);
      const invoiceNumber = `INV/${fyLabel}/${String(seq).padStart(5, "0")}`;

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
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating invoice");
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attachmentSchema = z.object({
  name: z.string(),
  size: z.number(),
  type: z.string(),
  data: z.string(),
});

const createBillSchema = z.object({
  partyId: z.string().min(1, "Vendor is required"),
  date: z.string().transform((val) => new Date(val)),
  dueDate: z.string().transform((val) => new Date(val)),
  vendorBillNo: z.string().optional(),
  purchaseOrderId: z.string().optional(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]).default("DRAFT"),
  notes: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  items: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().min(1),
    unitPrice: z.number().min(0),
    discountPercent: z.number().min(0).default(0),
    taxId: z.string().optional(),
    description: z.string().optional(),
  })).min(1, "At least one item is required"),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const partyId = searchParams.get("partyId");
    const status = searchParams.get("status");
    const type = searchParams.get("type");
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

    if (search) {
      where.OR = [
        { billNumber: { contains: search, mode: "insensitive" } },
        { referenceNo: { contains: search, mode: "insensitive" } },
        { party: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
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
        },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bill.count({ where }),
    ]);

    return NextResponse.json({
      data: bills,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching bills:", error);
    return NextResponse.json(
      { error: "Failed to fetch bills" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createBillSchema.parse(body);

    // Generate bill number
    const lastBill = await prisma.bill.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      select: { billNumber: true },
    });

    const billNumber = lastBill
      ? `BILL-${String(parseInt(lastBill.billNumber.split("-")[1] || "0") + 1).padStart(6, "0")}`
      : "BILL-000001";

    // Calculate totals
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    const itemsData = validatedData.items.map((item, index) => {
      const lineTotal = item.quantity * item.unitPrice;
      const discountAmount = (lineTotal * item.discountPercent) / 100;
      const taxableAmount = lineTotal - discountAmount;
      subtotal += lineTotal;
      totalDiscount += discountAmount;

      return {
        itemId: item.itemId,
        description: item.description || "",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        discountAmount: discountAmount,
        taxableAmount: taxableAmount,
        taxId: item.taxId,
        taxAmount: 0,
        totalAmount: taxableAmount,
        sequence: index,
      };
    });

    const totalAmount = subtotal - totalDiscount + totalTax;

    const bill = await prisma.bill.create({
      data: {
        organizationId: orgId,
        billNumber,
        partyId: validatedData.partyId,
        purchaseOrderId: validatedData.purchaseOrderId,
        vendorBillNo: validatedData.vendorBillNo,
        date: validatedData.date,
        dueDate: validatedData.dueDate,
        status: validatedData.status,
        notes: validatedData.notes,
        ...(validatedData.attachments && { attachments: validatedData.attachments }),
        subtotal,
        discountAmount: totalDiscount,
        taxAmount: totalTax,
        totalAmount,
        amountDue: totalAmount,
        items: {
          create: itemsData,
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

    return NextResponse.json(bill, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    console.error("Error creating bill:", error);
    return NextResponse.json(
      { error: "Failed to create bill" },
      { status: 500 }
    );
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { D, sum } from "@/backend/utils/money";
import { formatNumber, nextNumber } from "@/backend/utils/posting";
import { computeLineGst, determineSupplyType, type SupplyType } from "@/backend/utils/india-tax";
import { logger } from "@/backend/utils/logger";
import { routeEntityForApproval, notifyNewApprovers } from "@/backend/services/approvals/route-entity";

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
    logger.error({ err: error }, "Error fetching bills");
    return NextResponse.json(
      { error: "Failed to fetch bills" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const body = await request.json();
    const validatedData = createBillSchema.parse(body);

    // Place-of-supply for purchases: vendor (party) state vs receiver (org) state.
    // Drives whether the bill carries CGST+SGST (intrastate) or IGST (interstate).
    const [org, party] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { state: true },
      }),
      prisma.party.findFirst({
        where: { id: validatedData.partyId, organizationId: orgId },
        select: { id: true, billingState: true },
      }),
    ]);
    if (!party) return badRequest("Vendor not found");
    const supplyType: SupplyType = determineSupplyType(org?.state, party.billingState);

    // Resolve tax rates for all items that reference a taxId, in one query.
    const taxIds = [...new Set(validatedData.items.map((i) => i.taxId).filter(Boolean) as string[])];
    const taxes = taxIds.length
      ? await prisma.taxConfig.findMany({
          where: { id: { in: taxIds }, organizationId: orgId },
          select: { id: true, rate: true },
        })
      : [];
    const rateById = new Map(taxes.map((t) => [t.id, D(t.rate)]));

    // All money math via Decimal. Per-line GST split based on place of supply.
    const itemsData = validatedData.items.map((item, index) => {
      const lineTotal = D(item.quantity).times(D(item.unitPrice));
      const discountAmount = lineTotal.times(D(item.discountPercent)).dividedBy(D(100));
      const taxableAmount = lineTotal.minus(discountAmount);
      const combinedRate = item.taxId ? rateById.get(item.taxId) ?? D(0) : D(0);
      const split = computeLineGst(taxableAmount, combinedRate, supplyType);
      const rates = supplyType === "INTRASTATE"
        ? { cgst: combinedRate.dividedBy(2), sgst: combinedRate.dividedBy(2), igst: D(0) }
        : { cgst: D(0), sgst: D(0), igst: combinedRate };
      const totalAmount = taxableAmount.plus(split.totalTaxAmount);

      return {
        itemId: item.itemId,
        description: item.description || "",
        quantity: D(item.quantity),
        unitPrice: D(item.unitPrice),
        discountPercent: D(item.discountPercent),
        discountAmount,
        taxableAmount,
        taxId: item.taxId,
        taxAmount: split.totalTaxAmount,
        cgstRate: rates.cgst,
        cgstAmount: split.cgstAmount,
        sgstRate: rates.sgst,
        sgstAmount: split.sgstAmount,
        igstRate: rates.igst,
        igstAmount: split.igstAmount,
        totalAmount,
        sequence: index,
      };
    });

    const subtotal = sum(itemsData.map((i) => D(i.quantity).times(D(i.unitPrice))));
    const totalDiscount = sum(itemsData.map((i) => i.discountAmount));
    const totalTax = sum(itemsData.map((i) => i.taxAmount));
    const totalAmount = subtotal.minus(totalDiscount).plus(totalTax);

    const bill = await prisma.$transaction(async (tx) => {
      const billNumber = formatNumber("BILL", await nextNumber(tx, orgId, "BILL"));
      const created = await tx.bill.create({
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
          // GST audit trail.
          placeOfSupply: party.billingState ?? null,
          supplyType,
          items: {
            create: itemsData,
          },
        },
        include: {
          party: true,
          items: { include: { item: true } },
        },
      });

      // If the bill was created in PENDING_APPROVAL, route it through
      // any active workflow for entityType=BILL. Approvers see it in
      // /approvals.
      if (validatedData.status === "PENDING_APPROVAL") {
        try {
          await routeEntityForApproval(tx, {
            organizationId: orgId,
            entityType: "BILL",
            entityId: created.id,
            requesterId: userId,
            amount: totalAmount,
          });
        } catch (e) {
          logger.error({ err: e, billId: created.id }, "Approval routing failed (bill still PENDING_APPROVAL)");
        }
      }
      return created;
    });

    if (bill.status === "PENDING_APPROVAL") {
      try {
        const requester = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        await notifyNewApprovers(prisma, {
          entityType: "BILL",
          entityId: bill.id,
          entityLabel: bill.billNumber,
          amount: bill.totalAmount.toString(),
          requesterName: requester?.name ?? "A colleague",
        });
      } catch (e) {
        logger.error({ err: e, billId: bill.id }, "Post-tx approval notify failed");
      }
    }

    return NextResponse.json(bill, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating bill");
    return NextResponse.json(
      { error: "Failed to create bill" },
      { status: 500 }
    );
  }
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, forbidden, hasPermission } from "@/backend/utils/with-org-auth";
import { D, sum } from "@/backend/utils/money";
import { nextNumber } from "@/backend/utils/posting";
import { computeLineGst, determineSupplyType, type SupplyType } from "@/backend/utils/india-tax";
import { postInvoiceToGl } from "@/backend/services/billing/post-invoice";
import { writeAudit } from "@/backend/utils/audit";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const invoiceItemSchema = z.object({
  itemId: optional(z.string()),
  description: z.string().min(1, "Description is required"),
  hsnCode: optional(z.string()),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxId: optional(z.string()),
  taxAmount: z.number().min(0).default(0),
});

const createInvoiceSchema = z.object({
  partyId: z.string().min(1, "Customer is required"),
  date: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  type: z.enum(["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "PROFORMA"]).default("INVOICE"),
  billingAddress: optional(z.string()),
  shippingAddress: optional(z.string()),
  notes: optional(z.string()),
  terms: optional(z.string()),
  salesOrderId: optional(z.string()),
  currencyId: optional(z.string()),
  items: z.array(invoiceItemSchema).min(1, "At least 1 item required"),
  /**
   * Issue the invoice immediately instead of saving it as a draft.
   *
   * `SENT` books it to the general ledger inside the same transaction,
   * mirroring how bills POST posts a bill created as APPROVED. `DRAFT`
   * (the default, and the old behaviour) creates a document with no
   * accounting effect, to be issued later via PATCH.
   */
  status: z.enum(["DRAFT", "SENT"]).default("DRAFT"),
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

export const POST = withOrgAuth(async (request, { orgId, userId, orgUser }) => {
  try {
    const body = await request.json();
    const validatedData = createInvoiceSchema.parse(body);

    // Creating an invoice as SENT books it straight to the ledger, so it
    // needs the same approve-class permission as issuing one later.
    const issueNow = validatedData.status === "SENT";
    if (issueNow && !hasPermission(orgUser, "sales", "invoices", "approve")) {
      return forbidden(
        "You don't have permission to issue invoices. Save it as a draft instead."
      );
    }

    // FY label for the invoice number prefix. India fiscal year starts April.
    const currentFY =
      new Date().getMonth() >= 3
        ? new Date().getFullYear()
        : new Date().getFullYear() - 1;
    const fyLabel = `${currentFY}-${(currentFY + 1).toString().slice(-2)}`;

    // Place-of-supply determination: supplier (org) state vs customer state.
    // Foreign customers (billingCountry set and not "IN") → EXPORT.
    // Indian customers, same state → INTRASTATE; different state → INTERSTATE.
    const [org, party] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { state: true, country: true, compositionScheme: true },
      }),
      prisma.party.findFirst({
        where: { id: validatedData.partyId, organizationId: orgId },
        select: { id: true, billingState: true, billingCountry: true },
      }),
    ]);
    if (!party) return badRequest("Customer not found");
    const isExport =
      party.billingCountry &&
      party.billingCountry.trim().toUpperCase() !== "IN" &&
      party.billingCountry.trim().toUpperCase() !== "INDIA";
    // Internal `supplyType` written to the invoice. The line-level GST
    // computation still uses INTERSTATE when isExport is true (IGST applies
    // unless the supplier files under LUT — that branch is a follow-up).
    const supplyType: "INTRASTATE" | "INTERSTATE" | "EXPORT" = isExport
      ? "EXPORT"
      : determineSupplyType(org?.state, party.billingState);
    const computeSupplyType: SupplyType = supplyType === "EXPORT" ? "INTERSTATE" : supplyType;
    /**
     * Composition Scheme: the supplier cannot collect GST from the
     * customer; the invoice is a "bill of supply" with zero GST cells.
     * The flat composition rate is paid out of the supplier's own pocket
     * via CMP-08 each quarter.
     *
     * We zero out per-line GST when this flag is on. The audit trail
     * (Invoice.placeOfSupply / supplyType) is still captured so the
     * CMP-08 aggregator can roll up turnover and the supplier can
     * exit composition cleanly later.
     */
    const isComposition = !!org?.compositionScheme;

    // Pull tax rates referenced by line items in one query.
    const taxIds = [...new Set(validatedData.items.map((i) => i.taxId).filter(Boolean) as string[])];
    const taxes = taxIds.length
      ? await prisma.taxConfig.findMany({
          where: { id: { in: taxIds }, organizationId: orgId },
          select: { id: true, rate: true, taxType: true },
        })
      : [];
    const taxById = new Map(taxes.map((t) => [t.id, t]));

    // All money math via Decimal — never via JS floats.
    // For each line, compute the correct CGST/SGST/IGST split based on
    // place of supply, persisted to the InvoiceTax junction.
    const itemsWithCalculations = validatedData.items.map((item) => {
      const lineTotal = D(item.quantity).times(D(item.unitPrice));
      const discountAmount = lineTotal.times(D(item.discountPercent)).dividedBy(D(100));
      const taxableAmount = lineTotal.minus(discountAmount);

      // If the item references a tax config, drive tax from its rate.
      // GST/IGST/CGST/SGST taxTypes all collapse here — we recompute the
      // split correctly from the combined rate per place of supply.
      const taxConfig = item.taxId ? taxById.get(item.taxId) : undefined;
      const combinedRate = taxConfig ? D(taxConfig.rate) : D(0);
      // Composition: zero out GST cells on the customer-facing invoice.
      // The flat composition rate is settled by the supplier via CMP-08;
      // it does NOT appear on the line.
      const split = isComposition
        ? { cgstAmount: D(0), sgstAmount: D(0), igstAmount: D(0), totalTaxAmount: D(0) }
        : computeLineGst(taxableAmount, combinedRate, computeSupplyType);
      const rates = isComposition
        ? { cgst: D(0), sgst: D(0), igst: D(0) }
        : computeSupplyType === "INTRASTATE"
        ? { cgst: combinedRate.dividedBy(2), sgst: combinedRate.dividedBy(2), igst: D(0) }
        : { cgst: D(0), sgst: D(0), igst: combinedRate };

      const totalAmount = taxableAmount.plus(split.totalTaxAmount);

      return {
        ...item,
        quantity: D(item.quantity),
        unitPrice: D(item.unitPrice),
        discountPercent: D(item.discountPercent),
        discountAmount,
        taxableAmount,
        cgstRate: rates.cgst,
        cgstAmount: split.cgstAmount,
        sgstRate: rates.sgst,
        sgstAmount: split.sgstAmount,
        igstRate: rates.igst,
        igstAmount: split.igstAmount,
        taxAmount: split.totalTaxAmount,
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
          status: issueNow ? "SENT" : "DRAFT",
          // GST audit trail — locked at write time so reports are stable.
          placeOfSupply: party.billingState ?? null,
          supplyType,
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
              cgstRate: item.cgstRate,
              cgstAmount: item.cgstAmount,
              sgstRate: item.sgstRate,
              sgstAmount: item.sgstAmount,
              igstRate: item.igstRate,
              igstAmount: item.igstAmount,
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

      // Issued at create — book it to the ledger now, the same way bills
      // POST posts a bill created as APPROVED. Posting failure aborts the
      // whole transaction, so the books never carry an invoice that is
      // marked issued but was never journalled.
      if (issueNow) {
        await postInvoiceToGl(tx, {
          invoiceId: newInvoice.id,
          organizationId: orgId,
          userId,
        });
      }

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: issueNow ? "POST" : "CREATE",
        entityType: "Invoice",
        entityId: newInvoice.id,
        newData: {
          invoiceNumber,
          partyId: validatedData.partyId,
          totalAmount: grandTotal.toString(),
          status: issueNow ? "SENT" : "DRAFT",
          supplyType,
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

import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D, sum } from "@/backend/utils/money";
import { computeLineGst, determineSupplyType, type SupplyType } from "@/backend/utils/india-tax";
import { nextNumber } from "@/backend/utils/posting";
import {
  addFrequency,
  isFrequency,
  type Frequency,
} from "@/backend/services/billing/recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecurringItem = {
  itemId: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxId?: string;
  description?: string;
};

type RunSummary = {
  ranAt: string;
  considered: number;
  spawned: number;
  skipped: number;
  errors: Array<{ recurringId: string; message: string }>;
  invoices: Array<{
    recurringId: string;
    invoiceId: string;
    invoiceNumber: string;
    partyName: string;
    total: string;
  }>;
};

/**
 * POST /api/organizations/[orgId]/recurring-invoices/run
 *
 * Manual tick: finds every active recurring template whose
 * nextRunDate is on/before now (and not past endDate), spawns one
 * invoice per template, and advances nextRunDate by the frequency.
 *
 * One invoice per call per template — if a subscription is several
 * cycles behind, each tick catches up by one cycle. The UI surfaces
 * `missedRunDates` so the user knows when they're behind.
 *
 * External cron can hit this every hour/day. We do NOT auto-trigger
 * the run on a schedule from inside the app — keeping it manual /
 * cron-driven so the user has explicit control.
 */
export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  void userId;
  const ranAt = new Date();

  try {
    const dueRows = await prisma.recurringInvoice.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        nextRunDate: { lte: ranAt },
      },
      include: {
        party: {
          select: {
            id: true,
            name: true,
            billingState: true,
            billingCountry: true,
          },
        },
      },
    });

    const summary: RunSummary = {
      ranAt: ranAt.toISOString(),
      considered: dueRows.length,
      spawned: 0,
      skipped: 0,
      errors: [],
      invoices: [],
    };

    if (dueRows.length === 0) {
      return NextResponse.json(summary);
    }

    // Pull org GST + composition state once for this run.
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { state: true, compositionScheme: true },
    });
    const isComposition = !!org?.compositionScheme;

    // Pre-load tax configs for all referenced taxIds in a single query.
    const allTaxIds = new Set<string>();
    for (const r of dueRows) {
      const items = (r.items as RecurringItem[]) ?? [];
      for (const it of items) {
        if (it.taxId) allTaxIds.add(it.taxId);
      }
    }
    const taxes =
      allTaxIds.size > 0
        ? await prisma.taxConfig.findMany({
            where: { id: { in: [...allTaxIds] }, organizationId: orgId },
            select: { id: true, rate: true },
          })
        : [];
    const rateById = new Map(taxes.map((t) => [t.id, D(t.rate)]));

    for (const row of dueRows) {
      try {
        if (row.endDate && row.endDate < row.nextRunDate) {
          // Past the end date — deactivate and skip.
          await prisma.recurringInvoice.update({
            where: { id: row.id },
            data: { isActive: false },
          });
          summary.skipped++;
          continue;
        }
        if (!isFrequency(row.frequency)) {
          summary.errors.push({
            recurringId: row.id,
            message: `Invalid frequency "${row.frequency}"`,
          });
          continue;
        }
        const freq: Frequency = row.frequency;

        const items = (row.items as RecurringItem[]) ?? [];
        if (items.length === 0) {
          summary.errors.push({ recurringId: row.id, message: "No items in template" });
          continue;
        }

        // Mirror the invoice POST's GST split logic.
        const isExport =
          row.party.billingCountry &&
          row.party.billingCountry.trim().toUpperCase() !== "IN" &&
          row.party.billingCountry.trim().toUpperCase() !== "INDIA";
        const supplyType: "INTRASTATE" | "INTERSTATE" | "EXPORT" = isExport
          ? "EXPORT"
          : determineSupplyType(org?.state, row.party.billingState);
        const computeSupplyType: SupplyType = supplyType === "EXPORT" ? "INTERSTATE" : supplyType;

        const itemsCalc = items.map((item, index) => {
          const lineTotal = D(item.quantity).times(D(item.unitPrice));
          const discountAmount = lineTotal
            .times(D(item.discountPercent ?? 0))
            .dividedBy(D(100));
          const taxableAmount = lineTotal.minus(discountAmount);
          const combinedRate = item.taxId ? rateById.get(item.taxId) ?? D(0) : D(0);
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
            itemId: item.itemId,
            description: item.description ?? "",
            quantity: D(item.quantity),
            unitPrice: D(item.unitPrice),
            discountPercent: D(item.discountPercent ?? 0),
            discountAmount,
            taxableAmount,
            taxId: item.taxId ?? null,
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

        const subtotal = sum(itemsCalc.map((i) => i.taxableAmount));
        const totalDiscount = sum(itemsCalc.map((i) => i.discountAmount));
        const totalTax = sum(itemsCalc.map((i) => i.taxAmount));
        const grandTotal = subtotal.plus(totalTax);

        // FY label same as invoices/route.ts.
        const invoiceDate = row.nextRunDate;
        const fyStartMonth = 4;
        const m = invoiceDate.getUTCMonth() + 1;
        const yr = invoiceDate.getUTCFullYear();
        const currentFY = m >= fyStartMonth ? yr : yr - 1;
        const fyLabel = `${currentFY}-${(currentFY + 1).toString().slice(-2)}`;

        const dueDate = new Date(invoiceDate);
        dueDate.setUTCDate(dueDate.getUTCDate() + row.dueDays);

        const meta = (row.meta as Record<string, unknown> | null) ?? {};

        const created = await prisma.$transaction(async (tx) => {
          const seq = await nextNumber(tx, orgId, `INVOICE:${fyLabel}`);
          const invoiceNumber = `INV/${fyLabel}/${String(seq).padStart(5, "0")}`;
          const newInvoice = await tx.invoice.create({
            data: {
              organizationId: orgId,
              invoiceNumber,
              partyId: row.partyId,
              date: invoiceDate,
              dueDate,
              type: "INVOICE",
              status: "DRAFT",
              subtotal,
              discountAmount: totalDiscount,
              taxAmount: totalTax,
              totalAmount: grandTotal,
              amountDue: grandTotal,
              placeOfSupply: row.party.billingState ?? null,
              supplyType,
              billingAddress: (meta.billingAddress as string | undefined) ?? null,
              shippingAddress: (meta.shippingAddress as string | undefined) ?? null,
              notes:
                (meta.notes as string | undefined) ??
                `Auto-generated from recurring template ${row.id}`,
              terms: (meta.terms as string | undefined) ?? null,
              items: {
                create: itemsCalc.map((i) => ({
                  itemId: i.itemId,
                  description: i.description,
                  quantity: i.quantity,
                  unitPrice: i.unitPrice,
                  discountPercent: i.discountPercent,
                  discountAmount: i.discountAmount,
                  taxableAmount: i.taxableAmount,
                  taxId: i.taxId,
                  taxAmount: i.taxAmount,
                  cgstRate: i.cgstRate,
                  cgstAmount: i.cgstAmount,
                  sgstRate: i.sgstRate,
                  sgstAmount: i.sgstAmount,
                  igstRate: i.igstRate,
                  igstAmount: i.igstAmount,
                  totalAmount: i.totalAmount,
                  sequence: i.sequence,
                })),
              },
            },
            select: { id: true, invoiceNumber: true, totalAmount: true },
          });

          // Advance the recurring template.
          const newNextRunDate = addFrequency(row.nextRunDate, freq);
          await tx.recurringInvoice.update({
            where: { id: row.id },
            data: {
              nextRunDate: newNextRunDate,
              lastInvoiceId: newInvoice.id,
              runCount: { increment: 1 },
              // Auto-deactivate when the next-run will be past endDate.
              isActive: row.endDate ? newNextRunDate <= row.endDate : true,
            },
          });

          return newInvoice;
        });

        summary.spawned++;
        summary.invoices.push({
          recurringId: row.id,
          invoiceId: created.id,
          invoiceNumber: created.invoiceNumber,
          partyName: row.party.name,
          total: D(created.totalAmount).toString(),
        });
      } catch (e) {
        summary.errors.push({
          recurringId: row.id,
          message: (e as Error).message,
        });
      }
    }

    return NextResponse.json(summary);
  } catch (error) {
    logger.error({ err: error }, "Recurring run failed");
    return NextResponse.json(
      { error: "Recurring run failed", message: (error as Error).message },
      { status: 500 }
    );
  }
});

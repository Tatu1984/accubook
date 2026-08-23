import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/backend/database/client";
import { D, sum, toNumber } from "@/backend/utils/money";
import { formatNumber, nextNumber } from "@/backend/utils/posting";
import { computeLineGst, determineSupplyType, type SupplyType } from "@/backend/utils/india-tax";
import { writeAudit } from "@/backend/utils/audit";
import { stateFromGstin } from "@/backend/services/ocr/heuristics";
import type { ExtractedDocument } from "@/backend/services/ocr/schema";

/**
 * Turning a confirmed reading into a real accounting document.
 *
 * The reading is what a human said the paper says; this is where it becomes a
 * Bill or an Invoice. Two decisions are deliberate:
 *
 * It always lands as a **draft**. Approving a purchase and booking it to the
 * ledger is a separate act with its own permission, and a document that
 * arrived by email and was read by a machine should not skip it. The existing
 * bill and invoice screens take it from here.
 *
 * The **document's own tax split wins** over the split this system would
 * derive. If the vendor charged CGST+SGST, the bill carries CGST+SGST even
 * when the two states look interstate from our master data — the invoice on
 * file is the legal document, and a mismatch is something a human should see
 * on screen, not something the importer silently overrules.
 */

export class PostExtractedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostExtractedError";
  }
}

export interface PostExtractedInput {
  orgId: string;
  userId: string;
  extractionId: string;
  document: ExtractedDocument;
  /** Chosen by the reviewer; when absent the party is matched or created. */
  partyId?: string | null;
}

export interface PostExtractedResult {
  entityType: "Bill" | "Invoice";
  entityId: string;
  number: string;
  partyId: string;
  partyCreated: boolean;
  totalAmount: string;
}

type Tx = Prisma.TransactionClient;

function targetOf(document: ExtractedDocument): "Bill" | "Invoice" {
  if (document.docType === "PURCHASE_BILL") return "Bill";
  if (document.docType === "SALES_INVOICE") return "Invoice";
  if (document.direction === "OUTGOING") return "Invoice";
  if (document.direction === "INCOMING") return "Bill";
  throw new PostExtractedError(
    "Say whether this is a purchase bill or a sales invoice before confirming it"
  );
}

/** The date on the paper, or today when the paper has none. */
function documentDate(raw: string | null | undefined): Date {
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

async function resolveParty(
  tx: Tx,
  orgId: string,
  document: ExtractedDocument,
  target: "Bill" | "Invoice",
  chosenPartyId?: string | null
): Promise<{ id: string; billingState: string | null; created: boolean }> {
  if (chosenPartyId) {
    const party = await tx.party.findFirst({
      where: { id: chosenPartyId, organizationId: orgId },
      select: { id: true, billingState: true },
    });
    if (!party) throw new PostExtractedError("That party does not belong to this organization");
    return { ...party, created: false };
  }

  const gstin = document.partyGstin?.trim().toUpperCase() || null;
  const name = document.partyName?.trim() || null;

  // A GSTIN identifies a business exactly; a name only probably. Try in that order.
  if (gstin) {
    const byGstin = await tx.party.findFirst({
      where: { organizationId: orgId, gstNo: gstin },
      select: { id: true, billingState: true },
    });
    if (byGstin) return { ...byGstin, created: false };
  }
  if (name) {
    const byName = await tx.party.findFirst({
      where: { organizationId: orgId, name: { equals: name, mode: "insensitive" } },
      select: { id: true, billingState: true },
    });
    if (byName) return { ...byName, created: false };
  }

  if (!name) {
    throw new PostExtractedError(
      "This document has no party on it — pick an existing one or type the name before confirming"
    );
  }

  const billingState = document.partyState ?? stateFromGstin(gstin) ?? null;
  const created = await tx.party.create({
    data: {
      organizationId: orgId,
      type: target === "Bill" ? "VENDOR" : "CUSTOMER",
      name,
      gstNo: gstin,
      panNo: document.partyPan ?? (gstin ? gstin.slice(2, 12) : null),
      email: document.partyEmail ?? null,
      phone: document.partyPhone ?? null,
      billingAddress: document.partyAddress ?? null,
      billingState,
      billingCountry: "IN",
      notes: "Created from a scanned document",
    },
    select: { id: true, billingState: true },
  });
  return { ...created, created: true };
}

/**
 * The split the paper shows, when it shows one. Falls back to the states.
 */
function supplyTypeFor(document: ExtractedDocument, orgState: string | null, partyState: string | null): SupplyType {
  const igst = document.igstAmount ?? 0;
  const cgst = document.cgstAmount ?? 0;
  const sgst = document.sgstAmount ?? 0;
  if (igst > 0 && cgst === 0 && sgst === 0) return "INTERSTATE";
  if (cgst > 0 || sgst > 0) return "INTRASTATE";
  return determineSupplyType(orgState ?? undefined, partyState ?? undefined);
}

interface ComputedLine {
  description: string;
  hsnCode: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  cgstRate: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstRate: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstRate: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

/**
 * Lines as the paper states them.
 *
 * A stated line amount is trusted over quantity × rate: vendors round, apply
 * scheme discounts, and hand-write totals that do not multiply out, and the
 * amount they are charging is the amount they are charging.
 */
function buildLines(document: ExtractedDocument, supplyType: SupplyType): ComputedLine[] {
  const source = document.lines?.length
    ? document.lines
    : [
        {
          description:
            document.notes?.slice(0, 120) ||
            `As per ${document.documentNumber ?? "attached document"}`,
          quantity: 1,
          unitPrice: document.subtotal ?? document.totalAmount ?? 0,
          amount: document.subtotal ?? document.totalAmount ?? 0,
          taxRate: null,
          taxAmount:
            (document.cgstAmount ?? 0) + (document.sgstAmount ?? 0) + (document.igstAmount ?? 0),
          hsnCode: null,
          discountPercent: null,
          unit: null,
        },
      ];

  return source.map((line) => {
    const quantity = D(line.quantity ?? 1);
    const stated = line.amount != null ? D(line.amount) : null;
    const unitPrice =
      line.unitPrice != null
        ? D(line.unitPrice)
        : stated && quantity.greaterThan(0)
          ? stated.dividedBy(quantity)
          : D(0);
    const gross = quantity.times(unitPrice);
    const discountPercent = D(line.discountPercent ?? 0);
    const discountAmount = gross.times(discountPercent).dividedBy(D(100));
    const taxableAmount = stated ?? gross.minus(discountAmount);

    const rate = D(line.taxRate ?? 0);
    const taxAmount =
      line.taxAmount != null
        ? D(line.taxAmount)
        : computeLineGst(taxableAmount, rate, supplyType).totalTaxAmount;

    const half = taxAmount.dividedBy(D(2));
    const intra = supplyType === "INTRASTATE";
    const rates = intra
      ? { cgst: rate.dividedBy(D(2)), sgst: rate.dividedBy(D(2)), igst: D(0) }
      : { cgst: D(0), sgst: D(0), igst: rate };

    return {
      description: line.description?.trim() || "Item",
      hsnCode: line.hsnCode ?? null,
      quantity,
      unitPrice,
      discountPercent,
      discountAmount,
      taxableAmount,
      taxAmount,
      cgstRate: rates.cgst,
      cgstAmount: intra ? half : D(0),
      sgstRate: rates.sgst,
      sgstAmount: intra ? taxAmount.minus(half) : D(0),
      igstRate: rates.igst,
      igstAmount: intra ? D(0) : taxAmount,
      totalAmount: taxableAmount.plus(taxAmount),
    };
  });
}

export async function postExtractedDocument(
  input: PostExtractedInput
): Promise<PostExtractedResult> {
  const { orgId, userId, document } = input;
  const target = targetOf(document);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { state: true },
  });

  return prisma.$transaction(async (tx) => {
    const party = await resolveParty(tx, orgId, document, target, input.partyId);
    const supplyType = supplyTypeFor(document, org?.state ?? null, party.billingState);

    const lines = buildLines(document, supplyType);
    const subtotal = sum(lines.map((l) => l.taxableAmount));
    const discountTotal = sum(lines.map((l) => l.discountAmount));
    const taxTotal = sum(lines.map((l) => l.taxAmount));
    const computedTotal = subtotal.plus(taxTotal);

    // What the paper says it comes to. A small gap against our arithmetic is
    // the vendor's round-off and is carried as such rather than argued with.
    const statedTotal = document.totalAmount != null ? D(document.totalAmount) : null;
    const roundOff = statedTotal ? statedTotal.minus(computedTotal) : D(0);
    const totalAmount = statedTotal ?? computedTotal;

    const date = documentDate(document.documentDate);
    const dueDate = document.dueDate ? documentDate(document.dueDate) : date;

    if (target === "Bill") {
      const billNumber = formatNumber("BILL", await nextNumber(tx, orgId, "BILL"));
      const bill = await tx.bill.create({
        data: {
          organizationId: orgId,
          partyId: party.id,
          billNumber,
          vendorBillNo: document.documentNumber ?? null,
          date,
          dueDate,
          status: "DRAFT",
          subtotal,
          discountAmount: discountTotal,
          taxAmount: taxTotal,
          roundOff,
          totalAmount,
          amountDue: totalAmount,
          notes: document.notes ?? null,
          placeOfSupply: document.placeOfSupply ?? party.billingState ?? null,
          supplyType,
          reverseCharge: document.reverseCharge ?? false,
          items: {
            create: lines.map((line, index) => ({
              description: line.description,
              hsnCode: line.hsnCode,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountPercent: line.discountPercent,
              discountAmount: line.discountAmount,
              taxableAmount: line.taxableAmount,
              taxAmount: line.taxAmount,
              cgstRate: line.cgstRate,
              cgstAmount: line.cgstAmount,
              sgstRate: line.sgstRate,
              sgstAmount: line.sgstAmount,
              igstRate: line.igstRate,
              igstAmount: line.igstAmount,
              totalAmount: line.totalAmount,
              sequence: index,
            })),
          },
        },
        select: { id: true, billNumber: true, totalAmount: true },
      });

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "CREATE",
        entityType: "Bill",
        entityId: bill.id,
        newData: {
          source: "DOCUMENT_EXTRACTION",
          extractionId: input.extractionId,
          billNumber: bill.billNumber,
          vendorBillNo: document.documentNumber ?? null,
          partyId: party.id,
          partyCreated: party.created,
          totalAmount: bill.totalAmount.toString(),
          status: "DRAFT",
        },
      });

      return {
        entityType: "Bill" as const,
        entityId: bill.id,
        number: bill.billNumber,
        partyId: party.id,
        partyCreated: party.created,
        totalAmount: bill.totalAmount.toString(),
      };
    }

    // Sales side. Numbering matches the invoices endpoint: one series per
    // fiscal year, so a document imported now sits in the same run as one
    // raised through the UI.
    const fyStart = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    const fyLabel = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
    const seq = await nextNumber(tx, orgId, `INVOICE:${fyLabel}`);
    const invoiceNumber = `INV/${fyLabel}/${String(seq).padStart(5, "0")}`;

    const invoice = await tx.invoice.create({
      data: {
        organizationId: orgId,
        partyId: party.id,
        invoiceNumber,
        date,
        dueDate,
        type: "INVOICE",
        status: "DRAFT",
        subtotal,
        discountAmount: discountTotal,
        taxAmount: taxTotal,
        totalAmount: computedTotal,
        amountDue: computedTotal,
        notes: document.notes ?? null,
        placeOfSupply: document.placeOfSupply ?? party.billingState ?? null,
        supplyType,
        items: {
          create: lines.map((line, index) => ({
            description: line.description,
            hsnCode: line.hsnCode,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            discountAmount: line.discountAmount,
            taxableAmount: line.taxableAmount,
            taxAmount: line.taxAmount,
            cgstRate: line.cgstRate,
            cgstAmount: line.cgstAmount,
            sgstRate: line.sgstRate,
            sgstAmount: line.sgstAmount,
            igstRate: line.igstRate,
            igstAmount: line.igstAmount,
            totalAmount: line.totalAmount,
            sequence: index + 1,
          })),
        },
      },
      select: { id: true, invoiceNumber: true, totalAmount: true },
    });

    await writeAudit(tx, {
      organizationId: orgId,
      userId,
      action: "CREATE",
      entityType: "Invoice",
      entityId: invoice.id,
      newData: {
        source: "DOCUMENT_EXTRACTION",
        extractionId: input.extractionId,
        invoiceNumber: invoice.invoiceNumber,
        sourceDocumentNumber: document.documentNumber ?? null,
        partyId: party.id,
        partyCreated: party.created,
        totalAmount: invoice.totalAmount.toString(),
        status: "DRAFT",
      },
    });

    return {
      entityType: "Invoice" as const,
      entityId: invoice.id,
      number: invoice.invoiceNumber,
      partyId: party.id,
      partyCreated: party.created,
      totalAmount: invoice.totalAmount.toString(),
    };
  });
}

/** Difference between what the paper totals to and what its lines add up to. */
export function totalMismatch(document: ExtractedDocument): number | null {
  if (document.totalAmount == null) return null;
  const lines = buildLines(document, "INTRASTATE");
  const computed = toNumber(sum(lines.map((l) => l.totalAmount)));
  return Number((document.totalAmount - computed).toFixed(2));
}

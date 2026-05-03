import { Prisma } from "@/generated/prisma";
import { D, sum } from "@/backend/utils/money";
import { stateCodeFromGstin } from "@/backend/utils/india-tax";
import type { Tx } from "@/backend/utils/posting";

/**
 * GSTR-1 computation.
 *
 * Aggregates outward (sales) invoices into the sections required by the
 * GSTN portal. This is the *data shape* — portal JSON format conversion
 * (different field naming convention: ctin / inum / idt / pos / etc.) is
 * a separate step.
 *
 * Sections implemented:
 *   - B2B    — registered customers (party.gstNo present), invoice-wise.
 *   - B2CL   — B2C Large: unregistered + interstate + invoice ≥ ₹2.5L.
 *   - B2CS   — unregistered, rate-wise summary by place of supply.
 *   - CDNR   — credit/debit notes to registered customers.
 *   - CDNUR  — credit/debit notes to unregistered customers.
 *   - EXP    — exports (zero-rated outward; supplyType = "EXPORT").
 *   - NIL    — nil-rated / exempt / non-GST supplies, summarized by
 *              intra/inter × registered/unregistered.
 *   - HSN    — HSN/SAC-wise rollup of taxable supplies (mandatory section 12).
 *   - DOCS   — document range summary (issued / cancelled — section 13).
 *
 * Sections NOT yet modeled:
 *   - ATXP (advances received) — needs a "tax-on-advance" flow first.
 *   - SUPECO / SUPECO_9_5 (supplies through e-commerce operator) — no
 *     e-commerce model in the schema yet.
 */

export type Gstr1Period = {
  from: Date;
  to: Date;
};

type LineRow = {
  rate: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
};

export type Gstr1B2bInvoice = {
  invoiceNumber: string;
  date: string;
  totalValue: string;
  placeOfSupply: string | null;
  reverseCharge: boolean;
  invoiceType: string;
  items: LineRow[];
};

export type Gstr1B2bGroup = {
  ctin: string;
  partyName: string;
  invoices: Gstr1B2bInvoice[];
};

export type Gstr1B2clInvoice = {
  invoiceNumber: string;
  date: string;
  totalValue: string;
  placeOfSupply: string | null;
  partyName: string;
  items: LineRow[]; // CGST/SGST will be 0 for B2CL (always interstate)
};

export type Gstr1B2csRow = {
  placeOfSupply: string | null;
  rate: string;
  type: "OE";
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
};

/**
 * Credit/debit note to registered party (CDNR) — full breakdown shape.
 * `noteType` is "C" for credit, "D" for debit.
 */
export type Gstr1CdnrNote = {
  ctin: string;
  partyName: string;
  noteNumber: string;
  noteDate: string;
  noteType: "C" | "D";
  totalValue: string;
  placeOfSupply: string | null;
  reverseCharge: boolean;
  items: LineRow[];
};

/** CDNUR — credit/debit notes to unregistered customers. */
export type Gstr1CdnurNote = {
  partyName: string;
  noteNumber: string;
  noteDate: string;
  noteType: "C" | "D";
  totalValue: string;
  placeOfSupply: string | null;
  items: LineRow[];
};

export type Gstr1ExpInvoice = {
  invoiceNumber: string;
  date: string;
  totalValue: string;
  partyName: string;
  /**
   * Export type: WPAY (with payment of IGST, IGST charged) or WOPAY
   * (without — under LUT/Bond, zero-rated). Inferred from whether IGST
   * was applied at line level.
   */
  exportType: "WPAY" | "WOPAY";
  items: LineRow[];
};

export type Gstr1NilRow = {
  /**
   * Bucket per portal:
   *   INTER_REG, INTRA_REG     — to registered persons
   *   INTER_UNREG, INTRA_UNREG — to unregistered persons
   */
  bucket: "INTER_REG" | "INTRA_REG" | "INTER_UNREG" | "INTRA_UNREG";
  /** Sum of taxable values (we don't yet split nil vs exempt vs non-GST — same column for now). */
  amount: string;
};

export type Gstr1HsnRow = {
  hsnCode: string;
  description: string | null;
  uqc: string;
  quantity: string;
  totalValue: string;
  taxableValue: string;
  rate: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
};

export type Gstr1DocsRow = {
  docType: string;
  fromNum: string | null;
  toNum: string | null;
  total: number;
  cancelled: number;
  netIssued: number;
};

export type Gstr1Result = {
  period: { from: string; to: string };
  b2b: Gstr1B2bGroup[];
  b2cl: Gstr1B2clInvoice[];
  b2cs: Gstr1B2csRow[];
  cdnr: Gstr1CdnrNote[];
  cdnur: Gstr1CdnurNote[];
  exp: Gstr1ExpInvoice[];
  nil: Gstr1NilRow[];
  hsn: Gstr1HsnRow[];
  docs: Gstr1DocsRow[];
};

/** Threshold for B2CL (B2C Large): interstate B2C invoices ≥ ₹2.5 lakh. */
const B2CL_THRESHOLD = D("250000");

type AggregatedLines = {
  rows: LineRow[];
  taxableTotal: Prisma.Decimal;
  cgstTotal: Prisma.Decimal;
  sgstTotal: Prisma.Decimal;
  igstTotal: Prisma.Decimal;
  cessTotal: Prisma.Decimal;
};

function aggregateLinesByRate(
  items: ReadonlyArray<{
    cgstRate: Prisma.Decimal | null;
    sgstRate: Prisma.Decimal | null;
    igstRate: Prisma.Decimal | null;
    taxableAmount: Prisma.Decimal;
    cgstAmount: Prisma.Decimal | null;
    sgstAmount: Prisma.Decimal | null;
    igstAmount: Prisma.Decimal | null;
    cessAmount: Prisma.Decimal | null;
  }>
): AggregatedLines {
  const summary = new Map<string, {
    rate: Prisma.Decimal;
    taxable: Prisma.Decimal;
    cgst: Prisma.Decimal;
    sgst: Prisma.Decimal;
    igst: Prisma.Decimal;
    cess: Prisma.Decimal;
  }>();
  let taxableTotal = D(0);
  let cgstTotal = D(0);
  let sgstTotal = D(0);
  let igstTotal = D(0);
  let cessTotal = D(0);

  for (const li of items) {
    const cgstRate = D(li.cgstRate ?? 0);
    const sgstRate = D(li.sgstRate ?? 0);
    const igstRate = D(li.igstRate ?? 0);
    const rate = cgstRate.plus(sgstRate).plus(igstRate);
    const key = rate.toFixed(2);
    const taxable = D(li.taxableAmount);
    const cgstAmt = D(li.cgstAmount ?? 0);
    const sgstAmt = D(li.sgstAmount ?? 0);
    const igstAmt = D(li.igstAmount ?? 0);
    const cessAmt = D(li.cessAmount ?? 0);

    const existing = summary.get(key);
    if (existing) {
      existing.taxable = existing.taxable.plus(taxable);
      existing.cgst = existing.cgst.plus(cgstAmt);
      existing.sgst = existing.sgst.plus(sgstAmt);
      existing.igst = existing.igst.plus(igstAmt);
      existing.cess = existing.cess.plus(cessAmt);
    } else {
      summary.set(key, { rate, taxable, cgst: cgstAmt, sgst: sgstAmt, igst: igstAmt, cess: cessAmt });
    }

    taxableTotal = taxableTotal.plus(taxable);
    cgstTotal = cgstTotal.plus(cgstAmt);
    sgstTotal = sgstTotal.plus(sgstAmt);
    igstTotal = igstTotal.plus(igstAmt);
    cessTotal = cessTotal.plus(cessAmt);
  }

  return {
    rows: [...summary.values()].map((r) => ({
      rate: r.rate.toFixed(2),
      taxableValue: r.taxable.toString(),
      cgst: r.cgst.toString(),
      sgst: r.sgst.toString(),
      igst: r.igst.toString(),
      cess: r.cess.toString(),
    })),
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    cessTotal,
  };
}

type Bucket =
  | { kind: "EXP"; exportType: "WPAY" | "WOPAY" }
  | { kind: "NIL"; bucket: Gstr1NilRow["bucket"] }
  | { kind: "CDNR" | "CDNUR"; noteType: "C" | "D" }
  | { kind: "B2B" }
  | { kind: "B2CL" }
  | { kind: "B2CS" };

function bucketize(
  invoiceType: string,
  supplyType: string | null,
  isInterstate: boolean,
  isRegistered: boolean,
  totalAmount: Prisma.Decimal,
  totalTax: Prisma.Decimal,
  totalIgst: Prisma.Decimal
): Bucket {
  if (supplyType === "EXPORT") {
    return { kind: "EXP", exportType: totalIgst.greaterThan(D(0)) ? "WPAY" : "WOPAY" };
  }
  if (invoiceType === "CREDIT_NOTE" || invoiceType === "DEBIT_NOTE") {
    const noteType: "C" | "D" = invoiceType === "CREDIT_NOTE" ? "C" : "D";
    return isRegistered ? { kind: "CDNR", noteType } : { kind: "CDNUR", noteType };
  }
  if (totalTax.isZero()) {
    const bucket: Gstr1NilRow["bucket"] = isInterstate
      ? (isRegistered ? "INTER_REG" : "INTER_UNREG")
      : (isRegistered ? "INTRA_REG" : "INTRA_UNREG");
    return { kind: "NIL", bucket };
  }
  if (isRegistered) return { kind: "B2B" };
  if (isInterstate && totalAmount.greaterThanOrEqualTo(B2CL_THRESHOLD)) {
    return { kind: "B2CL" };
  }
  return { kind: "B2CS" };
}

export async function computeGstr1(
  client: Tx,
  organizationId: string,
  period: Gstr1Period
): Promise<Gstr1Result> {
  const db = client;

  const invoices = await db.invoice.findMany({
    where: {
      organizationId,
      date: { gte: period.from, lte: period.to },
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    include: {
      party: {
        select: { id: true, name: true, gstNo: true, billingState: true, billingCountry: true },
      },
      items: {
        select: {
          hsnCode: true,
          quantity: true,
          totalAmount: true,
          taxableAmount: true,
          taxAmount: true,
          cgstRate: true,
          cgstAmount: true,
          sgstRate: true,
          sgstAmount: true,
          igstRate: true,
          igstAmount: true,
          cessRate: true,
          cessAmount: true,
          item: { select: { primaryUnit: { select: { symbol: true, name: true } } } },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  const b2bByGstin = new Map<string, Gstr1B2bGroup>();
  const b2cl: Gstr1B2clInvoice[] = [];
  const b2csKeyed = new Map<string, Gstr1B2csRow>();
  const cdnr: Gstr1CdnrNote[] = [];
  const cdnur: Gstr1CdnurNote[] = [];
  const exp: Gstr1ExpInvoice[] = [];
  const nilByBucket = new Map<Gstr1NilRow["bucket"], Prisma.Decimal>();
  const hsnKeyed = new Map<string, Gstr1HsnRow>();

  let invoiceCount = 0;
  let invoiceCancelled = 0;
  let creditNoteCount = 0;
  let debitNoteCount = 0;
  let firstInvNum: string | null = null;
  let lastInvNum: string | null = null;
  let firstCnNum: string | null = null;
  let lastCnNum: string | null = null;
  let firstDnNum: string | null = null;
  let lastDnNum: string | null = null;

  for (const inv of invoices) {
    if (inv.type === "CREDIT_NOTE") {
      creditNoteCount++;
      firstCnNum ??= inv.invoiceNumber;
      lastCnNum = inv.invoiceNumber;
    } else if (inv.type === "DEBIT_NOTE") {
      debitNoteCount++;
      firstDnNum ??= inv.invoiceNumber;
      lastDnNum = inv.invoiceNumber;
    } else {
      invoiceCount++;
      firstInvNum ??= inv.invoiceNumber;
      lastInvNum = inv.invoiceNumber;
    }
    if (inv.status === "CANCELLED") invoiceCancelled++;

    const agg = aggregateLinesByRate(inv.items);

    // HSN aggregation across the whole period (rate-discriminated).
    for (const li of inv.items) {
      if (!li.hsnCode) continue;
      const cgstRate = D(li.cgstRate ?? 0);
      const sgstRate = D(li.sgstRate ?? 0);
      const igstRate = D(li.igstRate ?? 0);
      const rate = cgstRate.plus(sgstRate).plus(igstRate);
      const hsnKey = `${li.hsnCode}|${rate.toFixed(2)}`;
      const uqc = li.item?.primaryUnit?.symbol ?? li.item?.primaryUnit?.name ?? "OTH";
      const taxable = D(li.taxableAmount);
      const cgstAmt = D(li.cgstAmount ?? 0);
      const sgstAmt = D(li.sgstAmount ?? 0);
      const igstAmt = D(li.igstAmount ?? 0);
      const cessAmt = D(li.cessAmount ?? 0);
      const hsnRow = hsnKeyed.get(hsnKey);
      if (hsnRow) {
        hsnRow.quantity = D(hsnRow.quantity).plus(D(li.quantity)).toString();
        hsnRow.totalValue = D(hsnRow.totalValue).plus(D(li.totalAmount)).toString();
        hsnRow.taxableValue = D(hsnRow.taxableValue).plus(taxable).toString();
        hsnRow.cgst = D(hsnRow.cgst).plus(cgstAmt).toString();
        hsnRow.sgst = D(hsnRow.sgst).plus(sgstAmt).toString();
        hsnRow.igst = D(hsnRow.igst).plus(igstAmt).toString();
        hsnRow.cess = D(hsnRow.cess).plus(cessAmt).toString();
      } else {
        hsnKeyed.set(hsnKey, {
          hsnCode: li.hsnCode,
          description: null,
          uqc,
          quantity: D(li.quantity).toString(),
          totalValue: D(li.totalAmount).toString(),
          taxableValue: taxable.toString(),
          rate: rate.toFixed(2),
          cgst: cgstAmt.toString(),
          sgst: sgstAmt.toString(),
          igst: igstAmt.toString(),
          cess: cessAmt.toString(),
        });
      }
    }

    const isRegistered = !!inv.party?.gstNo;
    const isInterstate = inv.supplyType === "INTERSTATE";
    const totalAmount = D(inv.totalAmount);
    const totalTax = agg.cgstTotal.plus(agg.sgstTotal).plus(agg.igstTotal).plus(agg.cessTotal);
    const bucket = bucketize(
      inv.type,
      inv.supplyType,
      isInterstate,
      isRegistered,
      totalAmount,
      totalTax,
      agg.igstTotal
    );

    const dateStr = inv.date.toISOString().slice(0, 10);
    const partyName = inv.party?.name ?? "Unknown";

    switch (bucket.kind) {
      case "B2B": {
        const ctin = inv.party!.gstNo!.toUpperCase();
        const group = b2bByGstin.get(ctin);
        const invoiceShape: Gstr1B2bInvoice = {
          invoiceNumber: inv.invoiceNumber,
          date: dateStr,
          totalValue: totalAmount.toString(),
          placeOfSupply: inv.placeOfSupply ?? stateCodeFromGstin(ctin),
          reverseCharge: inv.reverseCharge,
          invoiceType: inv.type,
          items: agg.rows,
        };
        if (group) group.invoices.push(invoiceShape);
        else b2bByGstin.set(ctin, { ctin, partyName, invoices: [invoiceShape] });
        break;
      }
      case "B2CL": {
        b2cl.push({
          invoiceNumber: inv.invoiceNumber,
          date: dateStr,
          totalValue: totalAmount.toString(),
          placeOfSupply: inv.placeOfSupply,
          partyName,
          items: agg.rows,
        });
        break;
      }
      case "B2CS": {
        for (const r of agg.rows) {
          const pos = inv.placeOfSupply ?? "UNKNOWN";
          const key = `${pos}|${r.rate}`;
          const existing = b2csKeyed.get(key);
          if (existing) {
            existing.taxableValue = D(existing.taxableValue).plus(D(r.taxableValue)).toString();
            existing.cgst = D(existing.cgst).plus(D(r.cgst)).toString();
            existing.sgst = D(existing.sgst).plus(D(r.sgst)).toString();
            existing.igst = D(existing.igst).plus(D(r.igst)).toString();
            existing.cess = D(existing.cess).plus(D(r.cess)).toString();
          } else {
            b2csKeyed.set(key, {
              placeOfSupply: pos === "UNKNOWN" ? null : pos,
              rate: r.rate,
              type: "OE",
              taxableValue: r.taxableValue,
              cgst: r.cgst,
              sgst: r.sgst,
              igst: r.igst,
              cess: r.cess,
            });
          }
        }
        break;
      }
      case "CDNR": {
        cdnr.push({
          ctin: inv.party!.gstNo!.toUpperCase(),
          partyName,
          noteNumber: inv.invoiceNumber,
          noteDate: dateStr,
          noteType: bucket.noteType,
          totalValue: totalAmount.toString(),
          placeOfSupply: inv.placeOfSupply,
          reverseCharge: inv.reverseCharge,
          items: agg.rows,
        });
        break;
      }
      case "CDNUR": {
        cdnur.push({
          partyName,
          noteNumber: inv.invoiceNumber,
          noteDate: dateStr,
          noteType: bucket.noteType,
          totalValue: totalAmount.toString(),
          placeOfSupply: inv.placeOfSupply,
          items: agg.rows,
        });
        break;
      }
      case "EXP": {
        exp.push({
          invoiceNumber: inv.invoiceNumber,
          date: dateStr,
          totalValue: totalAmount.toString(),
          partyName,
          exportType: bucket.exportType,
          items: agg.rows,
        });
        break;
      }
      case "NIL": {
        const current = nilByBucket.get(bucket.bucket) ?? D(0);
        nilByBucket.set(bucket.bucket, current.plus(agg.taxableTotal));
        break;
      }
    }
  }

  const nil: Gstr1NilRow[] = [...nilByBucket.entries()].map(([b, amount]) => ({
    bucket: b,
    amount: amount.toString(),
  }));

  const docs: Gstr1DocsRow[] = [
    {
      docType: "Invoice",
      fromNum: firstInvNum,
      toNum: lastInvNum,
      total: invoiceCount,
      cancelled: invoiceCancelled,
      netIssued: invoiceCount - invoiceCancelled,
    },
    {
      docType: "Credit Note",
      fromNum: firstCnNum,
      toNum: lastCnNum,
      total: creditNoteCount,
      cancelled: 0,
      netIssued: creditNoteCount,
    },
    {
      docType: "Debit Note",
      fromNum: firstDnNum,
      toNum: lastDnNum,
      total: debitNoteCount,
      cancelled: 0,
      netIssued: debitNoteCount,
    },
  ];

  return {
    period: {
      from: period.from.toISOString().slice(0, 10),
      to: period.to.toISOString().slice(0, 10),
    },
    b2b: [...b2bByGstin.values()],
    b2cl,
    b2cs: [...b2csKeyed.values()],
    cdnr,
    cdnur,
    exp,
    nil,
    hsn: [...hsnKeyed.values()],
    docs,
  };
}

/**
 * Period totals for the dashboard widget. Sums across all sections that
 * contribute to liability (B2B, B2CL, B2CS, EXP-WPAY).
 *
 * CDNR/CDNUR reduce liability — represented as a separate `creditNotesValue`
 * for clarity. NIL doesn't add to tax. EXP-WOPAY (LUT) is zero-rated.
 */
export function summarizeGstr1(result: Gstr1Result): {
  totalInvoices: number;
  totalTaxable: string;
  totalCgst: string;
  totalSgst: string;
  totalIgst: string;
  totalCess: string;
  totalTax: string;
  creditNotesValue: string;
  debitNotesValue: string;
} {
  const taxRows = [
    ...result.b2b.flatMap((g) => g.invoices.flatMap((i) => i.items)),
    ...result.b2cl.flatMap((i) => i.items),
    ...result.b2cs,
    ...result.exp.flatMap((i) => i.items),
  ];
  const totalTaxable = sum(taxRows.map((r) => r.taxableValue));
  const totalCgst = sum(taxRows.map((r) => r.cgst));
  const totalSgst = sum(taxRows.map((r) => r.sgst));
  const totalIgst = sum(taxRows.map((r) => r.igst));
  const totalCess = sum(taxRows.map((r) => r.cess));
  const totalTax = totalCgst.plus(totalSgst).plus(totalIgst).plus(totalCess);

  const creditNotesValue = sum([
    ...result.cdnr.filter((n) => n.noteType === "C").map((n) => n.totalValue),
    ...result.cdnur.filter((n) => n.noteType === "C").map((n) => n.totalValue),
  ]);
  const debitNotesValue = sum([
    ...result.cdnr.filter((n) => n.noteType === "D").map((n) => n.totalValue),
    ...result.cdnur.filter((n) => n.noteType === "D").map((n) => n.totalValue),
  ]);

  const docInv = result.docs.find((d) => d.docType === "Invoice");
  return {
    totalInvoices:
      result.b2b.reduce((acc, g) => acc + g.invoices.length, 0)
      + result.b2cl.length
      + (docInv?.netIssued ?? 0),
    totalTaxable: totalTaxable.toString(),
    totalCgst: totalCgst.toString(),
    totalSgst: totalSgst.toString(),
    totalIgst: totalIgst.toString(),
    totalCess: totalCess.toString(),
    totalTax: totalTax.toString(),
    creditNotesValue: creditNotesValue.toString(),
    debitNotesValue: debitNotesValue.toString(),
  };
}

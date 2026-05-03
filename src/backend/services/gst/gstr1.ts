import { Prisma } from "@/generated/prisma";
import { D, sum } from "@/backend/utils/money";
import { stateCodeFromGstin } from "@/backend/utils/india-tax";
import type { Tx } from "@/backend/utils/posting";

/**
 * GSTR-1 computation.
 *
 * Aggregates outward (sales) invoices into the sections required by the
 * GSTN portal. This is the *data shape* — portal JSON format conversion
 * is a separate step (different field naming convention).
 *
 * Sections implemented:
 *   - B2B: registered customers (party.gstNo present), invoice-wise.
 *   - B2CS: unregistered customers, rate-wise summary by place of supply.
 *   - HSN: HSN/SAC-wise rollup of taxable supplies (mandatory section 12).
 *   - DOCS: document range summary (issued / cancelled — section 13).
 *
 * Sections NOT yet implemented:
 *   - B2CL (B2C large interstate ≥ ₹2.5L) — caller logic shouldn't bucket
 *     these into B2CS; they need their own table. Will add when the
 *     bucket-by-amount-threshold logic lands.
 *   - CDNR / CDNUR (credit/debit notes registered/unregistered).
 *   - EXP (exports — zero-rated outward).
 *   - ATXP (advances received).
 *   - NIL (nil-rated/exempt outward).
 */

export type Gstr1Period = {
  from: Date;
  to: Date;
};

export type Gstr1B2bInvoice = {
  invoiceNumber: string;
  date: string;          // YYYY-MM-DD
  totalValue: string;    // Decimal serialized (rupees, 2dp)
  placeOfSupply: string | null;
  reverseCharge: boolean;
  invoiceType: string;   // INVOICE / CREDIT_NOTE / DEBIT_NOTE
  items: Array<{
    rate: string;        // combined GST % (e.g. "18.00")
    taxableValue: string;
    cgst: string;
    sgst: string;
    igst: string;
    cess: string;
  }>;
};

export type Gstr1B2bGroup = {
  ctin: string;         // counterparty GSTIN
  partyName: string;
  invoices: Gstr1B2bInvoice[];
};

export type Gstr1B2csRow = {
  placeOfSupply: string | null;
  rate: string;
  type: "OE";           // "OE" = Outside E-commerce. We don't model e-comm yet.
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
};

export type Gstr1HsnRow = {
  hsnCode: string;
  description: string | null;
  uqc: string;          // unit of measure code (e.g., "NOS", "PCS"); inferred from item.primaryUnit
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
  docType: string;       // "Invoice", "Credit Note", "Debit Note"
  fromNum: string | null;
  toNum: string | null;
  total: number;
  cancelled: number;
  netIssued: number;
};

export type Gstr1Result = {
  period: { from: string; to: string };
  b2b: Gstr1B2bGroup[];
  b2cs: Gstr1B2csRow[];
  hsn: Gstr1HsnRow[];
  docs: Gstr1DocsRow[];
};

/**
 * Compute GSTR-1 for the given organization and period.
 *
 * Reads invoices in the period (excluding DRAFT/CANCELLED) and the
 * persisted CGST/SGST/IGST breakdown columns on invoice_items. Falls
 * back gracefully when columns are null (older invoices created before
 * the GST breakdown migration won't have these populated).
 */
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
        select: { id: true, name: true, gstNo: true, billingState: true },
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
  const b2csKeyed = new Map<string, Gstr1B2csRow>();
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
    // Document range tracking. Includes APPROVED/PARTIAL/PAID/SENT/etc.
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

    // Group by combined rate per line for B2B / B2CS section rows.
    // The GSTN format wants one row per unique (rate) within an invoice.
    const lineSummary = new Map<string, {
      rate: Prisma.Decimal;
      taxable: Prisma.Decimal;
      cgst: Prisma.Decimal;
      sgst: Prisma.Decimal;
      igst: Prisma.Decimal;
      cess: Prisma.Decimal;
    }>();

    for (const li of inv.items) {
      const cgstRate = D(li.cgstRate ?? 0);
      const sgstRate = D(li.sgstRate ?? 0);
      const igstRate = D(li.igstRate ?? 0);
      // Combined rate = CGST+SGST (intrastate) OR IGST (interstate).
      const rate = cgstRate.plus(sgstRate).plus(igstRate);
      const key = rate.toFixed(2);
      const existing = lineSummary.get(key);
      const cgstAmt = D(li.cgstAmount ?? 0);
      const sgstAmt = D(li.sgstAmount ?? 0);
      const igstAmt = D(li.igstAmount ?? 0);
      const cessAmt = D(li.cessAmount ?? 0);
      const taxable = D(li.taxableAmount);
      if (existing) {
        existing.taxable = existing.taxable.plus(taxable);
        existing.cgst = existing.cgst.plus(cgstAmt);
        existing.sgst = existing.sgst.plus(sgstAmt);
        existing.igst = existing.igst.plus(igstAmt);
        existing.cess = existing.cess.plus(cessAmt);
      } else {
        lineSummary.set(key, { rate, taxable, cgst: cgstAmt, sgst: sgstAmt, igst: igstAmt, cess: cessAmt });
      }

      // HSN aggregation — across ALL invoices in the period, not per invoice.
      if (li.hsnCode) {
        const hsnKey = `${li.hsnCode}|${rate.toFixed(2)}`;
        const hsnRow = hsnKeyed.get(hsnKey);
        const uqc = li.item?.primaryUnit?.symbol ?? li.item?.primaryUnit?.name ?? "OTH";
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
    }

    const lineRows = [...lineSummary.values()].map((r) => ({
      rate: r.rate.toFixed(2),
      taxableValue: r.taxable.toString(),
      cgst: r.cgst.toString(),
      sgst: r.sgst.toString(),
      igst: r.igst.toString(),
      cess: r.cess.toString(),
    }));

    if (inv.party?.gstNo) {
      // B2B section: registered counterparty.
      // GSTIN's first 2 digits give the state code; we use that as
      // ctin for grouping.
      const ctin = inv.party.gstNo.toUpperCase();
      const group = b2bByGstin.get(ctin);
      const invoiceShape: Gstr1B2bInvoice = {
        invoiceNumber: inv.invoiceNumber,
        date: inv.date.toISOString().slice(0, 10),
        totalValue: D(inv.totalAmount).toString(),
        placeOfSupply: inv.placeOfSupply ?? stateCodeFromGstin(ctin),
        reverseCharge: inv.reverseCharge,
        invoiceType: inv.type,
        items: lineRows,
      };
      if (group) {
        group.invoices.push(invoiceShape);
      } else {
        b2bByGstin.set(ctin, {
          ctin,
          partyName: inv.party.name,
          invoices: [invoiceShape],
        });
      }
    } else {
      // B2CS section: unregistered counterparty, summarized by (pos, rate).
      // (B2CL — interstate ≥ ₹2.5L — is not yet broken out; will need a
      // threshold check + own bucket.)
      for (const r of lineRows) {
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
    }
  }

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
    b2cs: [...b2csKeyed.values()],
    hsn: [...hsnKeyed.values()],
    docs,
  };
}

/**
 * Convenience: high-level totals across the entire period. Useful for the
 * GSTR-1 summary widget on the taxation dashboard.
 */
export function summarizeGstr1(result: Gstr1Result): {
  totalInvoices: number;
  totalTaxable: string;
  totalCgst: string;
  totalSgst: string;
  totalIgst: string;
  totalCess: string;
  totalTax: string;
} {
  const allRows = [
    ...result.b2b.flatMap((g) => g.invoices.flatMap((i) => i.items)),
    ...result.b2cs,
  ];
  const totalTaxable = sum(allRows.map((r) => r.taxableValue));
  const totalCgst = sum(allRows.map((r) => r.cgst));
  const totalSgst = sum(allRows.map((r) => r.sgst));
  const totalIgst = sum(allRows.map((r) => r.igst));
  const totalCess = sum(allRows.map((r) => r.cess));
  const totalTax = totalCgst.plus(totalSgst).plus(totalIgst).plus(totalCess);
  const docInv = result.docs.find((d) => d.docType === "Invoice");
  return {
    totalInvoices:
      result.b2b.reduce((acc, g) => acc + g.invoices.length, 0)
      + (docInv?.netIssued ?? 0),
    totalTaxable: totalTaxable.toString(),
    totalCgst: totalCgst.toString(),
    totalSgst: totalSgst.toString(),
    totalIgst: totalIgst.toString(),
    totalCess: totalCess.toString(),
    totalTax: totalTax.toString(),
  };
}

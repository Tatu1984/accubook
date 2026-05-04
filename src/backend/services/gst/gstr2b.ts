import { D, type DecimalLike } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";

/**
 * GSTR-2B reconciliation.
 *
 * GSTR-2B is the auto-generated statement the GSTN portal publishes
 * around the 14th of every month, listing every inward supply that
 * the buyer's vendors reported in their GSTR-1. Buyers reconcile
 * this against their purchase register (= our `bills` table) before
 * claiming ITC in GSTR-3B — mismatches block ITC and create scrutiny
 * risk.
 *
 * This service does:
 *   1. Parse the GSTN GSTR-2B JSON file.
 *   2. Match every 2B B2B row against a Bill by (supplier GSTIN +
 *      vendor invoice number). Classify into:
 *        - MATCHED: invoice in books and matches on amounts (within ₹1).
 *        - MISMATCHED: invoice in books but amounts differ.
 *        - MISSING_IN_BOOKS: 2B has it but we don't — could mean we
 *          forgot to enter the bill (loss of ITC).
 *        - MISSING_IN_2B: bill in books but supplier hasn't reported —
 *          ITC at risk; chase the supplier.
 *
 * Out of scope for this first pass:
 *   - Credit / debit notes (cdnr section).
 *   - Imports (impg).
 *   - ISD distributions (isd).
 *   - Persistence — caller currently treats results as transient.
 *     Add a Gstr2bImport / Gstr2bRow pair if accountants want to
 *     revisit a reconciliation later.
 */

export type Gstr2bInvoiceItem = {
  rt: number;       // tax rate (e.g. 18)
  txval: number;    // taxable value
  iamt: number;     // IGST
  camt: number;     // CGST
  samt: number;     // SGST
  csamt: number;    // cess
  num?: number;     // line item number
};

export type Gstr2bInvoice = {
  /** Vendor's invoice number — must match our `Bill.vendorBillNo`. */
  inum: string;
  /** Vendor's invoice date in DD-MM-YYYY (GSTN convention). */
  idt: string;
  /** Invoice value (= total of all line totals incl. taxes). */
  val: number;
  /** "Y" if reverse charge applies. */
  rev?: "Y" | "N";
  /** "Y" if ITC available; "N" if blocked / ineligible. */
  itcavl?: "Y" | "N";
  /** Line items. */
  items: Gstr2bInvoiceItem[];
};

export type Gstr2bSupplier = {
  /** Supplier's GSTIN — match against our Party.gstNo. */
  ctin: string;
  /** Supplier's trade name (informational). */
  trdnm?: string;
  /** Period in which the supplier reported (MMYYYY). */
  supprd?: string;
  inv: Gstr2bInvoice[];
};

export type Gstr2bData = {
  /** Buyer's filing period (the period of THIS 2B), e.g. "042025". */
  rtnprd: string;
  /** Buyer's GSTIN. */
  gstin?: string;
  suppliers: Gstr2bSupplier[];
};

/**
 * Parse a GSTR-2B JSON string into a normalized shape.
 *
 * The GSTN portal wraps the data inside `data.docdata.b2b[]`. We pull
 * just B2B for this first pass — credit/debit notes (cdnr), imports
 * (impg), and ISD live elsewhere in the same file.
 *
 * Robust to the single-element-as-object quirk (some emitters wrap
 * arrays of one as the bare object), but the official GSTN format
 * always emits arrays.
 */
export function parseGstr2bJson(json: string): Gstr2bData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`GSTR-2B file is not valid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("GSTR-2B file is empty or not an object");
  }

  // GSTN wraps payloads as { data: { ... } }; some test exports skip
  // the `data` wrapper. Probe both.
  const root = (parsed as Record<string, unknown>).data ?? parsed;
  const r = root as Record<string, unknown>;

  const rtnprd = String(r.rtnprd ?? r.RTNPRD ?? "").trim();
  if (!rtnprd) {
    throw new Error("GSTR-2B file missing 'rtnprd' (filing period)");
  }
  const gstin = typeof r.gstin === "string" ? r.gstin : undefined;

  const docdata = r.docdata as Record<string, unknown> | undefined;
  if (!docdata || typeof docdata !== "object") {
    throw new Error("GSTR-2B file missing 'docdata' block");
  }

  const rawB2b = (docdata.b2b ?? []) as unknown[];
  const b2bList = Array.isArray(rawB2b) ? rawB2b : [rawB2b];

  const suppliers: Gstr2bSupplier[] = b2bList.map((entry) => {
    const e = entry as Record<string, unknown>;
    const ctin = String(e.ctin ?? "").trim();
    const trdnm = typeof e.trdnm === "string" ? e.trdnm : undefined;
    const supprd = typeof e.supprd === "string" ? e.supprd : undefined;
    const rawInv = (e.inv ?? []) as unknown[];
    const invList = Array.isArray(rawInv) ? rawInv : [rawInv];
    const inv: Gstr2bInvoice[] = invList.map((iEntry) => {
      const i = iEntry as Record<string, unknown>;
      const rawItems = (i.items ?? []) as unknown[];
      const items = (Array.isArray(rawItems) ? rawItems : [rawItems]).map((it) => {
        const x = it as Record<string, unknown>;
        return {
          rt: Number(x.rt ?? 0),
          txval: Number(x.txval ?? 0),
          iamt: Number(x.iamt ?? 0),
          camt: Number(x.camt ?? 0),
          samt: Number(x.samt ?? 0),
          csamt: Number(x.csamt ?? 0),
          num: typeof x.num === "number" ? x.num : undefined,
        };
      });
      return {
        inum: String(i.inum ?? "").trim(),
        idt: String(i.idt ?? "").trim(),
        val: Number(i.val ?? 0),
        rev: i.rev === "Y" ? "Y" : i.rev === "N" ? "N" : undefined,
        itcavl: i.itcavl === "Y" ? "Y" : i.itcavl === "N" ? "N" : undefined,
        items,
      };
    });
    return { ctin, trdnm, supprd, inv };
  });

  return { rtnprd, gstin, suppliers };
}

export type BillForReconciliation = {
  id: string;
  billNumber: string;
  vendorBillNo: string | null;
  date: Date;
  party: { gstNo: string | null; name: string };
  /** Total invoice value as captured in our books. */
  totalAmount: DecimalLike;
  /** Per-tax breakdown — sum across BillItem rows for cell-level diffing. */
  igstTotal: DecimalLike;
  cgstTotal: DecimalLike;
  sgstTotal: DecimalLike;
  cessTotal: DecimalLike;
};

export type MatchStatus =
  | "MATCHED"
  | "MISMATCHED"
  | "MISSING_IN_BOOKS"
  | "MISSING_IN_2B";

export type MatchedRow = {
  status: "MATCHED";
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  bill: { id: string; billNumber: string };
};

export type MismatchedRow = {
  status: "MISMATCHED";
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  bill: { id: string; billNumber: string };
  /** Human-readable list of cells that differ. */
  reasons: string[];
};

export type MissingInBooksRow = {
  status: "MISSING_IN_BOOKS";
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  itcAvailable: boolean;
};

export type MissingIn2bRow = {
  status: "MISSING_IN_2B";
  supplierGstin: string;
  supplierName: string;
  bill: { id: string; billNumber: string; vendorBillNo: string | null; date: string };
  totalAmount: string;
};

export type ReconciliationRow =
  | MatchedRow
  | MismatchedRow
  | MissingInBooksRow
  | MissingIn2bRow;

export type ReconciliationResult = {
  period: string;          // "042025"
  totals: {
    matched: number;
    mismatched: number;
    missingInBooks: number;
    missingIn2b: number;
  };
  rows: ReconciliationRow[];
};

const TOLERANCE = D("1"); // ₹1 absolute tolerance per cell

function sumLineCells(items: Gstr2bInvoiceItem[]) {
  return items.reduce(
    (acc, it) => ({
      taxableValue: acc.taxableValue.plus(D(it.txval)),
      igst: acc.igst.plus(D(it.iamt)),
      cgst: acc.cgst.plus(D(it.camt)),
      sgst: acc.sgst.plus(D(it.samt)),
      cess: acc.cess.plus(D(it.csamt)),
    }),
    {
      taxableValue: D(0),
      igst: D(0),
      cgst: D(0),
      sgst: D(0),
      cess: D(0),
    }
  );
}

function abs(d: Prisma.Decimal): Prisma.Decimal {
  return d.lessThan(D(0)) ? d.times(D(-1)) : d;
}

/**
 * Match a parsed 2B against the given bills.
 *
 * The bills should already be filtered to the buyer-side equivalent
 * of the 2B period (typically the same MMYYYY by Bill.date). The
 * matcher itself doesn't filter — caller's responsibility.
 */
export function matchGstr2bToBills(
  parsed: Gstr2bData,
  bills: BillForReconciliation[]
): ReconciliationResult {
  const rows: ReconciliationRow[] = [];

  // Index bills by (gstin uppercase, vendorBillNo lowercase) for O(1) lookup.
  // Tolerate case-insensitive vendor bill numbers; suppliers occasionally
  // capitalize differently than what we entered.
  const bookIndex = new Map<string, BillForReconciliation>();
  for (const b of bills) {
    const gstin = b.party.gstNo?.toUpperCase();
    const inum = b.vendorBillNo?.trim().toLowerCase();
    if (!gstin || !inum) continue;
    bookIndex.set(`${gstin}|${inum}`, b);
  }

  // Track which bills got matched, so we can compute MISSING_IN_2B at the end.
  const matchedBillIds = new Set<string>();

  for (const supplier of parsed.suppliers) {
    const ctin = supplier.ctin.toUpperCase();
    const trdnm = supplier.trdnm ?? "";
    for (const inv of supplier.inv) {
      const inumKey = `${ctin}|${inv.inum.trim().toLowerCase()}`;
      const bill = bookIndex.get(inumKey);
      const lineSums = sumLineCells(inv.items);

      if (!bill) {
        rows.push({
          status: "MISSING_IN_BOOKS",
          supplierGstin: ctin,
          supplierName: trdnm,
          invoiceNumber: inv.inum,
          invoiceDate: inv.idt,
          invoiceValue: inv.val,
          itcAvailable: inv.itcavl !== "N",
        });
        continue;
      }
      matchedBillIds.add(bill.id);

      // Compare amounts.
      const reasons: string[] = [];
      const totalDiff = abs(D(bill.totalAmount).minus(D(inv.val)));
      if (totalDiff.greaterThan(TOLERANCE)) {
        reasons.push(
          `Invoice value differs: 2B ${inv.val} vs books ${D(bill.totalAmount).toString()}`
        );
      }
      const igstDiff = abs(D(bill.igstTotal).minus(lineSums.igst));
      if (igstDiff.greaterThan(TOLERANCE)) {
        reasons.push(`IGST differs: 2B ${lineSums.igst.toString()} vs books ${D(bill.igstTotal).toString()}`);
      }
      const cgstDiff = abs(D(bill.cgstTotal).minus(lineSums.cgst));
      if (cgstDiff.greaterThan(TOLERANCE)) {
        reasons.push(`CGST differs: 2B ${lineSums.cgst.toString()} vs books ${D(bill.cgstTotal).toString()}`);
      }
      const sgstDiff = abs(D(bill.sgstTotal).minus(lineSums.sgst));
      if (sgstDiff.greaterThan(TOLERANCE)) {
        reasons.push(`SGST differs: 2B ${lineSums.sgst.toString()} vs books ${D(bill.sgstTotal).toString()}`);
      }
      const cessDiff = abs(D(bill.cessTotal).minus(lineSums.cess));
      if (cessDiff.greaterThan(TOLERANCE)) {
        reasons.push(`CESS differs: 2B ${lineSums.cess.toString()} vs books ${D(bill.cessTotal).toString()}`);
      }

      if (reasons.length === 0) {
        rows.push({
          status: "MATCHED",
          supplierGstin: ctin,
          supplierName: trdnm || bill.party.name,
          invoiceNumber: inv.inum,
          invoiceDate: inv.idt,
          invoiceValue: inv.val,
          bill: { id: bill.id, billNumber: bill.billNumber },
        });
      } else {
        rows.push({
          status: "MISMATCHED",
          supplierGstin: ctin,
          supplierName: trdnm || bill.party.name,
          invoiceNumber: inv.inum,
          invoiceDate: inv.idt,
          invoiceValue: inv.val,
          bill: { id: bill.id, billNumber: bill.billNumber },
          reasons,
        });
      }
    }
  }

  // Bills in books that the supplier hasn't reported in 2B.
  // Filter: only B2B bills (party has GSTIN) and vendorBillNo set —
  // those are the only ones expected to appear in 2B.
  for (const bill of bills) {
    if (matchedBillIds.has(bill.id)) continue;
    if (!bill.party.gstNo || !bill.vendorBillNo) continue;
    rows.push({
      status: "MISSING_IN_2B",
      supplierGstin: bill.party.gstNo.toUpperCase(),
      supplierName: bill.party.name,
      bill: {
        id: bill.id,
        billNumber: bill.billNumber,
        vendorBillNo: bill.vendorBillNo,
        date: bill.date.toISOString().slice(0, 10),
      },
      totalAmount: D(bill.totalAmount).toString(),
    });
  }

  const totals = {
    matched: rows.filter((r) => r.status === "MATCHED").length,
    mismatched: rows.filter((r) => r.status === "MISMATCHED").length,
    missingInBooks: rows.filter((r) => r.status === "MISSING_IN_BOOKS").length,
    missingIn2b: rows.filter((r) => r.status === "MISSING_IN_2B").length,
  };

  return { period: parsed.rtnprd, totals, rows };
}

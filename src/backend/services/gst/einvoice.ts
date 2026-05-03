import { D } from "@/backend/utils/money";
import { stateCodeFromGstin, isValidGstinFormat } from "@/backend/utils/india-tax";
import type { Tx } from "@/backend/utils/posting";

/**
 * E-invoice (NIC IRN) payload generator.
 *
 * Builds the JSON payload expected by the NIC E-Invoice System (https://einvoice1.gst.gov.in)
 * for any invoice in the database. Once submitted, the NIC API returns:
 *   - IRN (Invoice Reference Number, 64-char hash)
 *   - QR code (base64-encoded image)
 *   - Acknowledgement number / date
 *   - Signed invoice + signed QR
 *
 * Mandatory for B2B sales by suppliers with annual turnover ≥ ₹5cr (as of
 * Aug 2023). Currently this service produces the payload only — calling the
 * NIC API requires:
 *   1. NIC sandbox / prod credentials (separate auth chain).
 *   2. EWB / IRN auth-token endpoint.
 *   3. POST to /eivital/v1.04/Invoice with the payload below.
 *
 * The payload structure follows the NIC e-invoice schema v1.1
 * (Notification 60/2020-Central Tax). Reference:
 *   https://einv-apisandbox.nic.in/version1.04/generate-irn.html
 */

export type EInvoicePayload = {
  Version: "1.1";
  TranDtls: {
    TaxSch: "GST";
    /** Supply type code per the schedule. */
    SupTyp: "B2B" | "SEZWP" | "SEZWOP" | "EXPWP" | "EXPWOP" | "DEXP";
    /** Reverse charge applicable. */
    RegRev: "Y" | "N";
    /** Inv ref num for issuing IRN. Optional — leave null. */
    EcmGstin: string | null;
    IgstOnIntra: "Y" | "N";
  };
  DocDtls: {
    Typ: "INV" | "CRN" | "DBN";
    No: string;
    Dt: string; // DD/MM/YYYY
  };
  SellerDtls: {
    Gstin: string;
    LglNm: string;
    TrdNm?: string;
    Addr1: string;
    Addr2?: string;
    Loc: string;
    Pin: number;
    Stcd: string;     // 2-digit numeric state code
    Ph?: string;
    Em?: string;
  };
  BuyerDtls: {
    Gstin: string;
    LglNm: string;
    TrdNm?: string;
    Pos: string;       // place of supply, 2-digit numeric
    Addr1: string;
    Addr2?: string;
    Loc: string;
    Pin: number;
    Stcd: string;
    Ph?: string;
    Em?: string;
  };
  ItemList: Array<{
    SlNo: string;       // serial number as string
    PrdDesc: string;
    IsServc: "Y" | "N";
    HsnCd: string;
    Qty: number;
    Unit: string;
    UnitPrice: number;
    TotAmt: number;
    Discount: number;
    PreTaxVal: number;
    AssAmt: number;
    GstRt: number;
    IgstAmt: number;
    CgstAmt: number;
    SgstAmt: number;
    CesRt: number;
    CesAmt: number;
    CesNonAdvlAmt: number;
    StateCesRt: number;
    StateCesAmt: number;
    StateCesNonAdvlAmt: number;
    OthChrg: number;
    TotItemVal: number;
  }>;
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    CesVal: number;
    StCesVal: number;
    Discount: number;
    OthChrg: number;
    RndOffAmt: number;
    TotInvVal: number;
    TotInvValFc?: number;
  };
};

const NUMERIC_BY_LETTER: Record<string, string> = {
  JK: "01", HP: "02", PB: "03", CH: "04", UT: "05", HR: "06",
  DL: "07", RJ: "08", UP: "09", BR: "10", SK: "11", AR: "12",
  NL: "13", MN: "14", MZ: "15", TR: "16", ML: "17", AS: "18",
  WB: "19", JH: "20", OR: "21", CG: "22", MP: "23", GJ: "24",
  DD: "25", DN: "26", MH: "27", KA: "29", GA: "30", LD: "31",
  KL: "32", TN: "33", PY: "34", AN: "35", TG: "36", AP: "37",
  LA: "38",
};

function toNumericStateCode(input: string | null | undefined): string {
  if (!input) return "";
  const upper = input.trim().toUpperCase();
  return NUMERIC_BY_LETTER[upper] ?? "";
}

function toDocDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function n(value: unknown, places = 2): number {
  const num = Number(value as string | number);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(places));
}

/**
 * Determine the SupTyp for an e-invoice based on the invoice's supply type
 * and the buyer's classification. Defaults to B2B for the common case.
 */
function determineSupTyp(
  supplyType: string | null,
  isExport: boolean,
  hasIgst: boolean
): "B2B" | "SEZWP" | "SEZWOP" | "EXPWP" | "EXPWOP" | "DEXP" {
  if (isExport) return hasIgst ? "EXPWP" : "EXPWOP";
  // SEZWP / SEZWOP / DEXP not yet modeled; default to B2B for all India intra+inter.
  void supplyType;
  return "B2B";
}

export type BuildEInvoiceOptions = {
  invoiceId: string;
  organizationId: string;
};

export class EInvoiceValidationError extends Error {
  details: string[];
  constructor(details: string[]) {
    super(`E-invoice payload invalid: ${details.join("; ")}`);
    this.details = details;
    this.name = "EInvoiceValidationError";
  }
}

/**
 * Build the NIC e-invoice payload for an existing invoice.
 *
 * Strict pre-flight checks: any failure returns an EInvoiceValidationError
 * listing what's wrong. The NIC API rejects payloads silently with cryptic
 * codes — fail early with clear messages instead.
 */
export async function buildEInvoicePayload(
  client: Tx,
  opts: BuildEInvoiceOptions
): Promise<EInvoicePayload> {
  const db = client;

  const invoice = await db.invoice.findFirst({
    where: { id: opts.invoiceId, organizationId: opts.organizationId },
    include: {
      party: true,
      organization: true,
      items: {
        include: { item: { include: { primaryUnit: true } } },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!invoice) {
    throw new EInvoiceValidationError(["Invoice not found"]);
  }

  const errors: string[] = [];
  const seller = invoice.organization;
  const buyer = invoice.party;

  // --- Validations ---
  if (!seller.gstNo) errors.push("Organization GSTIN is required");
  else if (!isValidGstinFormat(seller.gstNo)) errors.push("Organization GSTIN format invalid");

  if (!buyer.gstNo) errors.push("Buyer GSTIN is required for e-invoicing (B2B only)");
  else if (!isValidGstinFormat(buyer.gstNo)) errors.push("Buyer GSTIN format invalid");

  if (!seller.address || !seller.city || !seller.state || !seller.postalCode) {
    errors.push("Organization address (line 1, city, state, postal code) is required");
  }
  if (!buyer.billingAddress || !buyer.billingCity || !buyer.billingState || !buyer.billingPostal) {
    errors.push("Buyer billing address (line 1, city, state, postal code) is required");
  }

  if (invoice.items.length === 0) {
    errors.push("Invoice must have at least one line item");
  }

  for (const [i, li] of invoice.items.entries()) {
    if (!li.hsnCode) errors.push(`Line ${i + 1}: HSN/SAC code is required`);
  }

  if (errors.length > 0) {
    throw new EInvoiceValidationError(errors);
  }

  const supTyp = determineSupTyp(
    invoice.supplyType,
    invoice.supplyType === "EXPORT",
    D(invoice.taxAmount).greaterThan(D(0)) && (invoice.items.some((i) => D(i.igstAmount ?? 0).greaterThan(D(0)))),
  );

  const docTyp: "INV" | "CRN" | "DBN" =
    invoice.type === "CREDIT_NOTE" ? "CRN" :
    invoice.type === "DEBIT_NOTE" ? "DBN" : "INV";

  const sellerStcd = toNumericStateCode(stateCodeFromGstin(seller.gstNo!));
  const buyerStcd = toNumericStateCode(buyer.billingState ?? stateCodeFromGstin(buyer.gstNo!));
  const pos = toNumericStateCode(invoice.placeOfSupply ?? buyer.billingState ?? stateCodeFromGstin(buyer.gstNo!));

  const itemList: EInvoicePayload["ItemList"] = invoice.items.map((li, i) => {
    const taxable = D(li.taxableAmount);
    const cgst = D(li.cgstAmount ?? 0);
    const sgst = D(li.sgstAmount ?? 0);
    const igst = D(li.igstAmount ?? 0);
    const cess = D(li.cessAmount ?? 0);
    // GST rate combined.
    const gstRate = D(li.cgstRate ?? 0).plus(D(li.sgstRate ?? 0)).plus(D(li.igstRate ?? 0));
    const isService = li.item?.type === "SERVICE";

    return {
      SlNo: String(i + 1),
      PrdDesc: li.description,
      IsServc: isService ? "Y" : "N",
      HsnCd: li.hsnCode!,
      Qty: n(li.quantity, 3),
      Unit: li.item?.primaryUnit?.symbol ?? li.item?.primaryUnit?.name ?? "OTH",
      UnitPrice: n(li.unitPrice, 3),
      TotAmt: n(D(li.quantity).times(D(li.unitPrice))),
      Discount: n(li.discountAmount),
      PreTaxVal: n(taxable),
      AssAmt: n(taxable),
      GstRt: n(gstRate),
      IgstAmt: n(igst),
      CgstAmt: n(cgst),
      SgstAmt: n(sgst),
      CesRt: n(li.cessRate ?? 0),
      CesAmt: n(cess),
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: n(D(li.totalAmount)),
    };
  });

  const totals = invoice.items.reduce(
    (acc, li) => ({
      assVal: acc.assVal.plus(D(li.taxableAmount)),
      cgst: acc.cgst.plus(D(li.cgstAmount ?? 0)),
      sgst: acc.sgst.plus(D(li.sgstAmount ?? 0)),
      igst: acc.igst.plus(D(li.igstAmount ?? 0)),
      cess: acc.cess.plus(D(li.cessAmount ?? 0)),
      discount: acc.discount.plus(D(li.discountAmount)),
    }),
    { assVal: D(0), cgst: D(0), sgst: D(0), igst: D(0), cess: D(0), discount: D(0) }
  );

  return {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: supTyp,
      RegRev: invoice.reverseCharge ? "Y" : "N",
      EcmGstin: null,
      IgstOnIntra: "N",
    },
    DocDtls: {
      Typ: docTyp,
      No: invoice.invoiceNumber,
      Dt: toDocDate(invoice.date),
    },
    SellerDtls: {
      Gstin: seller.gstNo!.toUpperCase(),
      LglNm: seller.legalName ?? seller.name,
      TrdNm: seller.name,
      Addr1: seller.address!,
      Loc: seller.city!,
      Pin: Number(seller.postalCode!),
      Stcd: sellerStcd,
      Ph: seller.phone ?? undefined,
      Em: seller.email ?? undefined,
    },
    BuyerDtls: {
      Gstin: buyer.gstNo!.toUpperCase(),
      LglNm: buyer.name,
      TrdNm: buyer.name,
      Pos: pos,
      Addr1: buyer.billingAddress!,
      Loc: buyer.billingCity!,
      Pin: Number(buyer.billingPostal!),
      Stcd: buyerStcd,
      Ph: buyer.phone ?? undefined,
      Em: buyer.email ?? undefined,
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: n(totals.assVal),
      CgstVal: n(totals.cgst),
      SgstVal: n(totals.sgst),
      IgstVal: n(totals.igst),
      CesVal: n(totals.cess),
      StCesVal: 0,
      Discount: n(totals.discount),
      OthChrg: 0,
      RndOffAmt: n(invoice.roundOff),
      TotInvVal: n(invoice.totalAmount),
    },
  };
}

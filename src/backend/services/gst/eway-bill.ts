import { D } from "@/backend/utils/money";
import { stateCodeFromGstin, isValidGstinFormat } from "@/backend/utils/india-tax";
import type { Tx } from "@/backend/utils/posting";

/**
 * E-way bill (NIC EWB API) payload generator.
 *
 * The e-way bill is mandatory in India when goods worth more than ₹50,000
 * move:
 *   - inter-state, OR
 *   - intra-state, in some states (rules vary)
 *
 * It's a separate document from the e-invoice (despite sharing some fields)
 * and is generated against the EWB system at https://ewaybillgst.gov.in.
 *
 * Threshold: ₹50,000 of TAXABLE value per consignment. Below that, no
 * e-way bill is required and the EWB API rejects requests.
 *
 * This service builds the payload only — the actual EWB API call (auth
 * + POST /ewayapi) is a separate concern requiring NIC sandbox / prod
 * credentials.
 *
 * Reference: https://docs.ewaybillgst.gov.in/Documents/apispec/ApiSpecVer104.pdf
 */

export type EwbSupplyType = "O" | "I"; // O=Outward, I=Inward
export type EwbSubSupplyType =
  | 1   // Supply
  | 2   // Import
  | 3   // Export
  | 4   // Job Work
  | 5   // For Own Use
  | 6   // Job Work Returns
  | 7   // Sales Return
  | 8   // Others
  | 9   // SKD/CKD/Lots
  | 10  // Line Sales
  | 11; // Recipient Not Known

export type EwbDocType = "INV" | "BIL" | "CHL" | "BOE" | "CNT" | "OTH";
export type EwbTransMode = "1" | "2" | "3" | "4"; // road / rail / air / ship
export type EwbVehicleType = "R" | "O"; // regular / over-dimensional cargo
export type EwbTransactionType = 1 | 2 | 3 | 4; // 1=Regular, 2=Bill-To-Ship-To, 3=Bill-From-Dispatch-From, 4=Combo

const EWAY_THRESHOLD = D("50000");

export type TransportDetails = {
  /** Goods movement mode. Defaults to road. */
  transMode?: EwbTransMode;
  /** Approximate distance in km (NIC accepts 0–4000). */
  transDistance: number;
  /** Transporter GSTIN or 15-char Transporter ID issued by GSTN. Optional if `vehicleNo` provided. */
  transporterId?: string;
  transporterName?: string;
  /** "MH12 AB 1234" → submitted as "MH12AB1234". Required when transMode=road. */
  vehicleNo?: string;
  vehicleType?: EwbVehicleType;
  /** LR (lorry receipt) number / RR (railway) etc. */
  transDocNo?: string;
  transDocDate?: string; // DD/MM/YYYY
  subSupplyType?: EwbSubSupplyType;
  transactionType?: EwbTransactionType;
};

export type EwbPayload = {
  supplyType: EwbSupplyType;
  subSupplyType: EwbSubSupplyType;
  docType: EwbDocType;
  docNo: string;
  docDate: string;
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromAddr2?: string;
  fromPlace: string;
  fromPincode: number;
  fromStateCode: number;
  actFromStateCode: number;
  toGstin: string;
  toTrdName: string;
  toAddr1: string;
  toAddr2?: string;
  toPlace: string;
  toPincode: number;
  toStateCode: number;
  actToStateCode: number;
  transactionType: EwbTransactionType;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  cessValue: number;
  cessNonAdvolValue: number;
  totInvValue: number;
  transMode: EwbTransMode;
  transDistance: string;
  transporterId?: string;
  transporterName?: string;
  vehicleNo?: string;
  vehicleType?: EwbVehicleType;
  transDocNo?: string;
  transDocDate?: string;
  itemList: Array<{
    productName: string;
    productDesc: string;
    hsnCode: number;
    quantity: number;
    qtyUnit: string;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    cessRate: number;
    cessNonAdvol: number;
    taxableAmount: number;
  }>;
};

const NUMERIC_BY_LETTER: Record<string, number> = {
  JK: 1, HP: 2, PB: 3, CH: 4, UT: 5, HR: 6,
  DL: 7, RJ: 8, UP: 9, BR: 10, SK: 11, AR: 12,
  NL: 13, MN: 14, MZ: 15, TR: 16, ML: 17, AS: 18,
  WB: 19, JH: 20, OR: 21, CG: 22, MP: 23, GJ: 24,
  DD: 25, DN: 26, MH: 27, KA: 29, GA: 30, LD: 31,
  KL: 32, TN: 33, PY: 34, AN: 35, TG: 36, AP: 37,
  LA: 38,
};

function toNumericState(letter: string | null | undefined): number {
  if (!letter) return 0;
  return NUMERIC_BY_LETTER[letter.trim().toUpperCase()] ?? 0;
}

function toDocDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function toEwbNumber(value: unknown, places = 2): number {
  const n = Number(value as string | number);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(places));
}

export class EwayBillValidationError extends Error {
  details: string[];
  constructor(details: string[]) {
    super(`E-way bill payload invalid: ${details.join("; ")}`);
    this.details = details;
    this.name = "EwayBillValidationError";
  }
}

export type BuildEwayBillOptions = {
  invoiceId: string;
  organizationId: string;
  transport: TransportDetails;
};

/**
 * Build the e-way bill payload for an invoice + transport metadata.
 *
 * Threshold: rejects with EwayBillValidationError if the invoice's
 * total taxable value is below ₹50,000.
 */
export async function buildEwayBillPayload(
  client: Tx,
  opts: BuildEwayBillOptions
): Promise<EwbPayload> {
  const db = client;

  const invoice = await db.invoice.findFirst({
    where: { id: opts.invoiceId, organizationId: opts.organizationId },
    include: {
      organization: true,
      party: true,
      items: {
        include: { item: { include: { primaryUnit: true } } },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!invoice) throw new EwayBillValidationError(["Invoice not found"]);

  const errors: string[] = [];
  const seller = invoice.organization;
  const buyer = invoice.party;
  const t = opts.transport;

  // Threshold check.
  const totalTaxable = invoice.items.reduce(
    (acc, li) => acc.plus(D(li.taxableAmount)),
    D(0)
  );
  if (totalTaxable.lessThan(EWAY_THRESHOLD)) {
    errors.push(
      `Invoice total taxable value ₹${totalTaxable.toString()} is below the ₹50,000 e-way bill threshold`
    );
  }

  // Required fields.
  if (!seller.gstNo) errors.push("Seller GSTIN required");
  else if (!isValidGstinFormat(seller.gstNo)) errors.push("Seller GSTIN format invalid");

  if (!seller.address || !seller.city || !seller.postalCode) {
    errors.push("Seller address (line 1, city, PIN) required");
  }
  if (!buyer.billingAddress || !buyer.billingCity || !buyer.billingPostal) {
    errors.push("Buyer address (line 1, city, PIN) required");
  }

  // Transport: vehicle number is mandatory for road transport. NIC also
  // accepts a transporter ID without a vehicle, in which case the
  // transporter updates the vehicle later via Update Part-B.
  const transMode: EwbTransMode = t.transMode ?? "1";
  if (transMode === "1" && !t.vehicleNo && !t.transporterId) {
    errors.push("Vehicle number OR transporter ID required for road movement");
  }

  if (t.transDistance < 0 || t.transDistance > 4000) {
    errors.push("Transport distance must be 0–4000 km");
  }

  for (const [i, li] of invoice.items.entries()) {
    if (!li.hsnCode) errors.push(`Line ${i + 1}: HSN code required`);
  }

  if (errors.length > 0) throw new EwayBillValidationError(errors);

  const supplyType: EwbSupplyType = "O";
  const subSupplyType: EwbSubSupplyType =
    t.subSupplyType ?? (invoice.supplyType === "EXPORT" ? 3 : 1);

  const docType: EwbDocType =
    invoice.type === "CREDIT_NOTE" || invoice.type === "DEBIT_NOTE" ? "OTH" : "INV";

  const sellerStateCode = toNumericState(stateCodeFromGstin(seller.gstNo!));
  const buyerStateCode = toNumericState(
    buyer.billingState ?? (buyer.gstNo ? stateCodeFromGstin(buyer.gstNo) : null)
  );

  const totals = invoice.items.reduce(
    (acc, li) => ({
      cgst: acc.cgst.plus(D(li.cgstAmount ?? 0)),
      sgst: acc.sgst.plus(D(li.sgstAmount ?? 0)),
      igst: acc.igst.plus(D(li.igstAmount ?? 0)),
      cess: acc.cess.plus(D(li.cessAmount ?? 0)),
    }),
    { cgst: D(0), sgst: D(0), igst: D(0), cess: D(0) }
  );

  return {
    supplyType,
    subSupplyType,
    docType,
    docNo: invoice.invoiceNumber,
    docDate: toDocDate(invoice.date),

    fromGstin: seller.gstNo!.toUpperCase(),
    fromTrdName: seller.name,
    fromAddr1: seller.address!,
    fromAddr2: undefined,
    fromPlace: seller.city!,
    fromPincode: Number(seller.postalCode!),
    fromStateCode: sellerStateCode,
    actFromStateCode: sellerStateCode,

    toGstin: buyer.gstNo?.toUpperCase() ?? "URP", // URP = Unregistered Person
    toTrdName: buyer.name,
    toAddr1: buyer.billingAddress!,
    toAddr2: undefined,
    toPlace: buyer.billingCity!,
    toPincode: Number(buyer.billingPostal!),
    toStateCode: buyerStateCode,
    actToStateCode: buyerStateCode,

    transactionType: t.transactionType ?? 1,

    totalValue: toEwbNumber(totalTaxable),
    cgstValue: toEwbNumber(totals.cgst),
    sgstValue: toEwbNumber(totals.sgst),
    igstValue: toEwbNumber(totals.igst),
    cessValue: toEwbNumber(totals.cess),
    cessNonAdvolValue: 0,
    totInvValue: toEwbNumber(invoice.totalAmount),

    transMode,
    transDistance: String(t.transDistance),
    transporterId: t.transporterId,
    transporterName: t.transporterName,
    vehicleNo: t.vehicleNo?.replace(/\s+/g, "").toUpperCase(),
    vehicleType: t.vehicleType,
    transDocNo: t.transDocNo,
    transDocDate: t.transDocDate,

    itemList: invoice.items.map((li) => ({
      productName: li.item?.name ?? li.description,
      productDesc: li.description,
      hsnCode: Number(li.hsnCode!),
      quantity: toEwbNumber(li.quantity, 3),
      qtyUnit: li.item?.primaryUnit?.symbol ?? li.item?.primaryUnit?.name ?? "OTH",
      cgstRate: toEwbNumber(li.cgstRate ?? 0),
      sgstRate: toEwbNumber(li.sgstRate ?? 0),
      igstRate: toEwbNumber(li.igstRate ?? 0),
      cessRate: toEwbNumber(li.cessRate ?? 0),
      cessNonAdvol: 0,
      taxableAmount: toEwbNumber(li.taxableAmount),
    })),
  };
}

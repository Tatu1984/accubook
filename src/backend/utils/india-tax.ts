import { D, type DecimalLike } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";

/**
 * India GST math.
 *
 * Place of supply rules (simplified for goods/services within India):
 *   - Intrastate (supplier and recipient in same state) → CGST + SGST, each at half the GST rate.
 *   - Interstate (different states, OR exports/imports) → IGST at the full GST rate.
 *
 * UTGST applies in Union Territories instead of SGST. We treat the 8 UTs that
 * have their own legislatures (Delhi, Puducherry, J&K, Ladakh) as "states"
 * (CGST+SGST). The other UTs use UTGST. For now we approximate UT handling
 * as SGST — the schema doesn't model UTGST as a separate tax type yet.
 *
 * Place of supply for B2B services follows the recipient's location of
 * registration (default behavior here). B2C and special-category services
 * (immovable property, transportation, etc.) have nuanced rules per Section
 * 12-13 of the IGST Act — those are out of scope for this helper and need
 * caller-supplied `placeOfSupplyState` overrides when applicable.
 */

export type SupplyType = "INTRASTATE" | "INTERSTATE";

/**
 * Decide intrastate vs interstate. Both inputs are 2-letter Indian state
 * codes per ISO 3166-2:IN (e.g., "MH", "KA", "DL"). If either is missing
 * or non-Indian, default to interstate (IGST) — safer for GST exposure
 * since CGST+SGST without same-state confirmation can lead to ITC denial.
 */
export function determineSupplyType(
  supplierState: string | null | undefined,
  placeOfSupplyState: string | null | undefined
): SupplyType {
  if (!supplierState || !placeOfSupplyState) return "INTERSTATE";
  return supplierState.trim().toUpperCase() === placeOfSupplyState.trim().toUpperCase()
    ? "INTRASTATE"
    : "INTERSTATE";
}

/**
 * Split a single combined GST rate into the component breakdown for a given
 * supply type. Returns rates in percent (NOT amounts).
 */
export function splitGstRate(
  combinedRate: DecimalLike,
  supplyType: SupplyType
): { cgst: Prisma.Decimal; sgst: Prisma.Decimal; igst: Prisma.Decimal } {
  const rate = D(combinedRate);
  if (supplyType === "INTRASTATE") {
    const half = rate.dividedBy(D(2));
    return { cgst: half, sgst: half, igst: D(0) };
  }
  return { cgst: D(0), sgst: D(0), igst: rate };
}

/**
 * Compute the per-line GST tax amounts given a taxable amount and a
 * combined GST rate. Returns Decimal amounts (not rates).
 */
export function computeLineGst(
  taxableAmount: DecimalLike,
  combinedRate: DecimalLike,
  supplyType: SupplyType
): {
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  totalTaxAmount: Prisma.Decimal;
} {
  const taxable = D(taxableAmount);
  const rates = splitGstRate(combinedRate, supplyType);
  const cgstAmount = taxable.times(rates.cgst).dividedBy(D(100));
  const sgstAmount = taxable.times(rates.sgst).dividedBy(D(100));
  const igstAmount = taxable.times(rates.igst).dividedBy(D(100));
  return {
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTaxAmount: cgstAmount.plus(sgstAmount).plus(igstAmount),
  };
}

/**
 * Indian state code from a GSTIN. GSTIN format: NN AAAAA NNNN A 1 Z M
 * where the first 2 digits are the state code per Schedule of the GST Act.
 *
 *   01 = Jammu & Kashmir   02 = Himachal Pradesh   03 = Punjab
 *   04 = Chandigarh        05 = Uttarakhand        06 = Haryana
 *   07 = Delhi             08 = Rajasthan          09 = Uttar Pradesh
 *   10 = Bihar             11 = Sikkim             12 = Arunachal Pradesh
 *   13 = Nagaland          14 = Manipur            15 = Mizoram
 *   16 = Tripura           17 = Meghalaya          18 = Assam
 *   19 = West Bengal       20 = Jharkhand          21 = Odisha
 *   22 = Chhattisgarh      23 = Madhya Pradesh     24 = Gujarat
 *   25 = Daman & Diu       26 = Dadra & Nagar Haveli  27 = Maharashtra
 *   29 = Karnataka         30 = Goa                31 = Lakshadweep
 *   32 = Kerala            33 = Tamil Nadu         34 = Puducherry
 *   35 = Andaman & Nicobar 36 = Telangana          37 = Andhra Pradesh
 *   38 = Ladakh            97 = Other Territory    99 = Centre
 *
 * Returns the 2-letter ISO 3166-2:IN code if a mapping exists, else null.
 */
export const STATE_CODE_BY_GSTIN_PREFIX: Record<string, string> = {
  "01": "JK", "02": "HP", "03": "PB", "04": "CH", "05": "UT", "06": "HR",
  "07": "DL", "08": "RJ", "09": "UP", "10": "BR", "11": "SK", "12": "AR",
  "13": "NL", "14": "MN", "15": "MZ", "16": "TR", "17": "ML", "18": "AS",
  "19": "WB", "20": "JH", "21": "OR", "22": "CG", "23": "MP", "24": "GJ",
  "25": "DD", "26": "DN", "27": "MH", "29": "KA", "30": "GA", "31": "LD",
  "32": "KL", "33": "TN", "34": "PY", "35": "AN", "36": "TG", "37": "AP",
  "38": "LA",
};

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  return STATE_CODE_BY_GSTIN_PREFIX[gstin.slice(0, 2)] ?? null;
}

/**
 * Strict GSTIN format check.
 * Pattern: 2-digit state code, 10 chars (PAN: 5 letters + 4 digits + 1 letter),
 * 1 entity number, "Z", 1 alphanumeric checksum.
 * Total: 15 chars.
 */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidGstinFormat(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  return GSTIN_RE.test(gstin.trim().toUpperCase());
}

/**
 * GSTIN Mod-36 checksum verifier.
 *
 * The 15th character is a check digit computed over the first 14
 * characters using a base-36 weighted sum:
 *   - char[i] is mapped to its base-36 digit (0-9 → 0-9, A-Z → 10-35)
 *   - weights alternate 1, 2, 1, 2, ... starting from position 0
 *   - sum the products' base-36 digits (i.e. each factor mod 36 + carry)
 *   - check digit = (36 - (sum mod 36)) mod 36 → mapped back to char
 *
 * This catches typos that pass the regex (e.g. transposed digits) but
 * fail the mathematical check. NIC's e-invoice API enforces it server-
 * side; we enforce client-side too so customers don't send invoices that
 * the portal will silently reject.
 *
 * Returns true when the checksum matches; false otherwise (including
 * format violations).
 */
const BASE36_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE36_VALUE: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (let i = 0; i < BASE36_CHARS.length; i++) out[BASE36_CHARS[i]] = i;
  return out;
})();

export function verifyGstinChecksum(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  const upper = gstin.trim().toUpperCase();
  if (!GSTIN_RE.test(upper)) return false;

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const ch = upper[i];
    const value = BASE36_VALUE[ch];
    if (value === undefined) return false;
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    // Add base-36 digit-by-digit to mimic the official algorithm:
    //   sum += (product / 36) + (product mod 36)
    sum += Math.floor(product / 36) + (product % 36);
  }
  const expectedDigit = (36 - (sum % 36)) % 36;
  const expectedChar = BASE36_CHARS[expectedDigit];
  return upper[14] === expectedChar;
}

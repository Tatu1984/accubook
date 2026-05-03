import { D, type DecimalLike } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";

/**
 * TDS (Tax Deducted at Source) computation per the Income Tax Act, India.
 *
 * Rates and thresholds shipped here reflect the rules in force as of FY
 * 2025-26. The Income Tax Act amends these via the annual Finance Bill;
 * keep this file under review every April. The library does NOT model:
 *   - PAN-not-furnished penal rate (20% — caller passes `noPan: true` to
 *     override the section rate).
 *   - Lower / nil deduction certificates issued under Section 197.
 *   - Surcharge & cess on the deducted amount (rare for resident TDS).
 *   - Non-resident TDS (Section 195) — different framework.
 *
 * The schema for storing per-bill deductions / monthly aggregates / Form
 * 16A certificates is a separate piece. This file is the pure compute
 * core, callable from bill POST / payment POST / TDS report flows.
 */

export type DeducteeType = "INDIVIDUAL_HUF" | "COMPANY_OTHER";

/**
 * Identifiers for the most common TDS sections an SMB / mid-market
 * business in India encounters. Caller passes one of these to
 * `computeTds`; we look up the rate + threshold from the table.
 */
export type TdsSectionCode =
  | "194C"      // payments to contractors
  | "194C_TRANSPORT" // sub-rule for transport contractors with PAN
  | "194J"      // professional / technical services
  | "194I_LAND" // rent of land / building / furniture
  | "194I_PM"   // rent of plant & machinery
  | "194H"      // commission or brokerage
  | "194Q"      // purchase of goods (buyer deducts)
  | "194O"      // e-commerce operator on payments to participants
  | "206C_1H"   // TCS on sale of goods (seller collects)
  | "206C_1F";  // TCS on sale of motor vehicles > ₹10 lakh

export type TdsRule = {
  /** Section code as it appears on the TDS challan and Form 16A. */
  code: TdsSectionCode;
  description: string;
  /** Whether this is TDS (deducted by payer) or TCS (collected by seller). */
  type: "TDS" | "TCS";
  /**
   * Rate applied to the **taxable base** (usually invoice/payment value
   * net of GST). Both individual/HUF and company/other rates are listed
   * since several sections differ by deductee type.
   */
  rateIndividualHuf: string;
  rateCompanyOther: string;
  /**
   * Single-transaction threshold: TDS doesn't apply if the value of THIS
   * transaction (net of GST) is below this amount. `null` means no single
   * threshold (e.g. 194Q has only an annual aggregate threshold).
   */
  thresholdSingle: string | null;
  /**
   * Annual aggregate threshold: cumulative payments to this deductee in
   * the financial year. TDS kicks in once aggregate crosses this.
   */
  thresholdAnnual: string | null;
};

/**
 * Static rate table. All amounts in INR. Rates as percentages of the
 * taxable base (NOT decimals — i.e. 1 means 1%, not 100%).
 *
 * Sources (verify before any prod-tax-filing usage):
 *   - Section 194C: Income Tax Act, 1961
 *   - Finance Act 2025 — current rates
 *   - CBDT circulars on threshold revisions
 */
export const TDS_RULES: Readonly<Record<TdsSectionCode, TdsRule>> = {
  "194C": {
    code: "194C",
    description: "Payment to contractors / sub-contractors",
    type: "TDS",
    rateIndividualHuf: "1",
    rateCompanyOther: "2",
    thresholdSingle: "30000",
    thresholdAnnual: "100000",
  },
  "194C_TRANSPORT": {
    code: "194C_TRANSPORT",
    description: "Transport contractor (with PAN, owning ≤10 goods carriages)",
    type: "TDS",
    rateIndividualHuf: "0",
    rateCompanyOther: "0",
    thresholdSingle: null,
    thresholdAnnual: null,
  },
  "194J": {
    code: "194J",
    description: "Fees for professional / technical services",
    type: "TDS",
    rateIndividualHuf: "10",
    rateCompanyOther: "10",
    thresholdSingle: "30000",
    thresholdAnnual: null,
  },
  "194I_LAND": {
    code: "194I_LAND",
    description: "Rent on land / building / furniture / fittings",
    type: "TDS",
    rateIndividualHuf: "10",
    rateCompanyOther: "10",
    thresholdSingle: null,
    thresholdAnnual: "240000",
  },
  "194I_PM": {
    code: "194I_PM",
    description: "Rent on plant & machinery",
    type: "TDS",
    rateIndividualHuf: "2",
    rateCompanyOther: "2",
    thresholdSingle: null,
    thresholdAnnual: "240000",
  },
  "194H": {
    code: "194H",
    description: "Commission or brokerage",
    type: "TDS",
    rateIndividualHuf: "5",
    rateCompanyOther: "5",
    thresholdSingle: null,
    thresholdAnnual: "15000",
  },
  "194Q": {
    code: "194Q",
    description: "Purchase of goods (buyer's TDS where buyer turnover > ₹10 cr last FY)",
    type: "TDS",
    rateIndividualHuf: "0.1",
    rateCompanyOther: "0.1",
    thresholdSingle: null,
    // 194Q applies on amount EXCEEDING ₹50 lakh in a year per vendor.
    thresholdAnnual: "5000000",
  },
  "194O": {
    code: "194O",
    description: "E-commerce operator on payments to participants",
    type: "TDS",
    rateIndividualHuf: "1",
    rateCompanyOther: "1",
    thresholdSingle: null,
    thresholdAnnual: "500000",
  },
  "206C_1H": {
    code: "206C_1H",
    description: "TCS on sale of goods (seller's TCS where seller turnover > ₹10 cr last FY)",
    type: "TCS",
    rateIndividualHuf: "0.1",
    rateCompanyOther: "0.1",
    thresholdSingle: null,
    // 206C(1H) applies on amount EXCEEDING ₹50 lakh in a year per buyer.
    thresholdAnnual: "5000000",
  },
  "206C_1F": {
    code: "206C_1F",
    description: "TCS on sale of motor vehicle > ₹10 lakh",
    type: "TCS",
    rateIndividualHuf: "1",
    rateCompanyOther: "1",
    // Per-transaction trigger: any single sale over ₹10 lakh.
    thresholdSingle: "1000000",
    thresholdAnnual: null,
  },
};

const PENAL_RATE_NO_PAN = "20";

export type TdsInput = {
  /** Section under which TDS/TCS is being deducted/collected. */
  section: TdsSectionCode;
  /** Whether the deductee is an Individual/HUF (different rate for some sections). */
  deducteeType: DeducteeType;
  /** Taxable base for THIS transaction (typically bill value net of GST). */
  amount: DecimalLike;
  /**
   * Aggregate amount paid/payable to this deductee under this section in
   * the current financial year, BEFORE this transaction. Used for annual
   * threshold checks.
   */
  ytdAggregate?: DecimalLike;
  /** True when the deductee has not furnished PAN (penal 20% rate). */
  noPan?: boolean;
};

export type TdsResult = {
  /** Section that was applied. */
  section: TdsSectionCode;
  /** "TDS" or "TCS". */
  type: "TDS" | "TCS";
  /** Effective rate (after PAN check) as percent. */
  rate: Prisma.Decimal;
  /**
   * Amount of TDS/TCS deducted/collected. ZERO when no threshold is
   * crossed. For 194Q / 206C(1H), only the portion EXCEEDING the annual
   * threshold is subject to deduction.
   */
  amount: Prisma.Decimal;
  /** Net payable to the vendor (amount − tds), or net receivable for TCS (amount + tcs). */
  netAfter: Prisma.Decimal;
  /**
   * If a threshold was checked but not crossed, this records why TDS
   * wasn't applied. Useful for audit logs and the bill UI.
   */
  appliedReason: "DEDUCTED" | "BELOW_SINGLE_THRESHOLD" | "BELOW_ANNUAL_THRESHOLD" | "ZERO_RATE";
};

/**
 * Pure TDS / TCS calculation. Returns a Decimal-typed result; persistence
 * and posting (Dr Vendor / Cr TDS Payable for TDS) are caller concerns.
 */
export function computeTds(input: TdsInput): TdsResult {
  const rule = TDS_RULES[input.section];
  const amount = D(input.amount);
  const ytd = input.ytdAggregate ? D(input.ytdAggregate) : D(0);

  // Penal 20% if no PAN — overrides the section rate.
  const declaredRate = D(
    input.noPan
      ? PENAL_RATE_NO_PAN
      : input.deducteeType === "INDIVIDUAL_HUF"
        ? rule.rateIndividualHuf
        : rule.rateCompanyOther
  );

  // 0% rate (e.g. 194C transport contractor with PAN) → no deduction.
  if (declaredRate.isZero()) {
    return {
      section: rule.code,
      type: rule.type,
      rate: D(0),
      amount: D(0),
      netAfter: amount,
      appliedReason: "ZERO_RATE",
    };
  }

  // For 194Q and 206C(1H): TDS/TCS applies only on the AMOUNT EXCEEDING
  // the annual threshold. Single threshold is irrelevant.
  if (rule.code === "194Q" || rule.code === "206C_1H") {
    const threshold = D(rule.thresholdAnnual!);
    const newAggregate = ytd.plus(amount);
    if (newAggregate.lessThanOrEqualTo(threshold)) {
      return {
        section: rule.code,
        type: rule.type,
        rate: declaredRate,
        amount: D(0),
        netAfter: amount,
        appliedReason: "BELOW_ANNUAL_THRESHOLD",
      };
    }
    const taxableBase = ytd.greaterThanOrEqualTo(threshold)
      ? amount
      : newAggregate.minus(threshold);
    const taxAmount = taxableBase.times(declaredRate).dividedBy(D(100));
    const netAfter = rule.type === "TDS" ? amount.minus(taxAmount) : amount.plus(taxAmount);
    return {
      section: rule.code,
      type: rule.type,
      rate: declaredRate,
      amount: taxAmount,
      netAfter,
      appliedReason: "DEDUCTED",
    };
  }

  // For ordinary TDS sections (194C / 194J / 194I / 194H / 194O):
  //   TDS applies when EITHER the single-transaction threshold is crossed
  //   OR the aggregate-during-FY threshold is crossed by this transaction.
  //   The deduction is on the FULL transaction amount in either case
  //   (no "only the excess" rule — those exist only for 194Q/206C(1H)).
  const singleCrossed =
    rule.thresholdSingle !== null && amount.greaterThanOrEqualTo(D(rule.thresholdSingle));
  const annualCrossed =
    rule.thresholdAnnual !== null && ytd.plus(amount).greaterThan(D(rule.thresholdAnnual));

  if (!singleCrossed && !annualCrossed) {
    // Below both thresholds (or below single when there's no annual, etc.).
    // Report the more-specific reason where possible.
    if (rule.thresholdSingle !== null) {
      return {
        section: rule.code,
        type: rule.type,
        rate: declaredRate,
        amount: D(0),
        netAfter: amount,
        appliedReason: "BELOW_SINGLE_THRESHOLD",
      };
    }
    return {
      section: rule.code,
      type: rule.type,
      rate: declaredRate,
      amount: D(0),
      netAfter: amount,
      appliedReason: "BELOW_ANNUAL_THRESHOLD",
    };
  }

  const taxAmount = amount.times(declaredRate).dividedBy(D(100));
  const netAfter = rule.type === "TDS" ? amount.minus(taxAmount) : amount.plus(taxAmount);
  return {
    section: rule.code,
    type: rule.type,
    rate: declaredRate,
    amount: taxAmount,
    netAfter,
    appliedReason: "DEDUCTED",
  };
}

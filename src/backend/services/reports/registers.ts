import { D, sum } from "@/backend/utils/money";
import type { Tx } from "@/backend/utils/posting";

/**
 * Sales / Purchase / Party-statement reports.
 *
 * "Register" reports are the daily-driver lists every Indian accountant
 * runs — sales register lists every outward invoice in a period;
 * purchase register lists every bill. The "statement of account" for a
 * party is the running-balance ledger from that party's perspective:
 * invoice raises balance, receipt clears it; for a vendor, bill raises
 * balance, payment clears it.
 *
 * All Decimal end-to-end. Read-only — these compute and return; they
 * don't post anything.
 */

export type DateRange = { from: Date; to: Date };

// =====================================================================
// SALES REGISTER
// =====================================================================

export type SalesRegisterRow = {
  invoiceNumber: string;
  date: string;            // YYYY-MM-DD
  type: string;            // INVOICE / CREDIT_NOTE / DEBIT_NOTE / PROFORMA
  partyId: string;
  partyName: string;
  partyGstin: string | null;
  placeOfSupply: string | null;
  supplyType: string | null;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
  totalTax: string;
  totalAmount: string;
  status: string;
  amountPaid: string;
  amountDue: string;
};

export type SalesRegisterTotals = {
  invoiceCount: number;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
  totalTax: string;
  totalValue: string;
  totalPaid: string;
  totalDue: string;
};

export type SalesRegisterResult = {
  period: { from: string; to: string };
  rows: SalesRegisterRow[];
  totals: SalesRegisterTotals;
};

export async function computeSalesRegister(
  client: Tx,
  organizationId: string,
  period: DateRange
): Promise<SalesRegisterResult> {
  const invoices = await client.invoice.findMany({
    where: {
      organizationId,
      date: { gte: period.from, lte: period.to },
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    include: {
      party: { select: { id: true, name: true, gstNo: true } },
      items: {
        select: {
          taxableAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          cessAmount: true,
          taxAmount: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { invoiceNumber: "asc" }],
  });

  const rows: SalesRegisterRow[] = invoices.map((inv) => {
    const taxable = sum(inv.items.map((i) => i.taxableAmount));
    const cgst = sum(inv.items.map((i) => i.cgstAmount ?? 0));
    const sgst = sum(inv.items.map((i) => i.sgstAmount ?? 0));
    const igst = sum(inv.items.map((i) => i.igstAmount ?? 0));
    const cess = sum(inv.items.map((i) => i.cessAmount ?? 0));
    const totalTax = cgst.plus(sgst).plus(igst).plus(cess);
    return {
      invoiceNumber: inv.invoiceNumber,
      date: inv.date.toISOString().slice(0, 10),
      type: inv.type,
      partyId: inv.party.id,
      partyName: inv.party.name,
      partyGstin: inv.party.gstNo,
      placeOfSupply: inv.placeOfSupply,
      supplyType: inv.supplyType,
      taxableValue: taxable.toString(),
      cgst: cgst.toString(),
      sgst: sgst.toString(),
      igst: igst.toString(),
      cess: cess.toString(),
      totalTax: totalTax.toString(),
      totalAmount: D(inv.totalAmount).toString(),
      status: inv.status,
      amountPaid: D(inv.amountPaid).toString(),
      amountDue: D(inv.amountDue).toString(),
    };
  });

  const totals: SalesRegisterTotals = {
    invoiceCount: rows.length,
    taxable: sum(rows.map((r) => r.taxableValue)).toString(),
    cgst: sum(rows.map((r) => r.cgst)).toString(),
    sgst: sum(rows.map((r) => r.sgst)).toString(),
    igst: sum(rows.map((r) => r.igst)).toString(),
    cess: sum(rows.map((r) => r.cess)).toString(),
    totalTax: sum(rows.map((r) => r.totalTax)).toString(),
    totalValue: sum(rows.map((r) => r.totalAmount)).toString(),
    totalPaid: sum(rows.map((r) => r.amountPaid)).toString(),
    totalDue: sum(rows.map((r) => r.amountDue)).toString(),
  };

  return {
    period: {
      from: period.from.toISOString().slice(0, 10),
      to: period.to.toISOString().slice(0, 10),
    },
    rows,
    totals,
  };
}

// =====================================================================
// PURCHASE REGISTER
// =====================================================================

export type PurchaseRegisterRow = {
  billNumber: string;
  vendorBillNo: string | null;
  date: string;
  type: string;            // BILL / DEBIT_NOTE / CREDIT_NOTE
  partyId: string;
  partyName: string;
  partyGstin: string | null;
  placeOfSupply: string | null;
  supplyType: string | null;
  reverseCharge: boolean;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
  totalTax: string;
  totalAmount: string;
  status: string;
  amountPaid: string;
  amountDue: string;
};

export type PurchaseRegisterResult = {
  period: { from: string; to: string };
  rows: PurchaseRegisterRow[];
  totals: {
    billCount: number;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
    cess: string;
    totalTax: string;
    totalValue: string;
    totalPaid: string;
    totalDue: string;
  };
};

export async function computePurchaseRegister(
  client: Tx,
  organizationId: string,
  period: DateRange
): Promise<PurchaseRegisterResult> {
  const bills = await client.bill.findMany({
    where: {
      organizationId,
      date: { gte: period.from, lte: period.to },
      status: { notIn: ["DRAFT", "PENDING_APPROVAL", "CANCELLED"] },
    },
    include: {
      party: { select: { id: true, name: true, gstNo: true } },
      items: {
        select: {
          taxableAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          cessAmount: true,
          taxAmount: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { billNumber: "asc" }],
  });

  const rows: PurchaseRegisterRow[] = bills.map((b) => {
    const taxable = sum(b.items.map((i) => i.taxableAmount));
    const cgst = sum(b.items.map((i) => i.cgstAmount ?? 0));
    const sgst = sum(b.items.map((i) => i.sgstAmount ?? 0));
    const igst = sum(b.items.map((i) => i.igstAmount ?? 0));
    const cess = sum(b.items.map((i) => i.cessAmount ?? 0));
    const totalTax = cgst.plus(sgst).plus(igst).plus(cess);
    return {
      billNumber: b.billNumber,
      vendorBillNo: b.vendorBillNo,
      date: b.date.toISOString().slice(0, 10),
      type: b.type,
      partyId: b.party.id,
      partyName: b.party.name,
      partyGstin: b.party.gstNo,
      placeOfSupply: b.placeOfSupply,
      supplyType: b.supplyType,
      reverseCharge: b.reverseCharge,
      taxableValue: taxable.toString(),
      cgst: cgst.toString(),
      sgst: sgst.toString(),
      igst: igst.toString(),
      cess: cess.toString(),
      totalTax: totalTax.toString(),
      totalAmount: D(b.totalAmount).toString(),
      status: b.status,
      amountPaid: D(b.amountPaid).toString(),
      amountDue: D(b.amountDue).toString(),
    };
  });

  return {
    period: {
      from: period.from.toISOString().slice(0, 10),
      to: period.to.toISOString().slice(0, 10),
    },
    rows,
    totals: {
      billCount: rows.length,
      taxable: sum(rows.map((r) => r.taxableValue)).toString(),
      cgst: sum(rows.map((r) => r.cgst)).toString(),
      sgst: sum(rows.map((r) => r.sgst)).toString(),
      igst: sum(rows.map((r) => r.igst)).toString(),
      cess: sum(rows.map((r) => r.cess)).toString(),
      totalTax: sum(rows.map((r) => r.totalTax)).toString(),
      totalValue: sum(rows.map((r) => r.totalAmount)).toString(),
      totalPaid: sum(rows.map((r) => r.amountPaid)).toString(),
      totalDue: sum(rows.map((r) => r.amountDue)).toString(),
    },
  };
}

// =====================================================================
// PARTY STATEMENT OF ACCOUNT
// =====================================================================

export type StatementEntry = {
  date: string;
  docType: "INVOICE" | "BILL" | "RECEIPT" | "PAYMENT" | "CN" | "DN";
  docNumber: string;
  description: string;
  /** Money this transaction adds to what the party owes us (or we owe them). */
  debit: string;
  /** Money this transaction removes from what the party owes us (or we owe them). */
  credit: string;
  /** Running balance from our books' perspective:
   *   - For a customer: positive = they owe us. Invoice +; Receipt -.
   *   - For a vendor: positive = we owe them. Bill +; Payment -.
   */
  balance: string;
  status: string | null;
};

export type PartyStatementResult = {
  period: { from: string; to: string };
  party: {
    id: string;
    name: string;
    gstin: string | null;
    type: string;
  };
  /** Running balance as of period.from (before any in-period entries). */
  openingBalance: string;
  entries: StatementEntry[];
  /** Running balance as of period.to. */
  closingBalance: string;
  totals: {
    totalDebit: string;
    totalCredit: string;
  };
};

export async function computePartyStatement(
  client: Tx,
  organizationId: string,
  partyId: string,
  period: DateRange
): Promise<PartyStatementResult> {
  const party = await client.party.findFirst({
    where: { id: partyId, organizationId },
    select: { id: true, name: true, gstNo: true, type: true },
  });
  if (!party) {
    throw new Error("Party not found in organization");
  }

  // Pull every relevant document for this party. Three roles:
  //   - As CUSTOMER: invoices + receipts.
  //   - As VENDOR:   bills + payments.
  // Direction (sign of debit/credit) flips by role. We compute opening
  // balance from any pre-period docs.
  const isVendor = party.type === "VENDOR" || party.type === "BOTH";
  const isCustomer = party.type === "CUSTOMER" || party.type === "BOTH";

  const [allInvoices, allReceipts, allBills, allPayments] = await Promise.all([
    isCustomer
      ? client.invoice.findMany({
          where: {
            organizationId,
            partyId,
            status: { notIn: ["DRAFT", "CANCELLED"] },
            date: { lte: period.to },
          },
          select: {
            invoiceNumber: true,
            type: true,
            date: true,
            totalAmount: true,
            status: true,
          },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    isCustomer
      ? client.receipt.findMany({
          where: {
            organizationId,
            partyId,
            status: "COMPLETED",
            date: { lte: period.to },
          },
          select: { receiptNumber: true, date: true, amount: true, status: true },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    isVendor
      ? client.bill.findMany({
          where: {
            organizationId,
            partyId,
            status: { notIn: ["DRAFT", "PENDING_APPROVAL", "CANCELLED"] },
            date: { lte: period.to },
          },
          select: {
            billNumber: true,
            type: true,
            date: true,
            totalAmount: true,
            status: true,
          },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    isVendor
      ? client.payment.findMany({
          where: {
            organizationId,
            partyId,
            status: "COMPLETED",
            date: { lte: period.to },
          },
          select: { paymentNumber: true, date: true, amount: true, status: true },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Build a flat unified list, then split pre-period vs in-period.
  type Raw = {
    date: Date;
    sortKey: string;
    docType: StatementEntry["docType"];
    docNumber: string;
    description: string;
    debit: import("@/generated/prisma").Prisma.Decimal;
    credit: import("@/generated/prisma").Prisma.Decimal;
    status: string | null;
  };

  const items: Raw[] = [];

  for (const inv of allInvoices) {
    const docType: StatementEntry["docType"] =
      inv.type === "CREDIT_NOTE" ? "CN" : inv.type === "DEBIT_NOTE" ? "DN" : "INVOICE";
    // CN reduces what the customer owes; treat it as a credit.
    const debit = docType === "CN" ? D(0) : D(inv.totalAmount);
    const credit = docType === "CN" ? D(inv.totalAmount) : D(0);
    items.push({
      date: inv.date,
      sortKey: inv.invoiceNumber,
      docType,
      docNumber: inv.invoiceNumber,
      description: docType === "CN" ? "Credit Note" : docType === "DN" ? "Debit Note" : "Sales Invoice",
      debit,
      credit,
      status: inv.status,
    });
  }

  for (const r of allReceipts) {
    items.push({
      date: r.date,
      sortKey: r.receiptNumber,
      docType: "RECEIPT",
      docNumber: r.receiptNumber,
      description: "Receipt against AR",
      debit: D(0),
      credit: D(r.amount),
      status: r.status,
    });
  }

  for (const b of allBills) {
    const docType: StatementEntry["docType"] =
      b.type === "CREDIT_NOTE" ? "CN" : b.type === "DEBIT_NOTE" ? "DN" : "BILL";
    // Bill increases AP we owe → debit. CN reduces AP → credit.
    const debit = docType === "CN" ? D(0) : D(b.totalAmount);
    const credit = docType === "CN" ? D(b.totalAmount) : D(0);
    items.push({
      date: b.date,
      sortKey: b.billNumber,
      docType,
      docNumber: b.billNumber,
      description: docType === "CN" ? "Vendor Credit Note" : docType === "DN" ? "Vendor Debit Note" : "Vendor Bill",
      debit,
      credit,
      status: b.status,
    });
  }

  for (const p of allPayments) {
    items.push({
      date: p.date,
      sortKey: p.paymentNumber,
      docType: "PAYMENT",
      docNumber: p.paymentNumber,
      description: "Payment against AP",
      debit: D(0),
      credit: D(p.amount),
      status: p.status,
    });
  }

  // Sort by date, then by docNumber for stable ordering on the same date.
  items.sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime();
    if (d !== 0) return d;
    return a.sortKey.localeCompare(b.sortKey);
  });

  // Compute opening balance from pre-period items.
  let runningBalance = D(0);
  for (const it of items) {
    if (it.date < period.from) {
      runningBalance = runningBalance.plus(it.debit).minus(it.credit);
    }
  }
  const openingBalance = runningBalance.toString();

  // In-period entries with running balance.
  const entries: StatementEntry[] = [];
  let totalDebit = D(0);
  let totalCredit = D(0);
  for (const it of items) {
    if (it.date < period.from || it.date > period.to) continue;
    runningBalance = runningBalance.plus(it.debit).minus(it.credit);
    totalDebit = totalDebit.plus(it.debit);
    totalCredit = totalCredit.plus(it.credit);
    entries.push({
      date: it.date.toISOString().slice(0, 10),
      docType: it.docType,
      docNumber: it.docNumber,
      description: it.description,
      debit: it.debit.toString(),
      credit: it.credit.toString(),
      balance: runningBalance.toString(),
      status: it.status,
    });
  }

  return {
    period: {
      from: period.from.toISOString().slice(0, 10),
      to: period.to.toISOString().slice(0, 10),
    },
    party: {
      id: party.id,
      name: party.name,
      gstin: party.gstNo,
      type: party.type,
    },
    openingBalance,
    entries,
    closingBalance: runningBalance.toString(),
    totals: {
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
    },
  };
}


import { Prisma } from "@/generated/prisma";
import { D, sum } from "@/backend/utils/money";

export type Tx = Prisma.TransactionClient;

type LedgerRef = { id: string };

/**
 * Find the party's accounts ledger; create it if it doesn't exist.
 *
 * Convention:
 *   - VENDOR/BOTH party → "Sundry Creditors" group (AP)
 *   - CUSTOMER/BOTH party → "Sundry Debtors" group (AR)
 *
 * For BOTH-typed parties we default to the AR side. Once we add
 * separate AR/AP ledgers per party, this will be revisited.
 */
export async function getOrCreatePartyLedger(
  tx: Tx,
  organizationId: string,
  partyId: string,
  partyName: string,
  partyType: string
): Promise<LedgerRef> {
  const existing = await tx.ledger.findFirst({
    where: { organizationId, partyId },
    select: { id: true },
  });
  if (existing) return existing;

  const groupName = partyType === "VENDOR" ? "Sundry Creditors" : "Sundry Debtors";
  const group = await tx.ledgerGroup.findFirst({
    where: { organizationId, name: groupName },
    select: { id: true },
  });
  if (!group) {
    throw new Error(
      `Ledger group "${groupName}" is not configured for this organization. ` +
        `Run org setup or contact support.`
    );
  }

  return tx.ledger.create({
    data: {
      organizationId,
      partyId,
      groupId: group.id,
      name: partyName,
      isBillwise: true,
    },
    select: { id: true },
  });
}

/** Find the bank account's ledger; create it if missing. */
export async function getOrCreateBankLedger(
  tx: Tx,
  organizationId: string,
  bankAccountId: string,
  bankAccountName: string
): Promise<LedgerRef> {
  const existing = await tx.ledger.findFirst({
    where: { organizationId, bankAccountId },
    select: { id: true },
  });
  if (existing) return existing;

  const group = await tx.ledgerGroup.findFirst({
    where: { organizationId, name: "Cash & Bank" },
    select: { id: true },
  });
  if (!group) {
    throw new Error('Ledger group "Cash & Bank" is not configured for this organization.');
  }

  return tx.ledger.create({
    data: { organizationId, bankAccountId, groupId: group.id, name: bankAccountName },
    select: { id: true },
  });
}

/**
 * Generic find-or-create for a named ledger under a given group. Throws
 * if the group is missing — callers should ensure the org seed has been
 * applied. Used by payroll-posting which references several ledgers
 * (Salaries Payable, PF Payable, etc.).
 */
export async function getOrCreateNamedLedger(
  tx: Tx,
  organizationId: string,
  name: string,
  groupName: string
): Promise<LedgerRef> {
  const existing = await tx.ledger.findFirst({
    where: { organizationId, name },
    select: { id: true },
  });
  if (existing) return existing;

  const group = await tx.ledgerGroup.findFirst({
    where: { organizationId, name: groupName },
    select: { id: true },
  });
  if (!group) {
    throw new Error(
      `Ledger group "${groupName}" is not configured for this organization. Re-run org seed.`
    );
  }

  return tx.ledger.create({
    data: { organizationId, groupId: group.id, name },
    select: { id: true },
  });
}

/** Find or create the "Cash in Hand" ledger. */
export async function getCashLedger(tx: Tx, organizationId: string): Promise<LedgerRef> {
  const existing = await tx.ledger.findFirst({
    where: { organizationId, name: "Cash in Hand" },
    select: { id: true },
  });
  if (existing) return existing;

  const group = await tx.ledgerGroup.findFirst({
    where: { organizationId, name: "Cash & Bank" },
    select: { id: true },
  });
  if (!group) {
    throw new Error('Ledger group "Cash & Bank" is not configured for this organization.');
  }

  return tx.ledger.create({
    data: { organizationId, groupId: group.id, name: "Cash in Hand" },
    select: { id: true },
  });
}

/**
 * Find or create the "TDS Payable" ledger. Sits under the seeded
 * "Duties & Taxes" group; if neither the ledger nor the group exists
 * (rare for properly-onboarded orgs), throws so the caller can surface
 * a clean setup error instead of corrupting the books.
 */
export async function getTdsPayableLedger(
  tx: Tx,
  organizationId: string
): Promise<LedgerRef> {
  return findOrCreateDutiesAndTaxesLedger(tx, organizationId, "TDS Payable");
}

/**
 * Find or create the "TCS Payable" ledger (TCS = Tax Collected at Source,
 * 206C). Mirrors `getTdsPayableLedger`; used by receipts POST when the
 * caller flags a 206C section.
 */
export async function getTcsPayableLedger(
  tx: Tx,
  organizationId: string
): Promise<LedgerRef> {
  return findOrCreateDutiesAndTaxesLedger(tx, organizationId, "TCS Payable");
}

async function findOrCreateDutiesAndTaxesLedger(
  tx: Tx,
  organizationId: string,
  name: string
): Promise<LedgerRef> {
  const existing = await tx.ledger.findFirst({
    where: { organizationId, name },
    select: { id: true },
  });
  if (existing) return existing;

  const group = await tx.ledgerGroup.findFirst({
    where: { organizationId, name: "Duties & Taxes" },
    select: { id: true },
  });
  if (!group) {
    throw new Error(
      `"${name}" ledger and "Duties & Taxes" group are both missing for this organization. Re-run org seed or create them manually.`
    );
  }

  return tx.ledger.create({
    data: { organizationId, groupId: group.id, name },
    select: { id: true },
  });
}

/** Find the fiscal year covering `date` for the given organization. */
export async function getFiscalYearForDate(
  tx: Tx,
  organizationId: string,
  date: Date
): Promise<{ id: string; startDate: Date; endDate: Date }> {
  const fy = await tx.fiscalYear.findFirst({
    where: {
      organizationId,
      startDate: { lte: date },
      endDate: { gte: date },
    },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!fy) {
    throw new Error(
      `No fiscal year covers date ${date.toISOString().slice(0, 10)} for this organization.`
    );
  }
  return fy;
}

/** Resolve a voucher type by its `code` (e.g. "PAYMENT", "RECEIPT"). */
export async function getVoucherTypeByCode(
  tx: Tx,
  code: string
): Promise<{ id: string; nature: string }> {
  const vt = await tx.voucherType.findUnique({
    where: { code },
    select: { id: true, nature: true },
  });
  if (!vt) {
    throw new Error(`Voucher type "${code}" is not configured. Run seed.`);
  }
  return vt;
}

/**
 * Atomically reserve the next number for a given (organization, scope) pair.
 *
 * Uses Prisma's upsert+increment pattern, which Postgres serializes at the
 * row level — collision-free under concurrent inserts. Replaces the old
 * `findFirst + 1` pattern that raced under load and produced 500s on the
 * loser of any concurrent POST.
 *
 * Caller is expected to call this inside the same `prisma.$transaction`
 * that creates the entity, so the counter increment rolls back if the
 * insert fails.
 */
export async function nextNumber(
  tx: Tx,
  organizationId: string,
  scope: string
): Promise<number> {
  const row = await tx.numberCounter.upsert({
    where: { organizationId_scope: { organizationId, scope } },
    update: { lastNumber: { increment: 1 } },
    create: { organizationId, scope, lastNumber: 1 },
    select: { lastNumber: true },
  });
  return row.lastNumber;
}

/**
 * Format a counter value as `<prefix>-NNNNNN` (e.g. `PAY-000042`).
 */
export function formatNumber(prefix: string, n: number, pad = 6): string {
  return `${prefix}-${String(n).padStart(pad, "0")}`;
}

/**
 * Convenience: race-safe voucher number for (organization, voucherType, fiscalYear).
 * Scope = `VOUCHER:<voucherTypeId>:<fiscalYearId>` so each (type, FY) has its own counter.
 */
export async function generateVoucherNumber(
  tx: Tx,
  organizationId: string,
  voucherTypeId: string,
  fiscalYearId: string,
  prefix: string
): Promise<string> {
  const n = await nextNumber(tx, organizationId, `VOUCHER:${voucherTypeId}:${fiscalYearId}`);
  return formatNumber(prefix, n);
}

/**
 * Apply the balance impact of voucher entries to the affected ledgers.
 *
 * `currentBalance` is stored in the *natural* direction for each ledger:
 *   - ASSETS / EXPENSES (debit-natured): balance grows on debit, shrinks on credit.
 *   - LIABILITIES / INCOME / EQUITY (credit-natured): balance grows on credit, shrinks on debit.
 *
 * This way, all ledger balances display as positive numbers in the direction
 * users expect (a vendor's AP balance shows what we owe them; a bank balance
 * shows what's in the account).
 */
export class LedgerScopeError extends Error {
  constructor(public readonly ledgerIds: string[]) {
    super(
      `Ledger(s) ${ledgerIds.join(", ")} do not belong to this organization ` +
        `(or do not exist). Refusing to apply the entry.`
    );
    this.name = "LedgerScopeError";
  }
}

export async function applyLedgerEntries(
  tx: Tx,
  organizationId: string,
  entries: { ledgerId: string; debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }[]
): Promise<void> {
  if (entries.length === 0) return;

  const ledgerIds = [...new Set(entries.map((e) => e.ledgerId))];
  // Scoped by organizationId, not just by id. Without this a caller could
  // hand over a ledger id belonging to another tenant and this function
  // would happily move that tenant's balance.
  const ledgers = await tx.ledger.findMany({
    where: { id: { in: ledgerIds }, organizationId },
    select: { id: true, group: { select: { nature: true } } },
  });
  const natureById = new Map(ledgers.map((l) => [l.id, l.group.nature]));

  // Fail loudly rather than skipping. The previous `continue` meant a
  // payload referencing an unknown or foreign ledger produced a voucher
  // that balanced on paper while only some of its ledger effects landed —
  // a silent divergence between the journal and the ledger balances.
  const unresolved = ledgerIds.filter((id) => !natureById.has(id));
  if (unresolved.length > 0) throw new LedgerScopeError(unresolved);

  for (const e of entries) {
    const nature = natureById.get(e.ledgerId)!;
    const isDebitNatured = nature === "ASSETS" || nature === "EXPENSES";
    const delta = isDebitNatured
      ? D(e.debitAmount).minus(D(e.creditAmount))
      : D(e.creditAmount).minus(D(e.debitAmount));
    if (delta.isZero()) continue;
    await tx.ledger.update({
      where: { id: e.ledgerId },
      data: { currentBalance: { increment: delta } },
    });
  }
}

/**
 * Statuses that describe where a document sits in its own lifecycle rather
 * than how much of it has been settled. Payment activity must never move a
 * document out of one of these — an unposted draft stays a draft, and a
 * cancelled document stays cancelled.
 */
const LIFECYCLE_LOCKED_INVOICE = new Set(["DRAFT", "CANCELLED"]);
const LIFECYCLE_LOCKED_BILL = new Set(["DRAFT", "PENDING_APPROVAL", "CANCELLED"]);

/**
 * Derive a settlement status from the money, for a document that is past
 * its lifecycle gate.
 *
 * This is deliberately *total*: every input maps to exactly one output, so
 * the result never depends on the status the document happened to hold
 * before. The earlier version left the previous value in place when no
 * branch matched, which meant reversing a payment on a not-yet-due document
 * left it reading PAID with the full amount outstanding — a bounced cheque
 * silently closed the invoice while the ledger side was correctly reversed.
 *
 * `unpaidStatus` is the "issued but nothing received" resting state, which
 * differs per document type (invoices sit at SENT, bills at APPROVED).
 */
export function deriveSettlementStatus(opts: {
  totalAmount: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  amountDue: Prisma.Decimal;
  dueDate: Date;
  unpaidStatus: string;
  now?: Date;
}): string {
  const { totalAmount, amountPaid, amountDue, dueDate, unpaidStatus } = opts;
  const now = opts.now ?? new Date();

  // Nothing to settle. Without this a zero-total document would read as
  // PAID the moment it was issued.
  if (totalAmount.lessThanOrEqualTo(D(0))) return unpaidStatus;

  // Balance cleared. Keyed off amountDue rather than amountPaid so a bill
  // whose remaining balance was extinguished by withheld TDS still closes.
  if (amountDue.lessThanOrEqualTo(D(0))) return "PAID";

  if (amountPaid.greaterThan(D(0))) return "PARTIAL";
  if (dueDate < now) return "OVERDUE";
  return unpaidStatus;
}

/**
 * Recompute an invoice's amountPaid/amountDue/status from its received receipts
 * and write them back. Caller is expected to call this within the same tx that
 * just inserted (or reversed) the receipt.
 */
export async function recomputeInvoiceStatus(
  tx: Tx,
  invoiceId: string
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { totalAmount: true, dueDate: true, status: true },
  });
  if (!invoice) return;

  const receipts = await tx.receipt.findMany({
    where: { invoiceId, status: "COMPLETED" },
    select: { amount: true },
  });
  const amountPaid = sum(receipts.map((r) => r.amount));
  const amountDue = D(invoice.totalAmount).minus(amountPaid);

  const status = LIFECYCLE_LOCKED_INVOICE.has(invoice.status)
    ? invoice.status
    : deriveSettlementStatus({
        totalAmount: D(invoice.totalAmount),
        amountPaid,
        amountDue,
        dueDate: invoice.dueDate,
        unpaidStatus: "SENT",
      });

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid, amountDue, status },
  });
}

/**
 * Recompute a bill's amountPaid/amountDue/status from its associated payments.
 */
export async function recomputeBillStatus(tx: Tx, billId: string): Promise<void> {
  const bill = await tx.bill.findUnique({
    where: { id: billId },
    select: { totalAmount: true, tdsAmount: true, dueDate: true, status: true },
  });
  if (!bill) return;

  const payments = await tx.payment.findMany({
    where: { billId, status: "COMPLETED" },
    select: { amount: true },
  });
  const amountPaid = sum(payments.map((p) => p.amount));
  // amountDue is what we still owe the vendor — net of TDS already
  // withheld at posting (postBillToGl sets `Bill.amountDue =
  // totalAmount − tdsAmount` at create-time). Without subtracting
  // tdsAmount here, the first payment recompute clobbers that
  // reduction and the bill never closes — AP drifts from the
  // vendor ledger by exactly the TDS withheld.
  const tdsWithheld = D(bill.tdsAmount ?? 0);
  const amountDue = D(bill.totalAmount).minus(tdsWithheld).minus(amountPaid);

  const status = LIFECYCLE_LOCKED_BILL.has(bill.status)
    ? bill.status
    : deriveSettlementStatus({
        // Net of TDS: the vendor was never going to receive that portion,
        // so it is not part of the obligation being settled in cash.
        totalAmount: D(bill.totalAmount).minus(tdsWithheld),
        amountPaid,
        amountDue,
        dueDate: bill.dueDate,
        unpaidStatus: "APPROVED",
      });

  await tx.bill.update({
    where: { id: billId },
    data: { amountPaid, amountDue, status },
  });
}

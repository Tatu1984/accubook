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

/** Find the fiscal year covering `date` for the given organization. */
export async function getFiscalYearForDate(
  tx: Tx,
  organizationId: string,
  date: Date
): Promise<{ id: string }> {
  const fy = await tx.fiscalYear.findFirst({
    where: {
      organizationId,
      startDate: { lte: date },
      endDate: { gte: date },
    },
    select: { id: true },
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
 * Generate the next voucher number for a given (organization, voucher type).
 * Caller MUST be inside a transaction. Race-prone in theory; fine in practice
 * until we migrate to Postgres sequences (deferred PR-2 follow-up).
 */
export async function generateVoucherNumber(
  tx: Tx,
  organizationId: string,
  voucherTypeId: string,
  fiscalYearId: string,
  prefix: string
): Promise<string> {
  const last = await tx.voucher.findFirst({
    where: { organizationId, voucherTypeId, fiscalYearId },
    orderBy: { createdAt: "desc" },
    select: { voucherNumber: true },
  });
  const nextNum = last
    ? parseInt(last.voucherNumber.split("-").pop() || "0", 10) + 1
    : 1;
  return `${prefix}-${String(nextNum).padStart(6, "0")}`;
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
export async function applyLedgerEntries(
  tx: Tx,
  entries: { ledgerId: string; debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }[]
): Promise<void> {
  if (entries.length === 0) return;

  const ledgerIds = [...new Set(entries.map((e) => e.ledgerId))];
  const ledgers = await tx.ledger.findMany({
    where: { id: { in: ledgerIds } },
    select: { id: true, group: { select: { nature: true } } },
  });
  const natureById = new Map(ledgers.map((l) => [l.id, l.group.nature]));

  for (const e of entries) {
    const nature = natureById.get(e.ledgerId);
    if (!nature) continue;
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
 * Recompute an invoice's amountPaid/amountDue/status from its received receipts
 * and write them back. Caller is expected to call this within the same tx that
 * just inserted the receipt.
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

  let status: string = invoice.status;
  if (status !== "CANCELLED") {
    if (amountDue.lessThanOrEqualTo(D(0))) {
      status = "PAID";
    } else if (amountPaid.greaterThan(D(0))) {
      status = "PARTIAL";
    } else if (invoice.dueDate < new Date()) {
      status = "OVERDUE";
    }
  }

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
    select: { totalAmount: true, dueDate: true, status: true },
  });
  if (!bill) return;

  const payments = await tx.payment.findMany({
    where: { billId, status: "COMPLETED" },
    select: { amount: true },
  });
  const amountPaid = sum(payments.map((p) => p.amount));
  const amountDue = D(bill.totalAmount).minus(amountPaid);

  let status: string = bill.status;
  if (status !== "CANCELLED" && status !== "DRAFT" && status !== "PENDING_APPROVAL") {
    if (amountDue.lessThanOrEqualTo(D(0))) {
      status = "PAID";
    } else if (amountPaid.greaterThan(D(0))) {
      status = "PARTIAL";
    } else if (bill.dueDate < new Date()) {
      status = "OVERDUE";
    }
  }

  await tx.bill.update({
    where: { id: billId },
    data: { amountPaid, amountDue, status },
  });
}

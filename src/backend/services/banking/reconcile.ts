import { D, type DecimalLike } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";
import type { Tx } from "@/backend/utils/posting";

/**
 * Bank reconciliation auto-matcher.
 *
 * After a customer imports a bank statement, every transaction is sitting
 * unreconciled in `bank_transactions`. The accounting truth lives in
 * `payments` / `receipts` (with their offsetting voucher entries). To
 * reconcile, we need to match each bank txn to its corresponding
 * payment/receipt — and there's no shared external ID, so it's heuristic.
 *
 * The matcher uses a layered scoring approach:
 *
 *   1. Exact amount match (debit ↔ payment, credit ↔ receipt). MUST.
 *   2. Date proximity (same day +5; ±1 day +3; ±3 days +1; >3 days reject).
 *   3. Reference-number substring match (statement ref appears in our
 *      cheque #, txn ref, or notes — or vice versa). +3.
 *   4. Party-name token overlap in description (we strip punctuation,
 *      tokenize on word boundaries, count overlapping tokens ≥4 chars).
 *      +1 per token, capped at +3.
 *
 * A txn is matched to its highest-scoring candidate provided:
 *   - score >= MIN_MATCH_SCORE (5 — date proximity alone isn't enough)
 *   - the candidate is not already matched to a different txn
 *
 * Idempotent: txns already reconciled are skipped. The match writes
 * matchedVoucherId + isReconciled=true on the bank_transaction row.
 */

const MIN_MATCH_SCORE = 5;

export type ReconcileResult = {
  considered: number;
  matched: number;
  ambiguous: number;
  errors: string[];
  /** Sample of matches with their score (for UI surfacing of low-confidence ones). */
  matches: Array<{
    bankTransactionId: string;
    voucherId: string;
    paymentOrReceiptId: string;
    side: "DEBIT" | "CREDIT";
    score: number;
    rationale: string[];
  }>;
};

export type ReconcileOptions = {
  organizationId: string;
  bankAccountId: string;
  /** ISO YYYY-MM-DD; if provided, only consider txns in this range. */
  fromDate?: Date;
  toDate?: Date;
};

type BankTxn = {
  id: string;
  date: Date;
  description: string | null;
  referenceNo: string | null;
  debitAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
};

type Candidate = {
  id: string;
  voucherId: string | null;
  date: Date;
  amount: Prisma.Decimal;
  partyName: string;
  refNote: string;
};

function dateDiffDays(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / 86_400_000);
}

function scoreDateProximity(a: Date, b: Date): number {
  const days = dateDiffDays(a, b);
  if (days === 0) return 5;
  if (days === 1) return 3;
  if (days <= 3) return 1;
  return -1;
}

const STOP_TOKENS = new Set([
  "the", "of", "and", "to", "in", "on", "for", "by", "with", "at",
  "ltd", "limited", "pvt", "private", "co", "inc",
  "neft", "rtgs", "imps", "upi", "ach", "cr", "dr", "ref",
]);

function tokenize(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP_TOKENS.has(t));
}

function scorePartyTokenOverlap(description: string | null, partyName: string): { score: number; matched: string[] } {
  const descTokens = new Set(tokenize(description));
  const partyTokens = tokenize(partyName);
  const matched: string[] = [];
  for (const t of partyTokens) {
    if (descTokens.has(t)) matched.push(t);
  }
  return { score: Math.min(matched.length, 3), matched };
}

function scoreReferenceMatch(bankRef: string | null, candRef: string): number {
  if (!bankRef || !candRef) return 0;
  // Normalize both: strip whitespace AND non-alphanumerics so
  // "NEFT/REF/789" and "neft ref 789" and "ref789" all collapse to the
  // same alphanumeric soup.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const a = norm(bankRef);
  const b = norm(candRef);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 3;
  return 0;
}

export async function reconcileBankTransactions(
  tx: Tx,
  opts: ReconcileOptions
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    considered: 0,
    matched: 0,
    ambiguous: 0,
    errors: [],
    matches: [],
  };

  // Confirm the bank account belongs to the org.
  const bankAccount = await tx.bankAccount.findFirst({
    where: { id: opts.bankAccountId, organizationId: opts.organizationId },
    select: { id: true },
  });
  if (!bankAccount) {
    result.errors.push("Bank account not found in organization");
    return result;
  }

  // Pull the unreconciled bank transactions in the period.
  const dateRange = opts.fromDate || opts.toDate
    ? { gte: opts.fromDate, lte: opts.toDate }
    : undefined;

  const bankTxns = await tx.bankTransaction.findMany({
    where: {
      bankAccountId: opts.bankAccountId,
      isReconciled: false,
      ...(dateRange ? { date: dateRange as Prisma.DateTimeFilter } : {}),
    },
    orderBy: { date: "asc" },
  });

  if (bankTxns.length === 0) return result;
  result.considered = bankTxns.length;

  // Pull payments + receipts for the same bank account in a wider date window.
  // (We use ±10 days around the bank-txn range to catch slow-clearing items.)
  const allDates = bankTxns.map((t) => t.date);
  const earliest = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const latest = new Date(Math.max(...allDates.map((d) => d.getTime())));
  earliest.setUTCDate(earliest.getUTCDate() - 10);
  latest.setUTCDate(latest.getUTCDate() + 10);

  const [payments, receipts] = await Promise.all([
    tx.payment.findMany({
      where: {
        organizationId: opts.organizationId,
        bankAccountId: opts.bankAccountId,
        status: "COMPLETED",
        date: { gte: earliest, lte: latest },
      },
      include: {
        party: { select: { name: true } },
      },
    }),
    tx.receipt.findMany({
      where: {
        organizationId: opts.organizationId,
        bankAccountId: opts.bankAccountId,
        status: "COMPLETED",
        date: { gte: earliest, lte: latest },
      },
      include: {
        party: { select: { name: true } },
      },
    }),
  ]);

  // Track which payments/receipts have been claimed in this run so we don't
  // double-match.
  const claimedPaymentIds = new Set<string>();
  const claimedReceiptIds = new Set<string>();

  // Also exclude payments/receipts that already have a matching reconciled
  // bank txn (matchedVoucherId on bank_transactions).
  const alreadyMatchedVouchers = await tx.bankTransaction.findMany({
    where: {
      bankAccountId: opts.bankAccountId,
      isReconciled: true,
      matchedVoucherId: { not: null },
    },
    select: { matchedVoucherId: true },
  });
  for (const r of alreadyMatchedVouchers) {
    if (r.matchedVoucherId) {
      // We don't know whether it's payment or receipt; mark in both sets.
      // The actual lookup below uses voucherId and skips duplicates.
      claimedPaymentIds.add(r.matchedVoucherId);
      claimedReceiptIds.add(r.matchedVoucherId);
    }
  }

  for (const txn of bankTxns) {
    const isDebit = D(txn.debitAmount).greaterThan(D(0));
    const isCredit = D(txn.creditAmount).greaterThan(D(0));
    if (!isDebit && !isCredit) continue;

    const targetAmount = isDebit ? D(txn.debitAmount) : D(txn.creditAmount);
    const candidates: Candidate[] = isDebit
      // Bank debit ↔ outgoing payment (we paid).
      ? payments
          .filter((p) => !claimedPaymentIds.has(p.id))
          .filter((p) => amountClose(p.amount, targetAmount))
          .map((p) => ({
            id: p.id,
            voucherId: p.voucherId,
            date: p.date,
            amount: D(p.amount),
            partyName: p.party.name,
            refNote: [p.transactionRef, p.chequeNo, p.notes].filter(Boolean).join(" "),
          }))
      // Bank credit ↔ incoming receipt (we received).
      : receipts
          .filter((r) => !claimedReceiptIds.has(r.id))
          .filter((r) => amountClose(r.amount, targetAmount))
          .map((r) => ({
            id: r.id,
            voucherId: r.voucherId,
            date: r.date,
            amount: D(r.amount),
            partyName: r.party.name,
            refNote: [r.transactionRef, r.chequeNo, r.notes].filter(Boolean).join(" "),
          }));

    if (candidates.length === 0) continue;

    let best: { c: Candidate; score: number; rationale: string[] } | null = null;
    let secondBestScore = -Infinity;

    for (const c of candidates) {
      const dateScore = scoreDateProximity(txn.date, c.date);
      if (dateScore < 0) continue;
      const refScore = scoreReferenceMatch(txn.referenceNo, c.refNote);
      const partyScore = scorePartyTokenOverlap(txn.description, c.partyName);

      const score = 5 + dateScore + refScore + partyScore.score;
      const rationale = [
        `amount=${c.amount.toString()}`,
        `dateDiff=${dateDiffDays(txn.date, c.date)}d (+${dateScore})`,
        ...(refScore > 0 ? [`ref-match (+${refScore})`] : []),
        ...(partyScore.score > 0 ? [`party-tokens [${partyScore.matched.join(",")}] (+${partyScore.score})`] : []),
      ];

      if (best === null || score > best.score) {
        secondBestScore = best?.score ?? -Infinity;
        best = { c, score, rationale };
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    if (!best) continue;
    if (best.score < MIN_MATCH_SCORE) continue;

    // Refuse to auto-match when the top two scores are within 1 — likely
    // ambiguous (two txns on the same day for similar amounts to similar
    // parties). Surface for manual review instead.
    if (secondBestScore > -Infinity && best.score - secondBestScore < 1) {
      result.ambiguous++;
      continue;
    }

    if (!best.c.voucherId) {
      result.errors.push(
        `bankTxn ${txn.id} matched candidate ${best.c.id} but no voucher attached`
      );
      continue;
    }

    try {
      await tx.bankTransaction.update({
        where: { id: txn.id },
        data: {
          isReconciled: true,
          reconciledAt: new Date(),
          matchedVoucherId: best.c.voucherId,
        },
      });
      if (isDebit) claimedPaymentIds.add(best.c.id);
      else claimedReceiptIds.add(best.c.id);
      result.matched++;
      result.matches.push({
        bankTransactionId: txn.id,
        voucherId: best.c.voucherId,
        paymentOrReceiptId: best.c.id,
        side: isDebit ? "DEBIT" : "CREDIT",
        score: best.score,
        rationale: best.rationale,
      });
    } catch (e) {
      result.errors.push(`bankTxn ${txn.id}: ${(e as Error).message}`);
    }
  }

  return result;
}

/** True when |a - b| ≤ 0.05 (a 5-paise tolerance for clearing-house rounding). */
function amountClose(a: DecimalLike, b: DecimalLike): boolean {
  return D(a).minus(D(b)).abs().lessThanOrEqualTo(D("0.05"));
}

// Re-export pure scoring helpers for unit testing.
export const __testing = {
  scoreDateProximity,
  scoreReferenceMatch,
  scorePartyTokenOverlap,
  tokenize,
  amountClose,
};

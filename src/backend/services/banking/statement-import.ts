import { D } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";
import type { Tx } from "@/backend/utils/posting";

/**
 * Bank statement CSV importer.
 *
 * Indian banks all export statements as CSV/Excel but every bank uses a
 * different column order and date format. This service normalizes the
 * common four (HDFC / ICICI / SBI / Axis) into a single ParsedTxn shape
 * and inserts them as BankTransaction rows.
 *
 * Idempotent: a transaction is keyed by (bankAccountId, date, debitAmount,
 * creditAmount, referenceNo, description-normalized). Re-importing the
 * same statement skips duplicates.
 *
 * Date formats observed in the wild:
 *   HDFC   DD/MM/YY   (yes — two-digit year)
 *   ICICI  DD/MM/YYYY
 *   SBI    DD MMM YYYY (e.g. "05 Apr 2026")
 *   Axis   DD-MM-YYYY
 *
 * Currency / amount conventions:
 *   HDFC   "Withdrawal Amt." / "Deposit Amt."
 *   ICICI  "Withdrawal Amount (INR)" / "Deposit Amount (INR)"
 *   SBI    "Debit" / "Credit"
 *   Axis   "Debit" / "Credit"
 */

export type SupportedBank = "HDFC" | "ICICI" | "SBI" | "AXIS" | "GENERIC";

export type ParsedTxn = {
  date: Date;
  description: string;
  referenceNo: string | null;
  debitAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  balance: Prisma.Decimal | null;
};

export type StatementImportResult = {
  parsed: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

/** Strip BOM, normalize line endings, drop blank lines. */
function normalizeCsv(raw: string): string {
  return raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
}

/**
 * Quote-aware CSV row splitter. Handles cells with embedded commas.
 * Doesn't handle escaped quotes within cells (rare in bank exports).
 */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function tryParseAmount(s: string | undefined | null): Prisma.Decimal {
  if (!s) return D(0);
  // Strip spaces, commas (Indian thousand separator), and any
  // currency symbols; preserve sign and decimal.
  const cleaned = s.replace(/[,\s₹INR]/gi, "").replace(/[()]/g, "");
  if (!cleaned || cleaned === "-") return D(0);
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return D(0);
  return D(cleaned);
}

const MONTHS_3 = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/**
 * Multi-format date parser. Tries:
 *   DD/MM/YY     → assumes 20YY
 *   DD/MM/YYYY
 *   DD-MM-YYYY
 *   DD MMM YYYY  (3-letter month)
 *   YYYY-MM-DD
 */
function parseDateFlexible(input: string): Date | null {
  if (!input) return null;
  const s = input.trim();

  // YYYY-MM-DD
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);

  // DD/MM/YYYY or DD-MM-YYYY
  m = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/.exec(s);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00.000Z`);
  }

  // DD/MM/YY (HDFC) — assume 20YY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
  if (m) {
    const [, dd, mm, yy] = m;
    const year = 2000 + parseInt(yy, 10);
    return new Date(`${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00.000Z`);
  }

  // DD MMM YYYY (SBI)
  m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(s);
  if (m) {
    const [, dd, monStr, yyyy] = m;
    const month = MONTHS_3.indexOf(monStr.toUpperCase());
    if (month < 0) return null;
    return new Date(Date.UTC(parseInt(yyyy, 10), month, parseInt(dd, 10)));
  }

  return null;
}

type ColumnMap = {
  date: string[];
  description: string[];
  reference: string[];
  debit: string[];
  credit: string[];
  balance: string[];
};

const COLUMN_MAPS: Record<SupportedBank, ColumnMap> = {
  HDFC: {
    date: ["Date"],
    description: ["Narration"],
    reference: ["Chq./Ref.No.", "Chq/Ref Number"],
    debit: ["Withdrawal Amt.", "Withdrawal"],
    credit: ["Deposit Amt.", "Deposit"],
    balance: ["Closing Balance"],
  },
  ICICI: {
    date: ["Transaction Date", "Value Date"],
    description: ["Transaction Remarks", "Particulars"],
    reference: ["Cheque Number", "Reference"],
    debit: ["Withdrawal Amount (INR)", "Debit"],
    credit: ["Deposit Amount (INR)", "Credit"],
    balance: ["Balance (INR)"],
  },
  SBI: {
    date: ["Txn Date", "Date"],
    description: ["Description"],
    reference: ["Ref No./Cheque No."],
    debit: ["Debit"],
    credit: ["Credit"],
    balance: ["Balance"],
  },
  AXIS: {
    date: ["Tran Date", "Date"],
    description: ["Particulars"],
    reference: ["CHQNO"],
    debit: ["Debit", "Dr Amt"],
    credit: ["Credit", "Cr Amt"],
    balance: ["Balance"],
  },
  GENERIC: {
    date: ["date", "Date", "Txn Date", "Transaction Date"],
    description: ["description", "Description", "Narration", "Particulars"],
    reference: ["ref", "Reference", "Chq No", "Cheque No"],
    debit: ["debit", "Debit", "Withdrawal", "Withdrawal Amount"],
    credit: ["credit", "Credit", "Deposit", "Deposit Amount"],
    balance: ["balance", "Balance", "Closing Balance"],
  },
};

function findIndex(headers: string[], candidates: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[\s.()/\-_]/g, "");
  const headersNorm = headers.map(norm);
  for (const cand of candidates) {
    const i = headersNorm.indexOf(norm(cand));
    if (i >= 0) return i;
  }
  return -1;
}

/** Parse a CSV string against the named bank's expected layout. */
export function parseStatementCsv(
  raw: string,
  bank: SupportedBank
): { txns: ParsedTxn[]; warnings: string[] } {
  const text = normalizeCsv(raw);
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { txns: [], warnings: ["No data rows found"] };

  // Find the header line. Most banks pad with summary rows above the
  // tabular data; we scan for the first row that contains a date column.
  const map = COLUMN_MAPS[bank];
  let headerIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (findIndex(cells, map.date) >= 0) {
      headerIndex = i;
      headers = cells;
      break;
    }
  }
  if (headerIndex < 0) {
    return { txns: [], warnings: [`No header row found for bank ${bank}`] };
  }

  const idx = {
    date: findIndex(headers, map.date),
    description: findIndex(headers, map.description),
    reference: findIndex(headers, map.reference),
    debit: findIndex(headers, map.debit),
    credit: findIndex(headers, map.credit),
    balance: findIndex(headers, map.balance),
  };

  const warnings: string[] = [];
  if (idx.date < 0) warnings.push("Date column not found");
  if (idx.debit < 0 && idx.credit < 0) {
    warnings.push("Neither debit nor credit column found");
  }

  const txns: ParsedTxn[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.every((c) => c === "")) continue;

    const dateStr = cells[idx.date];
    const date = dateStr ? parseDateFlexible(dateStr) : null;
    if (!date) {
      warnings.push(`Row ${i + 1}: unparseable date "${dateStr}"`);
      continue;
    }

    txns.push({
      date,
      description: idx.description >= 0 ? (cells[idx.description] ?? "") : "",
      referenceNo: idx.reference >= 0 ? (cells[idx.reference] || null) : null,
      debitAmount: idx.debit >= 0 ? tryParseAmount(cells[idx.debit]) : D(0),
      creditAmount: idx.credit >= 0 ? tryParseAmount(cells[idx.credit]) : D(0),
      balance: idx.balance >= 0 ? tryParseAmount(cells[idx.balance]) : null,
    });
  }

  return { txns, warnings };
}

/**
 * Normalize a description for duplicate detection.
 * Lowercased; whitespace collapsed; punctuation stripped.
 */
function descKey(desc: string): string {
  return desc.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type ImportOptions = {
  bankAccountId: string;
  organizationId: string;
};

/**
 * Insert parsed transactions, skipping any already present.
 * Caller wraps in a $transaction so partial failure rolls back.
 */
export async function importParsedTxns(
  tx: Tx,
  txns: ParsedTxn[],
  opts: ImportOptions
): Promise<StatementImportResult> {
  const result: StatementImportResult = {
    parsed: txns.length,
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  // Confirm bank account belongs to org.
  const bankAccount = await tx.bankAccount.findFirst({
    where: { id: opts.bankAccountId, organizationId: opts.organizationId },
    select: { id: true },
  });
  if (!bankAccount) {
    result.errors.push("Bank account not found in organization");
    return result;
  }

  // Pull existing transactions in the date range to dedupe against.
  if (txns.length === 0) return result;
  const minDate = txns.reduce((min, t) => (t.date < min ? t.date : min), txns[0].date);
  const maxDate = txns.reduce((max, t) => (t.date > max ? t.date : max), txns[0].date);

  const existing = await tx.bankTransaction.findMany({
    where: {
      bankAccountId: opts.bankAccountId,
      date: { gte: minDate, lte: maxDate },
    },
    select: {
      date: true,
      description: true,
      referenceNo: true,
      debitAmount: true,
      creditAmount: true,
    },
  });
  const seenKeys = new Set(
    existing.map((t) =>
      [
        t.date.toISOString().slice(0, 10),
        D(t.debitAmount).toString(),
        D(t.creditAmount).toString(),
        (t.referenceNo ?? "").trim(),
        descKey(t.description ?? ""),
      ].join("|")
    )
  );

  for (const t of txns) {
    const key = [
      t.date.toISOString().slice(0, 10),
      t.debitAmount.toString(),
      t.creditAmount.toString(),
      (t.referenceNo ?? "").trim(),
      descKey(t.description),
    ].join("|");
    if (seenKeys.has(key)) {
      result.skipped++;
      continue;
    }
    try {
      await tx.bankTransaction.create({
        data: {
          bankAccountId: opts.bankAccountId,
          date: t.date,
          description: t.description || null,
          referenceNo: t.referenceNo,
          debitAmount: t.debitAmount,
          creditAmount: t.creditAmount,
          balance: t.balance ?? D(0),
          importSource: "CSV",
        },
      });
      seenKeys.add(key);
      result.inserted++;
    } catch (e) {
      result.errors.push(`Row at ${t.date.toISOString().slice(0, 10)}: ${(e as Error).message}`);
    }
  }

  return result;
}

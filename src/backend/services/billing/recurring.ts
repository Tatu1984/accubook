/**
 * Recurring invoice scheduling.
 *
 * Pure date math + a small "should we spawn?" predicate. The actual
 * spawn-an-invoice work lives in the API route — it has access to the
 * full invoice POST shape (GST split, race-safe numbering, etc.) which
 * we don't want to fork here.
 */

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export const FREQUENCIES: readonly Frequency[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
] as const;

/**
 * Add one frequency interval to a date.
 *
 * For MONTHLY / QUARTERLY / YEARLY we use the calendar-style
 * arithmetic that customers expect: "every 15th" works correctly
 * across months of varying length, and the day-of-month is preserved
 * unless the target month doesn't have it (e.g. Jan 31 + 1 month →
 * Feb 28/29 — clamped to the last day of the target month).
 *
 * All math is in UTC to avoid DST surprises.
 */
export function addFrequency(date: Date, frequency: Frequency): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const mn = date.getUTCMinutes();
  const s = date.getUTCSeconds();

  switch (frequency) {
    case "DAILY":
      return new Date(Date.UTC(y, m, d + 1, h, mn, s));
    case "WEEKLY":
      return new Date(Date.UTC(y, m, d + 7, h, mn, s));
    case "MONTHLY":
      return clampToMonthEnd(y, m + 1, d, h, mn, s);
    case "QUARTERLY":
      return clampToMonthEnd(y, m + 3, d, h, mn, s);
    case "YEARLY":
      return clampToMonthEnd(y + 1, m, d, h, mn, s);
  }
}

function clampToMonthEnd(y: number, m: number, d: number, h: number, mn: number, s: number): Date {
  // Date.UTC tolerates month overflow (12 → next year). We then clamp
  // the day of month to the last day of the resolved month.
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const day = Math.min(d, lastDay);
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day, h, mn, s));
}

export type RecurringRow = {
  id: string;
  isActive: boolean;
  nextRunDate: Date;
  endDate: Date | null;
  frequency: string;
};

/** Should we spawn an invoice for this row right now? */
export function isDue(row: RecurringRow, asOf: Date = new Date()): boolean {
  if (!row.isActive) return false;
  if (row.endDate && row.endDate < asOf) return false;
  return row.nextRunDate <= asOf;
}

/**
 * Catch-up scheduler: returns every missed run date between the row's
 * `nextRunDate` and `asOf` (inclusive of `nextRunDate`, capped at
 * `endDate` if set). Used by the runner so a subscription that was
 * paused for a month can either spawn the missed invoices or be
 * advanced to the next future date — caller decides.
 *
 * For most SMBs we want exactly one invoice per "run" call, so the
 * runner stops at the first due date and re-schedules; this helper
 * lets the UI display "you're 3 cycles behind" if needed.
 */
export function missedRunDates(
  row: RecurringRow,
  asOf: Date = new Date(),
  cap: number = 12
): Date[] {
  if (!row.isActive) return [];
  if (!isFrequency(row.frequency)) return [];
  const out: Date[] = [];
  let cursor = row.nextRunDate;
  while (cursor <= asOf && out.length < cap) {
    if (row.endDate && cursor > row.endDate) break;
    out.push(cursor);
    cursor = addFrequency(cursor, row.frequency);
  }
  return out;
}

export function isFrequency(s: string): s is Frequency {
  return (FREQUENCIES as readonly string[]).includes(s);
}

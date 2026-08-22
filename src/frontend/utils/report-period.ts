/**
 * Date ranges for the report screens' period selectors.
 *
 * Those selectors held state that nothing read: changing "Current FY" to
 * "Q2" re-rendered the dropdown and left the figures untouched, because the
 * fetch always used a hardcoded fiscal-year range. Resolving the selection to
 * a concrete range here is what lets each page refetch on change.
 *
 * India's fiscal year runs 1 April to 31 March, so Q1 is Apr–Jun.
 */

export interface DateRange {
  startDate: string;
  endDate: string;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** The April-starting fiscal year that `reference` falls in. */
export function fiscalYearStart(reference = new Date()): number {
  return reference.getMonth() >= 3
    ? reference.getFullYear()
    : reference.getFullYear() - 1;
}

/** Ranges for the profit-and-loss / cash-flow style "period" selectors. */
export function resolvePeriod(period: string, reference = new Date()): DateRange {
  const fyStart = fiscalYearStart(reference);

  switch (period) {
    case "last-fy":
      return {
        startDate: `${fyStart - 1}-04-01`,
        endDate: `${fyStart}-03-31`,
      };
    case "ytd":
      return { startDate: `${fyStart}-04-01`, endDate: iso(reference) };
    case "q1":
      return { startDate: `${fyStart}-04-01`, endDate: `${fyStart}-06-30` };
    case "q2":
      return { startDate: `${fyStart}-07-01`, endDate: `${fyStart}-09-30` };
    case "q3":
      return { startDate: `${fyStart}-10-01`, endDate: `${fyStart}-12-31` };
    case "q4":
      return { startDate: `${fyStart + 1}-01-01`, endDate: `${fyStart + 1}-03-31` };
    case "current-fy":
    default:
      return { startDate: `${fyStart}-04-01`, endDate: `${fyStart + 1}-03-31` };
  }
}

/** Ranges for the balance-sheet style "as of" selectors. */
export function resolveAsOf(asOf: string, reference = new Date()): DateRange {
  const fyStart = fiscalYearStart(reference);
  const startDate = `${fyStart}-04-01`;

  switch (asOf) {
    case "fy-end":
      return { startDate, endDate: `${fyStart + 1}-03-31` };
    case "last-month": {
      const lastMonthEnd = new Date(
        reference.getFullYear(),
        reference.getMonth(),
        0
      );
      return { startDate, endDate: iso(lastMonthEnd) };
    }
    case "today":
    default:
      return { startDate, endDate: iso(reference) };
  }
}

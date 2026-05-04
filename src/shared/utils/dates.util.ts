/**
 * Date utilities — leaf module (no env / db / logger imports), safe
 * to import from tests, services, and frontend alike.
 */

/**
 * Whole days between two dates, floor. Returns 0 when `from > to`
 * (defensive — keeps calculations safe for callers that don't
 * pre-check ordering).
 */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

import { z } from "zod";

/**
 * An optional field that also accepts JSON `null`.
 *
 * Every GET in this API serialises an unset optional column as `null`,
 * because that is what Prisma returns and what `JSON.stringify` emits.
 * Clients — our own forms included — read a record (or a related record),
 * hand values straight back on the next write, and therefore send `null`
 * for anything the user never filled in.
 *
 * A plain zod `.optional()` rejects `null`, so those writes died with a
 * blanket `400 Validation failed`. The reported case: creating an invoice
 * for a customer with no shipping address on file sent
 * `shippingAddress: null` (copied from the party record) and every
 * invoice for that customer was refused.
 *
 * Here `null` means "not provided" and is normalised to `undefined`, so
 * the output type is exactly what a plain `.optional()` produced before
 * and Prisma leaves the column untouched rather than writing over it.
 *
 * Fields where `null` must actively *clear* a stored value are different
 * and keep their explicit `.nullable()` — this helper is deliberately not
 * applied to them, so "clear this field" still reaches the database.
 *
 * @example
 * const schema = z.object({
 *   notes: optional(z.string()),
 *   creditDays: optional(z.number().int()),
 * });
 */
export function optional<T extends z.ZodType>(schema: T) {
  return schema.nullish().transform((value) => value ?? undefined);
}

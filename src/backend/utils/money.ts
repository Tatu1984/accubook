import { Prisma } from "@/generated/prisma";

export type DecimalLike = Prisma.Decimal | number | string;

/** Cast a number/string to Prisma.Decimal. Use for ALL money math. */
export const D = (v: DecimalLike): Prisma.Decimal =>
  v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);

/** Sum a list of Decimal-likes without ever touching JS float arithmetic. */
export const sum = (vs: DecimalLike[]): Prisma.Decimal =>
  vs.reduce<Prisma.Decimal>((acc, v) => acc.plus(D(v)), D(0));

/** Multiply two decimal-likes. */
export const mul = (a: DecimalLike, b: DecimalLike): Prisma.Decimal => D(a).times(D(b));

/** Compare two decimal-likes. Returns -1, 0, 1. */
export const cmp = (a: DecimalLike, b: DecimalLike): number => D(a).cmp(D(b));

/** Format a Decimal as a fixed-precision string for display/serialization. */
export const fmt = (v: DecimalLike, places = 2): string => D(v).toFixed(places);

/** Convert a Decimal to a JS number — only safe for display, never for arithmetic. */
export const toNumber = (v: DecimalLike): number => D(v).toNumber();

/** True if the difference between two values is within `epsilon` (default 0.01). */
export const closeEnough = (a: DecimalLike, b: DecimalLike, epsilon: DecimalLike = "0.01"): boolean =>
  D(a).minus(D(b)).abs().lessThanOrEqualTo(D(epsilon));

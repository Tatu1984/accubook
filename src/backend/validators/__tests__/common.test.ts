import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { optional } from "../common";

describe("optional()", () => {
  const schema = z.object({
    notes: optional(z.string()),
    creditDays: optional(z.number().int()),
    isDefault: optional(z.boolean()),
    status: optional(z.enum(["A", "B"])),
    tags: optional(z.array(z.string())),
  });

  it("accepts null and normalises it to undefined", () => {
    const parsed = schema.parse({ notes: null, creditDays: null, isDefault: null });
    expect(parsed.notes).toBeUndefined();
    expect(parsed.creditDays).toBeUndefined();
    expect(parsed.isDefault).toBeUndefined();
    // Normalising to undefined (not null) is what keeps Prisma from writing
    // over a column the client never meant to touch.
    expect("notes" in parsed && parsed.notes === null).toBe(false);
  });

  it("accepts an absent key", () => {
    expect(schema.parse({})).toEqual({});
  });

  it("passes real values through untouched", () => {
    const parsed = schema.parse({
      notes: "Paid by cheque",
      creditDays: 30,
      isDefault: true,
      status: "B",
      tags: ["gst", "export"],
    });
    expect(parsed).toEqual({
      notes: "Paid by cheque",
      creditDays: 30,
      isDefault: true,
      status: "B",
      tags: ["gst", "export"],
    });
  });

  it("preserves falsy values that are not null", () => {
    // `?? undefined` and not `|| undefined`: "" / 0 / false are real inputs.
    // Blanking a text field in an edit form must still clear it.
    const parsed = schema.parse({ notes: "", creditDays: 0, isDefault: false });
    expect(parsed.notes).toBe("");
    expect(parsed.creditDays).toBe(0);
    expect(parsed.isDefault).toBe(false);
  });

  it("still enforces the wrapped schema", () => {
    expect(schema.safeParse({ creditDays: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ notes: 42 }).success).toBe(false);
    expect(schema.safeParse({ status: "C" }).success).toBe(false);
  });

  it("composes with .partial().strict(), the way update schemas are derived", () => {
    const base = z.object({ name: z.string().min(1), code: optional(z.string()) });
    const update = base.partial().strict();
    expect(update.parse({ code: null })).toEqual({});
    expect(update.safeParse({ unknownKey: 1 }).success).toBe(false);
  });
});

/**
 * The bug this guards against: every GET serialises an unset column as
 * `null`, so clients hand `null` back on write. A bare `.optional()`
 * rejects that with an opaque `400 Validation failed` — creating an
 * invoice for a customer with no shipping address on file was impossible.
 *
 * Fixing the 47 route files only helps until the next route is written, so
 * the rule is enforced here rather than remembered.
 */
describe("no API route uses a null-intolerant .optional()", () => {
  const API_ROOT = join(process.cwd(), "src/app/api");

  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...tsFiles(full));
      else if (entry.endsWith(".ts")) out.push(full);
    }
    return out;
  }

  const files = tsFiles(API_ROOT);

  it("found the route tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no bare .optional() outside an explicitly .nullable() chain", () => {
    const violations: string[] = [];

    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes(".optional()")) return;
        // `.nullable()` anywhere in the chain is a deliberate opt-in: null
        // reaches the database and clears the column.
        if (line.includes(".nullable()")) return;
        // Chains split across lines — look back for the .nullable().
        if (
          line.trim().startsWith(".optional()") &&
          lines.slice(Math.max(0, i - 3), i).some((l) => l.includes(".nullable()"))
        ) {
          return;
        }
        violations.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}  ${line.trim()}`);
      });
    }

    expect(
      violations,
      `Use optional(z.string()) from @/backend/validators/common instead of ` +
        `z.string().optional(), or add an explicit .nullable() if null should ` +
        `clear the stored value:\n${violations.join("\n")}`
    ).toEqual([]);
  });
});

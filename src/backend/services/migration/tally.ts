import { XMLParser } from "fast-xml-parser";
import { D } from "@/backend/utils/money";
import type { Tx } from "@/backend/utils/posting";

/**
 * Tally XML migration importer.
 *
 * Tally exports all-masters as an XML file with the structure:
 *
 *   <ENVELOPE>
 *     <BODY>
 *       <DATA>
 *         <TALLYMESSAGE>
 *           <GROUP NAME="...">...</GROUP>
 *           <LEDGER NAME="...">...</LEDGER>
 *           <STOCKITEM NAME="...">...</STOCKITEM>
 *           ...
 *         </TALLYMESSAGE>
 *       </DATA>
 *     </BODY>
 *   </ENVELOPE>
 *
 * This service parses that and creates LedgerGroup / Ledger / Party / Item
 * records under a target organization. Idempotent — re-running with the
 * same XML upserts (matched by name).
 *
 * NOT YET IMPORTED (separate follow-ups):
 *   - VOUCHER messages (sales / purchase / payment / receipt entries).
 *     Mapping voucher narrations and party-bill references is non-trivial.
 *   - UNIT masters (UoM) — currently skipped; items get default unit.
 *   - STOCKGROUP — children flatten into a single category.
 *   - Tally's bill-wise outstanding details (BILLALLOCATIONS).
 *   - GST registration types and addresses on parties.
 */

export type TallyImportResult = {
  groups: { created: number; skipped: number; errors: string[] };
  ledgers: { created: number; skipped: number; errors: string[] };
  parties: { created: number; skipped: number; errors: string[] };
  items: { created: number; skipped: number; errors: string[] };
};

type RawGroup = {
  "@_NAME"?: string;
  PARENT?: string;
  NATURE?: string;
  ISSUBLEDGER?: string;
};

type RawLedger = {
  "@_NAME"?: string;
  PARENT?: string;
  OPENINGBALANCE?: string | number;
  BILLCREDITPERIOD?: string;
  CREDITLIMIT?: string | number;
  GSTREGISTRATIONTYPE?: string;
  PARTYGSTIN?: string;
  LEDGSTIN?: string;
  PINCODE?: string;
  COUNTRYNAME?: string;
  STATENAME?: string;
  EMAIL?: string;
  PHONENO?: string;
  ADDRESS?: { ADDRESSLINE?: string | string[] } | string;
};

type RawStockItem = {
  "@_NAME"?: string;
  PARENT?: string;
  BASEUNITS?: string;
  GSTAPPLICABLE?: string;
  HSNCODE?: string;
  GSTRATEDETAILS?: { GSTRATE?: string | number } | string;
  COSTINGMETHOD?: string;
  OPENINGBALANCE?: string | number;
  OPENINGRATE?: string | number;
  OPENINGVALUE?: string | number;
};

type ParsedTallyData = {
  groups: RawGroup[];
  ledgers: RawLedger[];
  stockItems: RawStockItem[];
};

/**
 * Parse a Tally All-Masters XML string into a normalized shape.
 * Robust to single-vs-array elements (Tally emits a single child as an
 * object, multiple as an array — `fast-xml-parser` reflects that, so we
 * coerce to array everywhere).
 */
export function parseTallyXml(xml: string): ParsedTallyData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml);

  const messages = pickAll(parsed, ["ENVELOPE", "BODY", "DATA", "TALLYMESSAGE"]);
  const groups: RawGroup[] = [];
  const ledgers: RawLedger[] = [];
  const stockItems: RawStockItem[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    if (m.GROUP) groups.push(...toArray<RawGroup>(m.GROUP));
    if (m.LEDGER) ledgers.push(...toArray<RawLedger>(m.LEDGER));
    if (m.STOCKITEM) stockItems.push(...toArray<RawStockItem>(m.STOCKITEM));
  }

  return { groups, ledgers, stockItems };
}

function toArray<T>(v: unknown): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? (v as T[]) : [v as T];
}

function pickAll(obj: unknown, path: string[]): unknown[] {
  let cur: unknown = obj;
  for (const segment of path) {
    if (!cur || typeof cur !== "object") return [];
    const next = (cur as Record<string, unknown>)[segment];
    if (Array.isArray(next)) {
      // Flatten and continue down each branch.
      const rest = path.slice(path.indexOf(segment) + 1);
      return next.flatMap((n) => pickAll(n, rest));
    }
    cur = next;
  }
  if (cur === undefined || cur === null) return [];
  return Array.isArray(cur) ? cur : [cur];
}

/**
 * Map Tally NATURE → our schema's nature enum.
 * Tally uses uppercase already; passes through with safety.
 */
function normalizeNature(nature: string | undefined): string | null {
  if (!nature) return null;
  const upper = nature.trim().toUpperCase();
  if (["ASSETS", "LIABILITIES", "INCOME", "EXPENSES", "EQUITY"].includes(upper)) {
    return upper;
  }
  return null;
}

/**
 * Heuristic: a Tally LEDGER under group "Sundry Debtors" / "Sundry Creditors"
 * (or any descendant with `partyType` known) is a party. Everything else is a
 * plain ledger account.
 */
const PARTY_GROUPS = new Set(["Sundry Debtors", "Sundry Creditors"]);

export type TallyImportOptions = {
  organizationId: string;
};

/**
 * Apply parsed Tally data to the database under the given organization.
 * All inserts run inside the caller's transaction so a partial failure
 * rolls back cleanly.
 */
export async function importTallyData(
  tx: Tx,
  data: ParsedTallyData,
  opts: TallyImportOptions
): Promise<TallyImportResult> {
  const { organizationId } = opts;
  const result: TallyImportResult = {
    groups: { created: 0, skipped: 0, errors: [] },
    ledgers: { created: 0, skipped: 0, errors: [] },
    parties: { created: 0, skipped: 0, errors: [] },
    items: { created: 0, skipped: 0, errors: [] },
  };

  // --- 1. LEDGER GROUPS ---
  // Two-pass: first create all groups without parent, then attach parents.
  // Avoids the "parent doesn't exist yet" ordering problem when Tally lists
  // children before parents.
  const existingGroups = await tx.ledgerGroup.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  const groupIdByName = new Map(existingGroups.map((g) => [g.name, g.id]));

  for (const g of data.groups) {
    const name = g["@_NAME"]?.trim();
    if (!name) {
      result.groups.errors.push("Group with no NAME — skipped");
      continue;
    }
    if (groupIdByName.has(name)) {
      result.groups.skipped++;
      continue;
    }
    try {
      const created = await tx.ledgerGroup.create({
        data: {
          organizationId,
          name,
          nature: normalizeNature(g.NATURE) ?? "ASSETS", // best-guess fallback
          isSystem: false,
        },
        select: { id: true },
      });
      groupIdByName.set(name, created.id);
      result.groups.created++;
    } catch (e) {
      result.groups.errors.push(`Group "${name}": ${(e as Error).message}`);
    }
  }

  // Second pass: attach parents.
  for (const g of data.groups) {
    const name = g["@_NAME"]?.trim();
    if (!name || !g.PARENT) continue;
    const childId = groupIdByName.get(name);
    const parentId = groupIdByName.get(g.PARENT.trim());
    if (childId && parentId && childId !== parentId) {
      try {
        await tx.ledgerGroup.update({
          where: { id: childId },
          data: { parentId },
        });
      } catch (e) {
        result.groups.errors.push(`Group "${name}" parent attach: ${(e as Error).message}`);
      }
    }
  }

  // --- 2. LEDGERS / PARTIES ---
  const existingLedgers = await tx.ledger.findMany({
    where: { organizationId },
    select: { name: true },
  });
  const ledgerNameSet = new Set(existingLedgers.map((l) => l.name));

  const existingParties = await tx.party.findMany({
    where: { organizationId },
    select: { name: true },
  });
  const partyNameSet = new Set(existingParties.map((p) => p.name));

  for (const l of data.ledgers) {
    const name = l["@_NAME"]?.trim();
    if (!name) {
      result.ledgers.errors.push("Ledger with no NAME — skipped");
      continue;
    }
    const parentName = l.PARENT?.trim();
    const isParty = parentName ? PARTY_GROUPS.has(parentName) : false;

    // Treat as party when under a debtor/creditor group; otherwise as ledger.
    if (isParty) {
      if (partyNameSet.has(name)) {
        result.parties.skipped++;
        continue;
      }
      try {
        const partyType =
          parentName === "Sundry Debtors" ? "CUSTOMER" :
          parentName === "Sundry Creditors" ? "VENDOR" : "BOTH";
        await tx.party.create({
          data: {
            organizationId,
            name,
            type: partyType,
            gstNo: l.PARTYGSTIN?.trim() || l.LEDGSTIN?.trim() || null,
            email: l.EMAIL?.trim() || null,
            phone: l.PHONENO?.trim() || null,
            billingAddress: extractAddress(l.ADDRESS),
            billingState: l.STATENAME?.trim() || null,
            billingPostal: l.PINCODE?.trim() || null,
            billingCountry: l.COUNTRYNAME?.trim() || "IN",
            creditDays: parseIntSafe(l.BILLCREDITPERIOD),
            creditLimit: l.CREDITLIMIT ? D(l.CREDITLIMIT) : null,
            gstRegistrationType: l.GSTREGISTRATIONTYPE?.trim() || null,
          },
        });
        partyNameSet.add(name);
        result.parties.created++;
      } catch (e) {
        result.parties.errors.push(`Party "${name}": ${(e as Error).message}`);
      }
    } else {
      if (ledgerNameSet.has(name)) {
        result.ledgers.skipped++;
        continue;
      }
      // Resolve the parent group; fall back to "Suspense Account" group if
      // the ledger has a parent we don't recognize. Real migrations should
      // have all parent groups present from step 1.
      const groupId =
        (parentName ? groupIdByName.get(parentName) : null) ??
        groupIdByName.get("Suspense Account") ??
        null;
      if (!groupId) {
        result.ledgers.errors.push(
          `Ledger "${name}": parent group "${parentName ?? "(none)"}" not found and no fallback group available`
        );
        continue;
      }
      try {
        const opening = l.OPENINGBALANCE !== undefined ? D(l.OPENINGBALANCE) : D(0);
        await tx.ledger.create({
          data: {
            organizationId,
            groupId,
            name,
            openingBalance: opening,
            currentBalance: opening,
          },
        });
        ledgerNameSet.add(name);
        result.ledgers.created++;
      } catch (e) {
        result.ledgers.errors.push(`Ledger "${name}": ${(e as Error).message}`);
      }
    }
  }

  // --- 3. STOCK ITEMS ---
  const existingItems = await tx.item.findMany({
    where: { organizationId },
    select: { name: true },
  });
  const itemNameSet = new Set(existingItems.map((i) => i.name));

  // Find the org's default UoM. We pick the first one matching common Tally
  // base units, or fall back to org's first UoM.
  const units = await tx.unitOfMeasure.findMany({ select: { id: true, name: true, symbol: true } });
  const unitByName = new Map<string, string>();
  for (const u of units) {
    if (u.name) unitByName.set(u.name.toUpperCase(), u.id);
    if (u.symbol) unitByName.set(u.symbol.toUpperCase(), u.id);
  }
  const fallbackUnitId = units[0]?.id;

  for (const it of data.stockItems) {
    const name = it["@_NAME"]?.trim();
    if (!name) {
      result.items.errors.push("Stock item with no NAME — skipped");
      continue;
    }
    if (itemNameSet.has(name)) {
      result.items.skipped++;
      continue;
    }
    const baseUnit = it.BASEUNITS?.trim().toUpperCase();
    const primaryUnitId = (baseUnit ? unitByName.get(baseUnit) : null) ?? fallbackUnitId;
    if (!primaryUnitId) {
      result.items.errors.push(`Item "${name}": no UoM available — set up units first`);
      continue;
    }
    try {
      await tx.item.create({
        data: {
          organizationId,
          name,
          primaryUnitId,
          hsnCode: it.HSNCODE?.trim() || null,
          type: "GOODS",
          // Costing method maps closely; default to FIFO if unknown.
          valuationMethod:
            it.COSTINGMETHOD?.toUpperCase().includes("FIFO") ? "FIFO" :
            it.COSTINGMETHOD?.toUpperCase().includes("LIFO") ? "LIFO" :
            "WEIGHTED_AVG",
        },
      });
      itemNameSet.add(name);
      result.items.created++;
    } catch (e) {
      result.items.errors.push(`Item "${name}": ${(e as Error).message}`);
    }
  }

  return result;
}

function extractAddress(addr: RawLedger["ADDRESS"]): string | null {
  if (!addr) return null;
  if (typeof addr === "string") return addr.trim() || null;
  const lines = addr.ADDRESSLINE;
  if (!lines) return null;
  if (Array.isArray(lines)) return lines.filter((l) => l).join(", ").trim() || null;
  return lines.trim() || null;
}

function parseIntSafe(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

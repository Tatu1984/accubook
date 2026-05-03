import { D, sum, type DecimalLike } from "@/backend/utils/money";
import type { Prisma } from "@/generated/prisma";

/**
 * BOM cost computation.
 *
 * Given a BOM (a list of components, each with quantity and unit cost),
 * compute the total material cost per unit of finished good.
 *
 * Pure helper — caller passes in already-loaded data, this just does
 * the Decimal math. Multi-level BOM resolution (component is itself a
 * finished good with its own BOM) is handled by `resolveLeafCost`
 * which the caller can use to flatten before passing in.
 */

export type BomComponent = {
  itemId: string;
  quantity: DecimalLike;
  unitCost: DecimalLike;
};

export type BomCostResult = {
  /** Total cost across all components for the BOM's specified output. */
  totalMaterialCost: Prisma.Decimal;
  /** Cost per unit of finished good (= total / outputQuantity). */
  perUnitCost: Prisma.Decimal;
  /** Per-component breakdown, useful for the BOM cost-card UI. */
  breakdown: Array<{
    itemId: string;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    lineCost: Prisma.Decimal;
  }>;
};

export function computeBomCost(
  components: BomComponent[],
  outputQuantity: DecimalLike
): BomCostResult {
  const out = D(outputQuantity);
  const breakdown = components.map((c) => {
    const qty = D(c.quantity);
    const unitCost = D(c.unitCost);
    return {
      itemId: c.itemId,
      quantity: qty,
      unitCost,
      lineCost: qty.times(unitCost),
    };
  });
  const totalMaterialCost = sum(breakdown.map((b) => b.lineCost));
  const perUnitCost = out.isZero()
    ? D(0)
    : totalMaterialCost.dividedBy(out);
  return { totalMaterialCost, perUnitCost, breakdown };
}

/**
 * Resolve a multi-level BOM to leaf-level component costs.
 *
 * Walks the BOM tree depth-first: if a component item has its own active
 * BOM, recurse into it and replace the component's cost with the BOM's
 * computed per-unit cost.
 *
 * Detects cycles (item A's BOM includes B; B's BOM includes A) and
 * throws — these shouldn't exist but the matcher errs on safety.
 *
 * Caller supplies a `getBomForItem(itemId)` lookup that returns null
 * when the item is a raw material with no further BOM.
 */
export type ResolvedComponent = {
  /** The leaf raw material's item id. */
  itemId: string;
  /** Quantity per unit of the *root* finished good. */
  quantity: Prisma.Decimal;
  /** Per-unit cost of the leaf material. */
  unitCost: Prisma.Decimal;
};

export type BomLookup = (
  itemId: string
) => Promise<{ outputQuantity: DecimalLike; components: BomComponent[] } | null>;

export async function resolveLeafCost(
  itemId: string,
  parentQuantity: DecimalLike,
  parentUnitCost: DecimalLike,
  getBomForItem: BomLookup,
  visited: Set<string> = new Set()
): Promise<ResolvedComponent[]> {
  if (visited.has(itemId)) {
    throw new Error(`Cycle detected in BOM tree at item ${itemId}`);
  }
  const bom = await getBomForItem(itemId);
  if (!bom) {
    return [
      {
        itemId,
        quantity: D(parentQuantity),
        unitCost: D(parentUnitCost),
      },
    ];
  }

  const nextVisited = new Set(visited);
  nextVisited.add(itemId);

  const cost = computeBomCost(bom.components, bom.outputQuantity);
  // For each component of this child BOM, recurse. The quantity at this
  // level is parentQuantity * (component.qty / bom.outputQuantity).
  const out: ResolvedComponent[] = [];
  for (const c of bom.components) {
    const componentQtyPerParent = D(c.quantity)
      .dividedBy(D(bom.outputQuantity))
      .times(D(parentQuantity));
    const subResolved = await resolveLeafCost(
      c.itemId,
      componentQtyPerParent,
      c.unitCost,
      getBomForItem,
      nextVisited
    );
    out.push(...subResolved);
  }
  // Suppress unused-var warning — `cost` is computed for future use
  // (e.g. exposing per-level subtotals); not yet returned.
  void cost;
  return out;
}

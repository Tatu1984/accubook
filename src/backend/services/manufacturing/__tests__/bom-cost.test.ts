import { describe, expect, it } from "vitest";
import { computeBomCost, resolveLeafCost, type BomComponent } from "../bom-cost";

describe("computeBomCost — single-level", () => {
  it("sums component line costs and divides by output quantity", () => {
    // 2 wheels @ ₹500 + 1 frame @ ₹2000 = ₹3000 for 1 bicycle.
    const components: BomComponent[] = [
      { itemId: "wheel", quantity: "2", unitCost: "500" },
      { itemId: "frame", quantity: "1", unitCost: "2000" },
    ];
    const r = computeBomCost(components, 1);
    expect(r.totalMaterialCost.toString()).toBe("3000");
    expect(r.perUnitCost.toString()).toBe("3000");
    expect(r.breakdown).toHaveLength(2);
    expect(r.breakdown[0].lineCost.toString()).toBe("1000");
    expect(r.breakdown[1].lineCost.toString()).toBe("2000");
  });

  it("output quantity > 1 lowers per-unit cost", () => {
    const components: BomComponent[] = [
      { itemId: "ingredient", quantity: "100", unitCost: "10" },
    ];
    // 100 ingredient @ ₹10 = ₹1000 for 50 bottles → ₹20/bottle.
    const r = computeBomCost(components, 50);
    expect(r.perUnitCost.toString()).toBe("20");
  });

  it("zero output yields perUnitCost = 0 (no division by zero)", () => {
    const components: BomComponent[] = [
      { itemId: "anything", quantity: "10", unitCost: "5" },
    ];
    const r = computeBomCost(components, 0);
    expect(r.perUnitCost.toString()).toBe("0");
    expect(r.totalMaterialCost.toString()).toBe("50");
  });

  it("Decimal precision survives 0.1 + 0.2 traps", () => {
    const components: BomComponent[] = [
      { itemId: "a", quantity: "0.1", unitCost: "1" },
      { itemId: "b", quantity: "0.2", unitCost: "1" },
    ];
    const r = computeBomCost(components, 1);
    expect(r.totalMaterialCost.toString()).toBe("0.3");
  });
});

describe("resolveLeafCost — multi-level BOM", () => {
  // Tree:
  //   Bicycle (output: 1)
  //     wheel × 2 (each wheel itself has a BOM)
  //       rim × 1 (raw)
  //       spoke × 24 (raw)
  //     frame × 1 (raw)
  //
  // Expected leaves for 1 bicycle:
  //   rim:   2 (= 2 wheels * 1 rim)
  //   spoke: 48 (= 2 wheels * 24)
  //   frame: 1
  type Bom = { outputQuantity: string; components: BomComponent[] };
  const bomMap: Record<string, Bom> = {
    bicycle: {
      outputQuantity: "1",
      components: [
        { itemId: "wheel", quantity: "2", unitCost: "500" },
        { itemId: "frame", quantity: "1", unitCost: "2000" },
      ],
    },
    wheel: {
      outputQuantity: "1",
      components: [
        { itemId: "rim", quantity: "1", unitCost: "300" },
        { itemId: "spoke", quantity: "24", unitCost: "5" },
      ],
    },
  };
  const lookup = async (itemId: string) => bomMap[itemId] ?? null;

  it("flattens to leaf-level components with correct multiplicities", async () => {
    const leaves = await resolveLeafCost("bicycle", "1", "0", lookup);
    const byId = Object.fromEntries(leaves.map((l) => [l.itemId, l]));
    expect(byId.rim).toBeDefined();
    expect(byId.spoke).toBeDefined();
    expect(byId.frame).toBeDefined();
    expect(byId.rim.quantity.toString()).toBe("2");
    expect(byId.spoke.quantity.toString()).toBe("48");
    expect(byId.frame.quantity.toString()).toBe("1");
  });

  it("propagates unit costs from leaf BOMs", async () => {
    const leaves = await resolveLeafCost("bicycle", "1", "0", lookup);
    const byId = Object.fromEntries(leaves.map((l) => [l.itemId, l]));
    expect(byId.rim.unitCost.toString()).toBe("300");
    expect(byId.spoke.unitCost.toString()).toBe("5");
  });

  it("scaling parent quantity multiplies all leaf quantities", async () => {
    const leaves = await resolveLeafCost("bicycle", "10", "0", lookup);
    const byId = Object.fromEntries(leaves.map((l) => [l.itemId, l]));
    expect(byId.rim.quantity.toString()).toBe("20");
    expect(byId.spoke.quantity.toString()).toBe("480");
  });

  it("detects cycles and throws", async () => {
    const cycleMap: Record<string, Bom> = {
      a: { outputQuantity: "1", components: [{ itemId: "b", quantity: "1", unitCost: "0" }] },
      b: { outputQuantity: "1", components: [{ itemId: "a", quantity: "1", unitCost: "0" }] },
    };
    const cyclicLookup = async (id: string) => cycleMap[id] ?? null;
    await expect(resolveLeafCost("a", "1", "0", cyclicLookup)).rejects.toThrow(/Cycle/);
  });

  it("returns single-element list when item has no BOM (raw material)", async () => {
    const leaves = await resolveLeafCost("rim", "5", "300", async () => null);
    expect(leaves).toHaveLength(1);
    expect(leaves[0].itemId).toBe("rim");
    expect(leaves[0].quantity.toString()).toBe("5");
  });
});

import { describe, expect, it } from "vitest";
import {
  validateMovementWarehouses,
  MOVEMENT_TYPES,
} from "../movement-rules";

/**
 * Regression tests for stock movements that changed the wrong balance.
 *
 * The endpoint only checked that *some* warehouse was supplied. Because the
 * decrement is guarded by `fromWarehouseId` and the increment by
 * `toWarehouseId`, an outbound movement carrying only a destination was
 * accepted and increased stock — a sale that added inventory.
 */

const WH_A = "warehouse-a";
const WH_B = "warehouse-b";

describe("inbound movements", () => {
  it.each(["PURCHASE", "GRN", "RETURN"])(
    "%s requires a destination",
    (type) => {
      expect(validateMovementWarehouses(type, { toWarehouseId: WH_A })).toBeNull();
      expect(validateMovementWarehouses(type, {})).toMatch(/destination/i);
    }
  );

  it.each(["PURCHASE", "GRN", "RETURN"])(
    "%s must not name a source, which would have decremented it",
    (type) => {
      expect(
        validateMovementWarehouses(type, { fromWarehouseId: WH_A })
      ).toMatch(/destination/i);
      expect(
        validateMovementWarehouses(type, {
          fromWarehouseId: WH_A,
          toWarehouseId: WH_B,
        })
      ).toMatch(/must not name a source/i);
    }
  );
});

describe("outbound movements", () => {
  it.each(["SALE", "ISSUE"])("%s requires a source", (type) => {
    expect(validateMovementWarehouses(type, { fromWarehouseId: WH_A })).toBeNull();
    expect(validateMovementWarehouses(type, {})).toMatch(/source/i);
  });

  it.each(["SALE", "ISSUE"])(
    "%s naming only a destination is rejected — this is the bug that added stock on a sale",
    (type) => {
      expect(validateMovementWarehouses(type, { toWarehouseId: WH_A })).toMatch(
        /needs a source warehouse/i
      );
    }
  );

  it.each(["SALE", "ISSUE"])("%s must not name a destination", (type) => {
    expect(
      validateMovementWarehouses(type, {
        fromWarehouseId: WH_A,
        toWarehouseId: WH_B,
      })
    ).toMatch(/must not name a destination/i);
  });
});

describe("transfers", () => {
  it("requires both ends", () => {
    expect(
      validateMovementWarehouses("TRANSFER", {
        fromWarehouseId: WH_A,
        toWarehouseId: WH_B,
      })
    ).toBeNull();
    expect(
      validateMovementWarehouses("TRANSFER", { fromWarehouseId: WH_A })
    ).toMatch(/both/i);
    expect(
      validateMovementWarehouses("TRANSFER", { toWarehouseId: WH_B })
    ).toMatch(/both/i);
  });

  it("rejects a transfer to the same warehouse", () => {
    expect(
      validateMovementWarehouses("TRANSFER", {
        fromWarehouseId: WH_A,
        toWarehouseId: WH_A,
      })
    ).toMatch(/must differ/i);
  });
});

describe("adjustments", () => {
  it("accepts exactly one warehouse, in either direction", () => {
    expect(
      validateMovementWarehouses("ADJUSTMENT", { toWarehouseId: WH_A })
    ).toBeNull();
    expect(
      validateMovementWarehouses("ADJUSTMENT", { fromWarehouseId: WH_A })
    ).toBeNull();
  });

  it("rejects naming neither, which changed nothing at all", () => {
    expect(validateMovementWarehouses("ADJUSTMENT", {})).toMatch(/either/i);
  });

  it("rejects naming both, which is a transfer", () => {
    expect(
      validateMovementWarehouses("ADJUSTMENT", {
        fromWarehouseId: WH_A,
        toWarehouseId: WH_B,
      })
    ).toMatch(/only one warehouse/i);
  });
});

describe("coverage", () => {
  it("has a rule for every movement type the schema allows", () => {
    for (const type of MOVEMENT_TYPES) {
      // Passing no warehouses must produce a complaint about warehouses, not
      // an "unknown movement type" — proving the type is actually mapped.
      expect(validateMovementWarehouses(type, {})).not.toMatch(/unknown/i);
    }
  });

  it("rejects a movement type that is not in the vocabulary", () => {
    expect(validateMovementWarehouses("TELEPORT", {})).toMatch(/unknown/i);
  });
});

/**
 * Which warehouses each kind of stock movement is allowed to name.
 *
 * The stock endpoint only ever checked that *some* warehouse was supplied. That
 * caught a movement which changed nothing, but not a movement which changed the
 * wrong thing: the decrement is guarded by `fromWarehouseId` and the increment
 * by `toWarehouseId`, so `movementType: "SALE"` carrying only a `toWarehouseId`
 * was accepted and *increased* stock. A sale, an issue and an outbound transfer
 * could all silently add inventory.
 *
 * Direction is a property of the movement type, so it belongs in one table
 * rather than being re-derived at each call site.
 */

export type MovementDirection = "IN" | "OUT" | "TRANSFER" | "EITHER";

export const MOVEMENT_TYPES = [
  "PURCHASE",
  "SALE",
  "TRANSFER",
  "ADJUSTMENT",
  "RETURN",
  "GRN",
  "ISSUE",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * RETURN is a customer sending goods back, so it comes in.
 * ADJUSTMENT is the one genuinely bidirectional type — a stock count can
 * correct in either direction — so it accepts exactly one warehouse, whichever
 * side that is.
 */
export const MOVEMENT_DIRECTION: Record<MovementType, MovementDirection> = {
  PURCHASE: "IN",
  GRN: "IN",
  RETURN: "IN",
  SALE: "OUT",
  ISSUE: "OUT",
  TRANSFER: "TRANSFER",
  ADJUSTMENT: "EITHER",
};

export interface MovementWarehouses {
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
}

/**
 * @returns an error message when the combination is invalid, or null when it is
 *          acceptable.
 */
export function validateMovementWarehouses(
  movementType: string,
  { fromWarehouseId, toWarehouseId }: MovementWarehouses
): string | null {
  const direction = MOVEMENT_DIRECTION[movementType as MovementType];
  if (!direction) {
    return `Unknown movement type "${movementType}"`;
  }

  const hasFrom = !!fromWarehouseId;
  const hasTo = !!toWarehouseId;

  switch (direction) {
    case "IN":
      if (!hasTo) {
        return `${movementType} brings goods in and needs a destination warehouse (toWarehouseId)`;
      }
      if (hasFrom) {
        return `${movementType} brings goods in and must not name a source warehouse — use TRANSFER to move stock between warehouses`;
      }
      return null;

    case "OUT":
      if (!hasFrom) {
        return `${movementType} takes goods out and needs a source warehouse (fromWarehouseId)`;
      }
      if (hasTo) {
        return `${movementType} takes goods out and must not name a destination warehouse — use TRANSFER to move stock between warehouses`;
      }
      return null;

    case "TRANSFER":
      if (!hasFrom || !hasTo) {
        return "TRANSFER needs both a source and a destination warehouse";
      }
      if (fromWarehouseId === toWarehouseId) {
        return "TRANSFER source and destination warehouses must differ";
      }
      return null;

    case "EITHER":
      if (!hasFrom && !hasTo) {
        return `${movementType} needs either a source or a destination warehouse`;
      }
      if (hasFrom && hasTo) {
        return `${movementType} must name only one warehouse — use TRANSFER to move stock between warehouses`;
      }
      return null;
  }
}

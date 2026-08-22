"use client";

import * as React from "react";
import { ArrowRight, Truck, AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import { ScrollArea } from "@/frontend/components/ui/scroll-area";
import { cn } from "@/shared/utils/common.util";
import type { DispatchSelection } from "./dispatch-queue";
import type { StockPosition } from "./in-progress-sheet";

interface ConfirmDispatchDialogProps {
  selections: DispatchSelection[] | null;
  positions: StockPosition[];
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** True while the dispatch is being posted. */
  posting?: boolean;
}

/**
 * The last step before goods are declared gone.
 *
 * It shows the effect on all three positions rather than just asking "are you
 * sure", because dispatch is the one action that moves physical stock without
 * touching the books: accounting stays exactly where it is, in-progress clears,
 * and physical falls to meet it. Seeing those three numbers line up is how
 * someone confirms they picked the right thing.
 */
export function ConfirmDispatchDialog({
  selections,
  positions,
  onOpenChange,
  onConfirm,
  posting = false,
}: ConfirmDispatchDialogProps) {
  const open = !!selections && selections.length > 0;

  /** Net effect per item, since one dispatch can span several lines of the same item. */
  const effects = React.useMemo(() => {
    if (!selections) return [];
    const byItem = new Map<
      string,
      { itemId: string; itemName: string; unit: string | null; quantity: number }
    >();
    for (const selection of selections) {
      const existing = byItem.get(selection.itemId);
      if (existing) existing.quantity += selection.quantity;
      else
        byItem.set(selection.itemId, {
          itemId: selection.itemId,
          itemName: selection.itemName,
          unit: selection.unit,
          quantity: selection.quantity,
        });
    }
    return [...byItem.values()].map((entry) => {
      const position = positions.find((p) => p.itemId === entry.itemId);
      const physical = position?.physical ?? 0;
      const inProgress = position?.inProgress ?? 0;
      return {
        ...entry,
        physicalBefore: physical,
        physicalAfter: physical - entry.quantity,
        inProgressBefore: inProgress,
        inProgressAfter: Math.max(0, inProgress - entry.quantity),
        accounting: position?.accounting ?? 0,
      };
    });
  }, [selections, positions]);

  const shortfalls = (selections ?? []).filter((s) => s.quantity > s.onHand);
  const invoiceCount = new Set((selections ?? []).map((s) => s.invoiceId)).size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Confirm physical dispatch
          </DialogTitle>
          <DialogDescription>
            {selections?.length} line{selections?.length === 1 ? "" : "s"} across{" "}
            {invoiceCount} invoice{invoiceCount === 1 ? "" : "s"} are about to be
            recorded as having physically left the warehouse.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[45vh] pr-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">
                Going out
              </h4>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">Invoice</th>
                      <th className="px-3 py-2 text-left font-medium">From</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selections ?? []).map((selection) => (
                      <tr key={selection.lineId} className="border-t">
                        <td className="px-3 py-2">
                          <span className="font-medium">{selection.itemName}</span>
                          {selection.quantity < selection.pendingQty && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              partial
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {selection.invoiceNumber}
                          <span className="block text-xs">{selection.partyName}</span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {selection.warehouseName}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {selection.quantity} {selection.unit ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">
                Effect on stock
              </h4>
              <div className="space-y-2">
                {effects.map((effect) => (
                  <div
                    key={effect.itemId}
                    className="rounded-md border p-3 text-sm"
                  >
                    <p className="mb-2 font-medium">{effect.itemName}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Physical</p>
                        <p className="flex items-center gap-1.5 tabular-nums">
                          {effect.physicalBefore}
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-semibold">
                            {effect.physicalAfter}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">In progress</p>
                        <p className="flex items-center gap-1.5 tabular-nums">
                          {effect.inProgressBefore}
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-semibold text-amber-600">
                            {effect.inProgressAfter}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Accounting</p>
                        <p className="tabular-nums">
                          {effect.accounting}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            unchanged
                          </span>
                        </p>
                      </div>
                    </div>
                    {effect.inProgressAfter === 0 &&
                      effect.physicalAfter === effect.accounting && (
                        <p className="mt-2 text-xs text-emerald-600">
                          Physical and accounting stock will match after this.
                        </p>
                      )}
                  </div>
                ))}
              </div>
            </div>

            {shortfalls.length > 0 && (
              <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-300">
                    More is being shipped than the shelf holds
                  </p>
                  <ul className="mt-1 space-y-0.5 text-red-700 dark:text-red-400">
                    {shortfalls.map((s) => (
                      <li key={s.lineId}>
                        {s.itemName}: picking {s.quantity} from{" "}
                        {s.warehouseName}, which holds {s.onHand}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-2 rounded-md border bg-muted/50 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            This records the goods as physically gone. The sale was already on
            the books when the invoice was issued, so no ledger entry changes —
            only the stock position moves.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={posting}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={posting}
            className={cn(shortfalls.length > 0 && "bg-red-600 hover:bg-red-700")}
          >
            {posting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Truck className="mr-2 h-4 w-4" />
            )}
            Post dispatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

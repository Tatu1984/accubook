"use client";

import * as React from "react";
import {
  Loader2,
  PackageCheck,
  AlertTriangle,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { cn } from "@/shared/utils/common.util";

export interface DispatchPlanLine {
  itemId: string;
  itemName: string;
  sku: string | null;
  unit: string | null;
  quantity: number;
  warehouseId: string;
  warehouseName: string;
  onHand: number;
}

export interface DispatchPlan {
  invoiceId: string;
  invoiceNumber: string;
  partyName: string;
  invoiceDate: string;
  lines: DispatchPlanLine[];
  units: number;
  shortfalls: {
    itemId: string;
    itemName: string;
    unit: string | null;
    pending: number;
    available: number;
  }[];
}

interface CompleteInvoiceDialogProps {
  /** Invoice being marked complete; null closes the dialog. */
  invoiceId: string | null;
  organizationId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Called after the goods have posted, so the caller can refresh its data. */
  onCompleted: () => void | Promise<void>;
}

/**
 * "This order has left the building."
 *
 * The warehouse manager's one-click close-out for an invoice: every line still
 * pending goes out at once, and physical stock drops to meet the accounting
 * position that has been sitting there since the invoice was raised.
 *
 * The allocation shown is the server's own plan (`preview: true`), not a second
 * guess computed here — what you confirm is what posts. Where the shelves
 * cannot cover a line the dialog refuses to post at all: a partly-shipped
 * invoice is not complete, and belongs in the dispatch queue where a picked
 * quantity can be entered per line.
 */
export function CompleteInvoiceDialog({
  invoiceId,
  organizationId,
  onOpenChange,
  onCompleted,
}: CompleteInvoiceDialogProps) {
  const [plan, setPlan] = React.useState<DispatchPlan | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [posting, setPosting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!invoiceId || !organizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPlan(null);
      try {
        const response = await fetch(
          `/api/organizations/${organizationId}/stock/dispatch/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invoiceId, preview: true }),
          }
        );
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) throw new Error(body.error || "Failed to plan this dispatch");
        setPlan(body.plan as DispatchPlan);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, organizationId]);

  const blocked = (plan?.shortfalls.length ?? 0) > 0;

  const confirm = async () => {
    if (!invoiceId || !organizationId || blocked) return;
    setPosting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/stock/dispatch/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId }),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Failed to complete this invoice");
      onOpenChange(false);
      await onCompleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  /** Several lines can leave the same warehouse; group so the picker reads one shelf at a time. */
  const byWarehouse = React.useMemo(() => {
    const groups = new Map<string, { name: string; lines: DispatchPlanLine[] }>();
    for (const line of plan?.lines ?? []) {
      const group = groups.get(line.warehouseId) ?? {
        name: line.warehouseName,
        lines: [],
      };
      group.lines.push(line);
      groups.set(line.warehouseId, group);
    }
    return [...groups.values()];
  }, [plan]);

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => !posting && onOpenChange(open)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {plan ? `Mark ${plan.invoiceNumber} complete` : "Mark invoice complete"}
          </DialogTitle>
          <DialogDescription>
            {plan
              ? `Everything still pending on ${plan.partyName}'s order leaves the warehouse now. Physical stock drops by ${plan.units} unit${plan.units === 1 ? "" : "s"}; the books are unchanged — the sale was booked when the invoice was raised.`
              : "Checking what is still pending on this invoice…"}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && plan && (
          <div className="space-y-3">
            {blocked && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Not enough stock to complete this invoice
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {plan.shortfalls.map((s) => (
                    <li key={s.itemId}>
                      {s.itemName}: {s.pending} {s.unit ?? "units"} pending,{" "}
                      {s.available} on hand
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  Receive the missing stock, or ship what you have line by line
                  from the dispatch queue.
                </p>
              </div>
            )}

            <div className="max-h-64 space-y-3 overflow-y-auto">
              {byWarehouse.map((group) => (
                <div key={group.name} className="rounded-lg border">
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium">
                    <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Leaving {group.name}
                  </div>
                  <div className="divide-y">
                    {group.lines.map((line) => (
                      <div
                        key={`${line.itemId}-${line.warehouseId}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{line.itemName}</p>
                          {line.sku && (
                            <p className="text-xs text-muted-foreground">{line.sku}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums">
                            {line.quantity}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              {line.unit ?? ""}
                            </span>
                          </p>
                          <p
                            className={cn(
                              "text-[11px] tabular-nums text-muted-foreground",
                              line.quantity > line.onHand && "text-red-600"
                            )}
                          >
                            {line.onHand} on hand → {line.onHand - line.quantity}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {!blocked && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <PackageCheck className="h-4 w-4 shrink-0" />
                <span>
                  This invoice drops off the in-progress list and its{" "}
                  {plan.units} unit{plan.units === 1 ? "" : "s"} stop counting
                  against physical stock.
                </span>
                <Badge variant="secondary" className="ml-auto shrink-0">
                  {plan.lines.length} line{plan.lines.length === 1 ? "" : "s"}
                </Badge>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={posting}
          >
            Cancel
          </Button>
          <Button onClick={confirm} disabled={posting || loading || blocked || !plan}>
            {posting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Posting…
              </>
            ) : (
              <>
                <PackageCheck className="mr-2 h-4 w-4" />
                Confirm goods have left
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

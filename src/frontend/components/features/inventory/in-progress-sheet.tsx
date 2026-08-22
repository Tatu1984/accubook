"use client";

import * as React from "react";
import { Truck, FileText, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/frontend/components/ui/sheet";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import { ScrollArea } from "@/frontend/components/ui/scroll-area";
import { StockSplitBar } from "./stock-split-bar";
import { cn } from "@/shared/utils/common.util";

export interface PendingDispatchLine {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  partyName: string;
  lineId: string;
  itemId: string;
  itemName: string;
  sku: string | null;
  unit: string | null;
  invoicedQty: number;
  dispatchedQty: number;
  pendingQty: number;
}

export interface StockPosition {
  itemId: string;
  itemName: string;
  sku: string | null;
  unit: string | null;
  category: string | null;
  reorderLevel: number | null;
  /** What a shelf count finds, summed across warehouses. */
  physical: number;
  /** Invoiced to a customer, still physically held. */
  inProgress: number;
  /** physical − inProgress. Negative means oversold. */
  accounting: number;
  stockValue: number;
  openInvoices: number;
  warehouses: { warehouseId: string; warehouseName: string; quantity: number }[];
}

interface InProgressSheetProps {
  position: StockPosition | null;
  lines: PendingDispatchLine[];
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the dispatch queue focused on this invoice. */
  onGoToDispatch: (invoiceId: string) => void;
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/**
 * The invoices behind one item's in-progress quantity.
 *
 * Slides over the stock table rather than replacing it, so the table stays put
 * and several items can be checked in sequence without losing your place.
 *
 * Confirming a dispatch is deliberately not done from here: this panel answers
 * "what is this number made of", and the act of shipping belongs with the
 * warehouse's pick list, where a source warehouse and a picked quantity get
 * chosen. Each row therefore hands off to the dispatch queue instead.
 */
export function InProgressSheet({
  position,
  lines,
  loading,
  onOpenChange,
  onGoToDispatch,
}: InProgressSheetProps) {
  const totalPending = lines.reduce((sum, l) => sum + l.pendingQty, 0);
  const oldest = lines.reduce(
    (max, l) => Math.max(max, daysSince(l.invoiceDate)),
    0
  );

  return (
    <Sheet open={!!position} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {position?.itemName}
            <Badge variant="secondary">In progress</Badge>
          </SheetTitle>
          <SheetDescription>
            {position?.sku ? `SKU ${position.sku} — ` : ""}
            invoiced to customers and still sitting in the warehouse
          </SheetDescription>
        </SheetHeader>

        {position && (
          <div className="px-4 pb-2">
            <div className="rounded-lg border p-3 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Accounting</p>
                  <p
                    className={cn(
                      "text-lg font-semibold tabular-nums",
                      position.accounting < 0 && "text-red-600"
                    )}
                  >
                    {position.accounting}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">In progress</p>
                  <p className="text-lg font-semibold tabular-nums text-amber-600">
                    {position.inProgress}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Physical</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {position.physical}
                  </p>
                </div>
              </div>
              <StockSplitBar
                accounting={position.accounting}
                inProgress={position.inProgress}
                physical={position.physical}
              />
              <p className="text-xs text-muted-foreground">
                Once these {totalPending} {position.unit ?? "units"} physically
                leave, physical drops to {position.accounting} and matches the
                books.
              </p>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 px-4">
          {loading ? (
            <div className="space-y-2 py-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Truck className="mb-3 h-10 w-10 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                Nothing awaiting dispatch for this item
              </p>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {lines.length} line{lines.length === 1 ? "" : "s"} across{" "}
                  {new Set(lines.map((l) => l.invoiceId)).size} invoice
                  {new Set(lines.map((l) => l.invoiceId)).size === 1 ? "" : "s"}
                </span>
                {oldest > 0 && <span>oldest {oldest}d</span>}
              </div>

              {lines.map((line) => {
                const age = daysSince(line.invoiceDate);
                const partial = line.dispatchedQty > 0;
                return (
                  <button
                    key={line.lineId}
                    type="button"
                    onClick={() => onGoToDispatch(line.invoiceId)}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">
                            {line.invoiceNumber}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {line.status}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {line.partyName}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(line.invoiceDate).toLocaleDateString("en-IN")}
                          {age > 0 && ` · ${age}d ago`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-semibold tabular-nums text-amber-600">
                          {line.pendingQty}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {line.unit ?? ""}
                          </span>
                        </p>
                        {partial && (
                          <p className="text-[11px] text-muted-foreground">
                            {line.dispatchedQty} of {line.invoicedQty} shipped
                          </p>
                        )}
                        <span className="mt-1 inline-flex items-center text-[11px] text-muted-foreground">
                          Dispatch <ArrowRight className="ml-0.5 h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

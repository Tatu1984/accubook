"use client";

import * as React from "react";
import {
  Truck,
  PackageCheck,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
  Eye,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import { Checkbox } from "@/frontend/components/ui/checkbox";
import { Input } from "@/frontend/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { cn } from "@/shared/utils/common.util";
import type { PendingDispatchLine } from "./in-progress-sheet";

export interface DispatchInvoice {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  partyName: string;
  lines: PendingDispatchLine[];
}

export interface WarehouseAvailability {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

/** What the warehouse says is physically leaving. */
export interface DispatchSelection {
  lineId: string;
  itemId: string;
  itemName: string;
  invoiceId: string;
  invoiceNumber: string;
  partyName: string;
  unit: string | null;
  quantity: number;
  warehouseId: string;
  warehouseName: string;
  pendingQty: number;
  onHand: number;
}

interface DispatchQueueProps {
  invoices: DispatchInvoice[];
  availability: Record<string, WarehouseAvailability[]>;
  loading: boolean;
  /** Invoice to auto-expand and scroll to, set when arriving from the stock table. */
  focusInvoiceId: string | null;
  onConfirm: (selections: DispatchSelection[]) => void;
  /** Pops the invoice open over the queue, so the pick list stays put. */
  onViewInvoice: (invoiceId: string) => void;
  /** The whole order has left: ship every remaining line and close the invoice out. */
  onMarkComplete: (invoiceId: string) => void;
}

interface LineState {
  selected: boolean;
  quantity: string;
  warehouseId: string;
}

function daysSince(dateStr: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  );
}

/**
 * The warehouse's worklist: what has been sold and still has to physically go
 * out, ordered oldest first.
 *
 * Grouped by invoice rather than by item because that is the unit of work — a
 * picker walks the shelves for one customer's order, not for one SKU across
 * every order.
 *
 * Each line carries its own source warehouse because no sales document records
 * one: `Invoice`, `InvoiceItem` and `SalesOrder` have no warehouse column, so
 * where the goods leave from is genuinely decided here, at picking time, and
 * has to be captured as part of confirming.
 */
export function DispatchQueue({
  invoices,
  availability,
  loading,
  focusInvoiceId,
  onConfirm,
  onViewInvoice,
  onMarkComplete,
}: DispatchQueueProps) {
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [lineState, setLineState] = React.useState<Record<string, LineState>>({});

  /** Default each line to its full pending quantity, from the warehouse holding most. */
  const stateFor = React.useCallback(
    (line: PendingDispatchLine): LineState => {
      const existing = lineState[line.lineId];
      if (existing) return existing;
      const stores = [...(availability[line.itemId] ?? [])].sort(
        (a, b) => b.quantity - a.quantity
      );
      return {
        selected: false,
        quantity: String(line.pendingQty),
        warehouseId: stores[0]?.warehouseId ?? "",
      };
    },
    [lineState, availability]
  );

  const updateLine = (lineId: string, patch: Partial<LineState>, line: PendingDispatchLine) =>
    setLineState((prev) => ({
      ...prev,
      [lineId]: { ...stateFor(line), ...prev[lineId], ...patch },
    }));

  // Arriving from an item's in-progress panel: open that invoice, closed others.
  React.useEffect(() => {
    if (focusInvoiceId) {
      setExpanded((prev) => ({ ...prev, [focusInvoiceId]: true }));
      const node = document.getElementById(`dispatch-${focusInvoiceId}`);
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusInvoiceId]);

  const visible = React.useMemo(() => {
    if (!search.trim()) return invoices;
    const needle = search.toLowerCase();
    return invoices.filter(
      (invoice) =>
        invoice.invoiceNumber.toLowerCase().includes(needle) ||
        invoice.partyName.toLowerCase().includes(needle) ||
        invoice.lines.some((l) => l.itemName.toLowerCase().includes(needle))
    );
  }, [invoices, search]);

  const buildSelection = React.useCallback(
    (line: PendingDispatchLine, invoice: DispatchInvoice): DispatchSelection | null => {
      const state = stateFor(line);
      const quantity = Number(state.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      const store = (availability[line.itemId] ?? []).find(
        (w) => w.warehouseId === state.warehouseId
      );
      return {
        lineId: line.lineId,
        itemId: line.itemId,
        itemName: line.itemName,
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        partyName: invoice.partyName,
        unit: line.unit,
        quantity: Math.min(quantity, line.pendingQty),
        warehouseId: state.warehouseId,
        warehouseName: store?.warehouseName ?? "—",
        pendingQty: line.pendingQty,
        onHand: store?.quantity ?? 0,
      };
    },
    [stateFor, availability]
  );

  const selectedCount = Object.values(lineState).filter((s) => s.selected).length;

  const confirmSelected = () => {
    const picked: DispatchSelection[] = [];
    for (const invoice of invoices) {
      for (const line of invoice.lines) {
        if (!lineState[line.lineId]?.selected) continue;
        const selection = buildSelection(line, invoice);
        if (selection) picked.push(selection);
      }
    }
    onConfirm(picked);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <PackageCheck className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium">Nothing awaiting dispatch</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Every issued invoice has physically shipped — physical stock matches
            the accounting position.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice, customer or item…"
            className="w-[280px] pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {selectedCount > 0 && (
          <Button onClick={confirmSelected}>
            <Truck className="mr-2 h-4 w-4" />
            Confirm dispatch of {selectedCount} line
            {selectedCount === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      {visible.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No pending dispatches match that search.
        </p>
      )}

      {visible.map((invoice) => {
        const isOpen = expanded[invoice.invoiceId] ?? true;
        const age = daysSince(invoice.invoiceDate);
        const totalPending = invoice.lines.reduce((s, l) => s + l.pendingQty, 0);

        return (
          <Card key={invoice.invoiceId} id={`dispatch-${invoice.invoiceId}`}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-6 w-6 shrink-0"
                    aria-label={isOpen ? "Collapse invoice" : "Expand invoice"}
                    aria-expanded={isOpen}
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [invoice.invoiceId]: !isOpen,
                      }))
                    }
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {invoice.invoiceNumber}
                      <Badge variant="outline" className="text-[10px]">
                        {invoice.status}
                      </Badge>
                      {age >= 7 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {age}d waiting
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {invoice.partyName} ·{" "}
                      {new Date(invoice.invoiceDate).toLocaleDateString("en-IN")} ·{" "}
                      {invoice.lines.length} line
                      {invoice.lines.length === 1 ? "" : "s"}, {totalPending} units
                      pending
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewInvoice(invoice.invoiceId)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View invoice
                  </Button>
                  <Button size="sm" onClick={() => onMarkComplete(invoice.invoiceId)}>
                    <PackageCheck className="mr-2 h-4 w-4" />
                    Mark complete
                  </Button>
                </div>
              </div>
            </CardHeader>

            {isOpen && (
              <CardContent className="space-y-3 pt-0">
                {invoice.lines.map((line) => {
                  const state = stateFor(line);
                  const stores = availability[line.itemId] ?? [];
                  const chosen = stores.find(
                    (w) => w.warehouseId === state.warehouseId
                  );
                  const picking = Number(state.quantity) || 0;
                  const short = chosen ? picking > chosen.quantity : true;

                  return (
                    <div
                      key={line.lineId}
                      className={cn(
                        "rounded-lg border p-3",
                        state.selected && "border-primary/50 bg-primary/5"
                      )}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <Checkbox
                          className="mt-1"
                          checked={state.selected}
                          aria-label={`Select ${line.itemName} for dispatch`}
                          onCheckedChange={(checked) =>
                            updateLine(line.lineId, { selected: !!checked }, line)
                          }
                        />

                        <div className="min-w-[160px] flex-1">
                          <p className="font-medium">{line.itemName}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.sku ? `${line.sku} · ` : ""}
                            {line.dispatchedQty > 0
                              ? `${line.dispatchedQty} of ${line.invoicedQty} already shipped`
                              : `${line.invoicedQty} invoiced`}
                          </p>
                        </div>

                        <div className="w-[110px]">
                          <label
                            className="text-[11px] text-muted-foreground"
                            htmlFor={`qty-${line.lineId}`}
                          >
                            Picking
                          </label>
                          <div className="flex items-center gap-1">
                            <Input
                              id={`qty-${line.lineId}`}
                              type="number"
                              min="0"
                              max={line.pendingQty}
                              step="any"
                              className="h-8"
                              value={state.quantity}
                              onChange={(e) =>
                                updateLine(
                                  line.lineId,
                                  { quantity: e.target.value },
                                  line
                                )
                              }
                            />
                            <span className="text-xs text-muted-foreground">
                              {line.unit ?? ""}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            of {line.pendingQty} pending
                          </p>
                        </div>

                        <div className="w-[190px]">
                          <label className="text-[11px] text-muted-foreground">
                            Ship from
                          </label>
                          <Select
                            value={state.warehouseId}
                            onValueChange={(value) =>
                              updateLine(
                                line.lineId,
                                { warehouseId: value },
                                line
                              )
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select warehouse" />
                            </SelectTrigger>
                            <SelectContent>
                              {stores.length === 0 ? (
                                <div className="px-2 py-3 text-sm text-muted-foreground">
                                  No stock recorded anywhere
                                </div>
                              ) : (
                                stores.map((store) => (
                                  <SelectItem
                                    key={store.warehouseId}
                                    value={store.warehouseId}
                                  >
                                    {store.warehouseName} ({store.quantity})
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <p
                            className={cn(
                              "mt-0.5 flex items-center gap-1 text-[11px]",
                              short ? "text-red-600" : "text-muted-foreground"
                            )}
                          >
                            {short && <AlertTriangle className="h-3 w-3" />}
                            {chosen
                              ? short
                                ? `only ${chosen.quantity} on hand`
                                : `${chosen.quantity} on hand`
                              : "nothing on hand"}
                          </p>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => {
                            const selection = buildSelection(line, invoice);
                            if (selection) onConfirm([selection]);
                          }}
                        >
                          Confirm
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

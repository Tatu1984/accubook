"use client";

import * as React from "react";
import {
  Loader2,
  Hammer,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Factory,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { Label } from "@/frontend/components/ui/label";
import { Input } from "@/frontend/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
import { useOrganization } from "@/frontend/hooks/use-organization";

const fmtINR = (v: string | number | undefined | null) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
};

type WorkOrder = {
  id: string;
  workOrderNumber: string;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  plannedQuantity: string;
  completedQuantity: string;
  scrapQuantity: string;
  warehouseId: string | null;
  startDate: string | null;
  endDate: string | null;
  item: { id: string; name: string; sku?: string | null };
  bom: { id: string; bomNumber: string };
  warehouse: { id: string; name: string } | null;
};

type ListResp = {
  data: WorkOrder[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

type IssueShortage = {
  itemId: string;
  itemName: string;
  required: string;
  available: string;
};

const STATUS_STYLES: Record<WorkOrder["status"], string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default function WorkOrdersPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [workOrders, setWorkOrders] = React.useState<WorkOrder[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [issueWo, setIssueWo] = React.useState<WorkOrder | null>(null);
  const [completeWo, setCompleteWo] = React.useState<WorkOrder | null>(null);

  const refresh = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/manufacturing/work-orders?limit=50`,
        { cache: "no-store" }
      );
      const body = (await r.json()) as ListResp;
      if (!r.ok) throw new Error("Failed to load work orders");
      setWorkOrders(body.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  if (orgLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!organizationId) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  const counts = {
    draft: workOrders.filter((w) => w.status === "DRAFT").length,
    inProgress: workOrders.filter((w) => w.status === "IN_PROGRESS").length,
    completed: workOrders.filter((w) => w.status === "COMPLETED").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Work Orders</h1>
        <p className="text-muted-foreground">
          Issue raw materials to a WO, then complete it once production is done.
          Both actions post to GL and move stock atomically.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi icon={<Factory className="h-5 w-5" />} label="Draft" value={String(counts.draft)} />
        <Kpi icon={<Hammer className="h-5 w-5 text-amber-600" />} label="In progress" value={String(counts.inProgress)} />
        <Kpi icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} label="Completed" value={String(counts.completed)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent work orders</CardTitle>
          <CardDescription>
            Showing the 50 most recent. Create new WOs from the BOM page; states transition
            DRAFT → IN_PROGRESS (Issue) → COMPLETED (Complete).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <Empty message="Loading…" />}
          {error && <ErrorBanner message={error} />}
          {!loading && !error && workOrders.length === 0 && (
            <Empty message="No work orders yet. Create one against an active BOM." />
          )}
          {!loading && !error && workOrders.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WO #</TableHead>
                    <TableHead>Finished good</TableHead>
                    <TableHead>BOM</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workOrders.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono text-xs">{w.workOrderNumber}</TableCell>
                      <TableCell>{w.item.name}</TableCell>
                      <TableCell className="font-mono text-xs">{w.bom.bomNumber}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {Number(w.plannedQuantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {Number(w.completedQuantity)}
                        {Number(w.scrapQuantity) > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (+{Number(w.scrapQuantity)} scrap)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{w.warehouse?.name ?? "—"}</TableCell>
                      <TableCell>
                        <span className={`inline-block rounded px-2 py-0.5 text-xs ${STATUS_STYLES[w.status]}`}>
                          {w.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {w.status === "DRAFT" && (
                          <Button size="sm" variant="outline" onClick={() => setIssueWo(w)}>
                            <Truck className="mr-1 h-3 w-3" />
                            Issue
                          </Button>
                        )}
                        {w.status === "IN_PROGRESS" && (
                          <Button size="sm" variant="outline" onClick={() => setCompleteWo(w)}>
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Complete
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {issueWo && (
        <IssueDialog
          orgId={organizationId}
          wo={issueWo}
          onClose={() => setIssueWo(null)}
          onDone={() => {
            setIssueWo(null);
            refresh();
          }}
        />
      )}
      {completeWo && (
        <CompleteDialog
          orgId={organizationId}
          wo={completeWo}
          onClose={() => setCompleteWo(null)}
          onDone={() => {
            setCompleteWo(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function IssueDialog({
  orgId,
  wo,
  onClose,
  onDone,
}: {
  orgId: string;
  wo: WorkOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [shortages, setShortages] = React.useState<IssueShortage[]>([]);

  async function submit() {
    setLoading(true);
    setError(null);
    setShortages([]);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/manufacturing/work-orders/${wo.id}/issue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const body = await r.json();
      if (!r.ok) {
        if (Array.isArray(body.details)) {
          setShortages(body.details);
        }
        throw new Error(body.error ?? "Issue failed");
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue materials to {wo.workOrderNumber}</DialogTitle>
          <DialogDescription>
            Decrements the warehouse&apos;s stock for every BOM component scaled to{" "}
            <span className="font-mono">{Number(wo.plannedQuantity)}</span> units of{" "}
            {wo.item.name}, then posts Dr Work in Progress / Cr Stock-in-Hand.
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorBanner message={error} />}
        {shortages.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-900/50 dark:bg-amber-900/20">
            <div className="mb-2 font-medium text-amber-900 dark:text-amber-200">
              Insufficient stock for {shortages.length} component(s):
            </div>
            <ul className="space-y-1 text-amber-900 dark:text-amber-200">
              {shortages.map((s) => (
                <li key={s.itemId}>
                  <span className="font-medium">{s.itemName}</span> — need{" "}
                  <span className="font-mono">{s.required}</span>, have{" "}
                  <span className="font-mono">{s.available}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Issue & Post JV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  orgId,
  wo,
  onClose,
  onDone,
}: {
  orgId: string;
  wo: WorkOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const [completedQuantity, setCompletedQuantity] = React.useState(String(wo.plannedQuantity));
  const [scrapQuantity, setScrapQuantity] = React.useState("0");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ wipValue: string; fgUnitCost: string } | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/manufacturing/work-orders/${wo.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completedQuantity: Number(completedQuantity),
            scrapQuantity: Number(scrapQuantity || "0"),
          }),
        }
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Complete failed");
      setResult({ wipValue: body.wipValue, fgUnitCost: body.fgUnitCost });
      // Auto-close after 1.2s.
      setTimeout(onDone, 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete {wo.workOrderNumber}</DialogTitle>
          <DialogDescription>
            GRNs the finished good with weighted-average cost recompute and posts Dr
            Stock-in-Hand / Cr Work in Progress for the full WIP value.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="completed" className="text-xs">Completed quantity</Label>
            <Input
              id="completed"
              type="number"
              step="any"
              value={completedQuantity}
              onChange={(e) => setCompletedQuantity(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Planned: {Number(wo.plannedQuantity)}
            </p>
          </div>
          <div>
            <Label htmlFor="scrap" className="text-xs">Scrap quantity (absorbed into FG cost)</Label>
            <Input
              id="scrap"
              type="number"
              step="any"
              value={scrapQuantity}
              onChange={(e) => setScrapQuantity(e.target.value)}
            />
          </div>
          {error && <ErrorBanner message={error} />}
          {result && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-900/20">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <span>Completed</span>
              </div>
              <div className="mt-1 text-xs text-emerald-900 dark:text-emerald-200">
                WIP capitalised: {fmtINR(result.wipValue)} · FG unit cost: {fmtINR(result.fgUnitCost)}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !!result}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete & GRN
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Empty({ message }: { message: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{message}</div>;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  );
}

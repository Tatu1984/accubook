"use client";

import * as React from "react";
import {
  Loader2,
  RefreshCcw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  PauseCircle,
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

type Template = {
  id: string;
  partyId: string;
  party: { id: string; name: string };
  frequency: string;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  dueDays: number;
  items: Array<{ itemId: string; quantity: number; unitPrice: number }>;
  isActive: boolean;
  runCount: number;
  lastInvoice: { id: string; invoiceNumber: string; date: string } | null;
};

type Party = { id: string; name: string };

type Item = { id: string; name: string };

type RunResult = {
  ranAt: string;
  considered: number;
  spawned: number;
  skipped: number;
  errors: Array<{ recurringId: string; message: string }>;
  invoices: Array<{
    recurringId: string;
    invoiceId: string;
    invoiceNumber: string;
    partyName: string;
    total: string;
  }>;
};

export default function RecurringInvoicesPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [runResult, setRunResult] = React.useState<RunResult | null>(null);
  const [running, setRunning] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/recurring-invoices`, {
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed to load");
      setTemplates(body.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function runNow() {
    if (!organizationId) return;
    setRunning(true);
    setRunResult(null);
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/recurring-invoices/run`,
        { method: "POST" }
      );
      const body = (await r.json()) as RunResult;
      setRunResult(body);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

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

  const dueNow = templates.filter(
    (t) => t.isActive && new Date(t.nextRunDate) <= new Date()
  ).length;
  const active = templates.filter((t) => t.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recurring Invoices</h1>
          <p className="text-muted-foreground">
            Subscription billing. Each template spawns one invoice per cycle.
            Run-now is manual today; production should hit the runner from a cron.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={runNow} disabled={running} variant="outline">
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Run now
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New template
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi
          icon={<CalendarClock className="h-5 w-5 text-amber-600" />}
          label="Due now"
          value={String(dueNow)}
          hint="Will spawn on the next run"
          tone={dueNow > 0 ? "warning" : undefined}
        />
        <Kpi
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          label="Active templates"
          value={String(active)}
        />
        <Kpi
          icon={<PauseCircle className="h-5 w-5 text-muted-foreground" />}
          label="Inactive"
          value={String(templates.length - active)}
        />
      </div>

      {runResult && <RunResultDisplay result={runResult} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Templates</CardTitle>
          <CardDescription>
            Each row is a saved invoice template. The runner advances{" "}
            <code className="text-xs">nextRunDate</code> by one frequency interval per
            successful spawn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <Empty message="Loading…" />}
          {error && <ErrorBanner message={error} />}
          {!loading && !error && templates.length === 0 && (
            <Empty message="No recurring templates yet. Create one to start auto-spawning invoices each cycle." />
          )}
          {!loading && !error && templates.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Party</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Next run</TableHead>
                    <TableHead>End date</TableHead>
                    <TableHead className="text-right">Spawned</TableHead>
                    <TableHead>Last invoice</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => {
                    const due = t.isActive && new Date(t.nextRunDate) <= new Date();
                    return (
                      <TableRow key={t.id}>
                        <TableCell>{t.party.name}</TableCell>
                        <TableCell className="font-mono text-xs">{t.frequency}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {t.nextRunDate.slice(0, 10)}
                          {due && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              DUE
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {t.endDate ? t.endDate.slice(0, 10) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{t.runCount}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {t.lastInvoice ? t.lastInvoice.invoiceNumber : "—"}
                        </TableCell>
                        <TableCell>
                          {t.isActive ? (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                              active
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              inactive
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreateDialog
          orgId={organizationId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateDialog({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [parties, setParties] = React.useState<Party[]>([]);
  const [items, setItems] = React.useState<Item[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  const [partyId, setPartyId] = React.useState("");
  const [frequency, setFrequency] = React.useState("MONTHLY");
  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState("");
  const [dueDays, setDueDays] = React.useState(15);
  const [itemId, setItemId] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [unitPrice, setUnitPrice] = React.useState(0);
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([
      fetch(`/api/organizations/${orgId}/parties?limit=200`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/organizations/${orgId}/items?limit=200`, { cache: "no-store" }).then((r) => r.json()),
    ]).then(([partiesBody, itemsBody]) => {
      setParties(Array.isArray(partiesBody?.data) ? partiesBody.data : Array.isArray(partiesBody) ? partiesBody : []);
      setItems(Array.isArray(itemsBody?.data) ? itemsBody.data : Array.isArray(itemsBody) ? itemsBody : []);
    });
  }, [orgId]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/organizations/${orgId}/recurring-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
          frequency,
          startDate,
          endDate: endDate || undefined,
          dueDays,
          items: [
            {
              itemId,
              quantity: Number(quantity),
              unitPrice: Number(unitPrice),
              description: description || undefined,
            },
          ],
          isActive: true,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed to create");
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = partyId && itemId && Number(quantity) > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New recurring template</DialogTitle>
          <DialogDescription>
            One line item for now — multi-line templates and tax pickers come next. The
            runner uses the same GST split logic as a one-off invoice POST.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Party</Label>
            <select
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">— select —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Frequency</Label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Due days</Label>
              <Input
                type="number"
                value={dueDays}
                onChange={(e) => setDueDays(Number(e.target.value))}
                min={0}
                max={365}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start date (first run)</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">End date (optional)</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Item</Label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">— select —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Unit price</Label>
              <Input
                type="number"
                step="any"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly retainer — March 2026"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Estimated line total: <span className="font-mono">{fmtINR(quantity * unitPrice)}</span>{" "}
            (excl. GST — the runner applies your org&apos;s normal GST flow).
          </p>
          {error && <ErrorBanner message={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunResultDisplay({ result }: { result: RunResult }) {
  const hasErrors = result.errors.length > 0;
  return (
    <Card
      className={
        hasErrors
          ? "border-amber-200 dark:border-amber-900/50"
          : "border-emerald-200 dark:border-emerald-900/50"
      }
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {hasErrors ? (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          Run summary
        </CardTitle>
        <CardDescription>
          {result.spawned} spawned · {result.skipped} skipped · {result.errors.length} errors out of{" "}
          {result.considered} due — {new Date(result.ranAt).toLocaleString()}
        </CardDescription>
      </CardHeader>
      {(result.invoices.length > 0 || hasErrors) && (
        <CardContent className="space-y-3 pt-0">
          {result.invoices.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Spawned invoices</div>
              <ul className="space-y-1 text-xs">
                {result.invoices.map((inv) => (
                  <li key={inv.invoiceId} className="font-mono">
                    {inv.invoiceNumber} · {inv.partyName} · {fmtINR(inv.total)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasErrors && (
            <div>
              <div className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300">Errors</div>
              <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-200">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Template {e.recurringId.slice(0, 8)}…: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <Card className={tone === "warning" ? "border-amber-200 dark:border-amber-900/50" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-bold">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
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

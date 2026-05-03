"use client";

import * as React from "react";
import { Loader2, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
import { useOrganization } from "@/frontend/hooks/use-organization";

const fmtINR = (v: string | number | undefined) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
};

function defaultPeriod() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to: last };
}

export default function RegistersPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Registers &amp; Statements</h1>
        <p className="text-muted-foreground">
          Sales register, purchase register, and statement of account by party.
        </p>
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales Register</TabsTrigger>
          <TabsTrigger value="purchase">Purchase Register</TabsTrigger>
          <TabsTrigger value="party">Party Statement</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-6">
          <SalesRegister orgId={organizationId} />
        </TabsContent>
        <TabsContent value="purchase" className="mt-6">
          <PurchaseRegister orgId={organizationId} />
        </TabsContent>
        <TabsContent value="party" className="mt-6">
          <PartyStatement orgId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Period controls (shared)
// ============================================================

function PeriodBar({
  from,
  to,
  setFrom,
  setTo,
  onRun,
  loading,
  extra,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  onRun: () => void;
  loading: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 pt-6">
        {extra}
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button onClick={onRun} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Run report
        </Button>
      </CardContent>
    </Card>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <FileText className="mb-3 h-10 w-10" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ============================================================
// Sales Register
// ============================================================

type SalesRegisterRow = {
  invoiceNumber: string;
  date: string;
  type: string;
  partyName: string;
  partyGstin: string | null;
  placeOfSupply: string | null;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
  totalAmount: string;
  status: string;
  amountDue: string;
};
type SalesRegisterResp = {
  rows: SalesRegisterRow[];
  totals: {
    invoiceCount: number;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
    totalTax: string;
    totalValue: string;
    totalDue: string;
  };
};

function SalesRegister({ orgId }: { orgId: string }) {
  const initial = defaultPeriod();
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState(initial.to);
  const [data, setData] = React.useState<SalesRegisterResp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/reports/sales-register?from=${from}&to=${to}`,
        { cache: "no-store" }
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed");
      setData(body);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} loading={loading} />
      {error && <ErrorBanner message={error} />}
      {!error && data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi label="Invoices" value={String(data.totals.invoiceCount)} />
            <Kpi label="Taxable" value={fmtINR(data.totals.taxable)} />
            <Kpi label="Total Tax" value={fmtINR(data.totals.totalTax)} />
            <Kpi label="Total Value" value={fmtINR(data.totals.totalValue)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Invoices in period</CardTitle>
              <CardDescription>Excludes drafts and cancelled.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <EmptyState message="No invoices in this period." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Party</TableHead>
                        <TableHead>POS</TableHead>
                        <TableHead className="text-right">Taxable</TableHead>
                        <TableHead className="text-right">CGST</TableHead>
                        <TableHead className="text-right">SGST</TableHead>
                        <TableHead className="text-right">IGST</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((r) => (
                        <TableRow key={r.invoiceNumber}>
                          <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                          <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                          <TableCell>
                            <div>{r.partyName}</div>
                            {r.partyGstin && <div className="text-xs text-muted-foreground">{r.partyGstin}</div>}
                          </TableCell>
                          <TableCell className="text-xs">{r.placeOfSupply ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtINR(r.taxableValue)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtINR(r.cgst)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtINR(r.sgst)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtINR(r.igst)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{fmtINR(r.totalAmount)}</TableCell>
                          <TableCell className="text-xs">{r.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {loading && !data && <EmptyState message="Computing register…" />}
    </div>
  );
}

// ============================================================
// Purchase Register
// ============================================================

type PurchaseRegisterRow = {
  billNumber: string;
  vendorBillNo: string | null;
  date: string;
  type: string;
  partyName: string;
  partyGstin: string | null;
  placeOfSupply: string | null;
  reverseCharge: boolean;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalAmount: string;
  status: string;
};
type PurchaseRegisterResp = {
  rows: PurchaseRegisterRow[];
  totals: {
    billCount: number;
    taxable: string;
    totalTax: string;
    totalValue: string;
  };
};

function PurchaseRegister({ orgId }: { orgId: string }) {
  const initial = defaultPeriod();
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState(initial.to);
  const [data, setData] = React.useState<PurchaseRegisterResp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/reports/purchase-register?from=${from}&to=${to}`,
        { cache: "no-store" }
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed");
      setData(body);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={run} loading={loading} />
      {error && <ErrorBanner message={error} />}
      {!error && data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi label="Bills" value={String(data.totals.billCount)} />
            <Kpi label="Taxable" value={fmtINR(data.totals.taxable)} />
            <Kpi label="Total Tax" value={fmtINR(data.totals.totalTax)} />
            <Kpi label="Total Value" value={fmtINR(data.totals.totalValue)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Bills in period</CardTitle>
              <CardDescription>Excludes drafts, pending-approval and cancelled.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <EmptyState message="No bills in this period." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Bill #</TableHead>
                        <TableHead>Vendor #</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead className="text-right">Taxable</TableHead>
                        <TableHead className="text-right">CGST</TableHead>
                        <TableHead className="text-right">SGST</TableHead>
                        <TableHead className="text-right">IGST</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>RCM</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((r) => (
                        <TableRow key={r.billNumber}>
                          <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                          <TableCell className="font-mono text-xs">{r.billNumber}</TableCell>
                          <TableCell className="font-mono text-xs">{r.vendorBillNo ?? "—"}</TableCell>
                          <TableCell>
                            <div>{r.partyName}</div>
                            {r.partyGstin && <div className="text-xs text-muted-foreground">{r.partyGstin}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtINR(r.taxableValue)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtINR(r.cgst)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtINR(r.sgst)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtINR(r.igst)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{fmtINR(r.totalAmount)}</TableCell>
                          <TableCell className="text-xs">{r.reverseCharge ? "Y" : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {loading && !data && <EmptyState message="Computing register…" />}
    </div>
  );
}

// ============================================================
// Party Statement
// ============================================================

type StatementEntry = {
  date: string;
  docType: string;
  docNumber: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
  status: string | null;
};
type StatementResp = {
  party: { id: string; name: string; gstin: string | null; type: string };
  openingBalance: string;
  entries: StatementEntry[];
  closingBalance: string;
  totals: { totalDebit: string; totalCredit: string };
};
type Party = { id: string; name: string; type: string };

function PartyStatement({ orgId }: { orgId: string }) {
  const initial = defaultPeriod();
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState(initial.to);
  const [partyId, setPartyId] = React.useState<string>("");
  const [parties, setParties] = React.useState<Party[]>([]);
  const [data, setData] = React.useState<StatementResp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load parties for the dropdown.
  React.useEffect(() => {
    fetch(`/api/organizations/${orgId}/parties?limit=200`)
      .then((r) => r.json())
      .then((b) => {
        const list = (b.data ?? []).map((p: { id: string; name: string; type: string }) => ({
          id: p.id,
          name: p.name,
          type: p.type,
        }));
        setParties(list);
        if (list.length && !partyId) setPartyId(list[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function run() {
    if (!partyId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/reports/party-statement?partyId=${partyId}&from=${from}&to=${to}`,
        { cache: "no-store" }
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed");
      setData(body);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (partyId) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId]);

  const partyPicker = (
    <div className="space-y-1.5">
      <Label htmlFor="party">Party</Label>
      <select
        id="party"
        value={partyId}
        onChange={(e) => setPartyId(e.target.value)}
        className="h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        <option value="">— select —</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.type})
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      <PeriodBar
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onRun={run}
        loading={loading}
        extra={partyPicker}
      />
      {error && <ErrorBanner message={error} />}
      {!error && data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi label="Party" value={data.party.name} />
            <Kpi label="Opening" value={fmtINR(data.openingBalance)} />
            <Kpi label="Closing" value={fmtINR(data.closingBalance)} />
            <Kpi
              label="In-period (Dr / Cr)"
              value={`${fmtINR(data.totals.totalDebit)} / ${fmtINR(data.totals.totalCredit)}`}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Statement of account</CardTitle>
              <CardDescription>
                Running balance from our books&rsquo; perspective. Positive = party owes us
                (customer) or we owe them (vendor).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.entries.length === 0 ? (
                <EmptyState message="No entries in this period." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Doc #</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.entries.map((e, i) => (
                        <TableRow key={`${e.docNumber}-${i}`}>
                          <TableCell className="whitespace-nowrap">{e.date}</TableCell>
                          <TableCell className="text-xs">{e.docType}</TableCell>
                          <TableCell className="font-mono text-xs">{e.docNumber}</TableCell>
                          <TableCell className="text-sm">{e.description}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {Number(e.debit) > 0 ? fmtINR(e.debit) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {Number(e.credit) > 0 ? fmtINR(e.credit) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {fmtINR(e.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {loading && !data && <EmptyState message="Computing statement…" />}
    </div>
  );
}

// ============================================================
// Shared
// ============================================================

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="truncate text-xl font-semibold" title={value}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

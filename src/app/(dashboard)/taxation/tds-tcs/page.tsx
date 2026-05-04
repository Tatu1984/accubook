"use client";

import * as React from "react";
import { Loader2, FileText } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
import { Label } from "@/frontend/components/ui/label";
import { Input } from "@/frontend/components/ui/input";
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

/** Default to the FY containing today, and the quarter today falls in. */
function defaultFyAndQuarter(): { fy: string; quarter: 1 | 2 | 3 | 4 } {
  const now = new Date();
  const m = now.getUTCMonth();      // 0=Jan
  const y = now.getUTCFullYear();
  const fyStart = m >= 3 ? y : y - 1;
  const fy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
  const quarter: 1 | 2 | 3 | 4 =
    m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 && m <= 11 ? 3 : 4;
  return { fy, quarter };
}

type DeductionListItem = {
  id: string;
  section: string;
  ratePercent: string;
  baseAmount: string;
  taxAmount: string;
  rationale: string;
  noPan: boolean;
  deductedAt?: string;
  collectedAt?: string;
  party: { id: string; name: string; panNo: string | null };
};

type Form16AParty = {
  partyId: string;
  partyName: string;
  partyPan: string | null;
  sections: Array<{
    section: string;
    count: number;
    base: string;
    tax: string;
    effectiveRate: string | null;
  }>;
  totals: { count: number; base: string; tax: string };
};

type Form16AResp = {
  fiscalYear: string;
  quarter: number;
  parties: Form16AParty[];
  totals: { parties: number; deductions: number; base: string; tax: string };
};

export default function TDSTCSPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const initial = defaultFyAndQuarter();
  const [fy, setFy] = React.useState(initial.fy);
  const [quarter, setQuarter] = React.useState<1 | 2 | 3 | 4>(initial.quarter);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">TDS / TCS</h1>
          <p className="text-muted-foreground">
            Quarterly Form 16A / 27D and the deduction/collection register.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Period</CardTitle>
          <CardDescription>
            Indian fiscal year (Apr–Mar). Q1 = Apr–Jun · Q2 = Jul–Sep · Q3 = Oct–Dec · Q4 = Jan–Mar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="fy" className="text-xs">FY</Label>
              <Input
                id="fy"
                value={fy}
                onChange={(e) => setFy(e.target.value)}
                placeholder="2025-26"
                className="w-32 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="quarter" className="text-xs">Quarter</Label>
              <select
                id="quarter"
                value={quarter}
                onChange={(e) => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value={1}>Q1 (Apr–Jun)</option>
                <option value={2}>Q2 (Jul–Sep)</option>
                <option value={3}>Q3 (Oct–Dec)</option>
                <option value={4}>Q4 (Jan–Mar)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="tds-list" className="w-full">
        <TabsList>
          <TabsTrigger value="tds-list">TDS Deductions</TabsTrigger>
          <TabsTrigger value="tcs-list">TCS Collections</TabsTrigger>
          <TabsTrigger value="form-16a">Form 16A (TDS Cert)</TabsTrigger>
          <TabsTrigger value="form-27d">Form 27D (TCS Cert)</TabsTrigger>
        </TabsList>

        <TabsContent value="tds-list" className="mt-6">
          <DeductionList kind="tds" orgId={organizationId} fy={fy} quarter={quarter} />
        </TabsContent>
        <TabsContent value="tcs-list" className="mt-6">
          <DeductionList kind="tcs" orgId={organizationId} fy={fy} quarter={quarter} />
        </TabsContent>
        <TabsContent value="form-16a" className="mt-6">
          <CertView
            kind="tds"
            orgId={organizationId}
            fy={fy}
            quarter={quarter}
            label="Form 16A — Quarterly TDS Certificate"
          />
        </TabsContent>
        <TabsContent value="form-27d" className="mt-6">
          <CertView
            kind="tcs"
            orgId={organizationId}
            fy={fy}
            quarter={quarter}
            label="Form 27D — Quarterly TCS Certificate"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DeductionList({
  kind,
  orgId,
  fy,
  quarter,
}: {
  kind: "tds" | "tcs";
  orgId: string;
  fy: string;
  quarter: 1 | 2 | 3 | 4;
}) {
  const [data, setData] = React.useState<DeductionListItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const path = kind === "tds" ? "tds-deductions" : "tcs-collections";
        const r = await fetch(
          `/api/organizations/${orgId}/${path}?fy=${fy}&quarter=${quarter}&limit=200`,
          { cache: "no-store" }
        );
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(body.error ?? "Failed");
        setData(body.data ?? []);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [kind, orgId, fy, quarter]);

  const totalTax = data?.reduce((s, r) => s + Number(r.taxAmount), 0) ?? 0;
  const totalBase = data?.reduce((s, r) => s + Number(r.baseAmount), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi label="Entries" value={data ? String(data.length) : "—"} />
        <Kpi label="Total Base" value={data ? fmtINR(totalBase) : "—"} />
        <Kpi
          label={kind === "tds" ? "TDS Deducted" : "TCS Collected"}
          value={data ? fmtINR(totalTax) : "—"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {kind === "tds" ? "Deductions" : "Collections"} — FY {fy} Q{quarter}
          </CardTitle>
          <CardDescription>
            Each row is one {kind === "tds" ? "TDS deduction" : "TCS collection"} event posted to
            the GL. Sourced from the {kind === "tds" ? "tds_deductions" : "tcs_collections"} table.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <EmptyState message="Loading…" />}
          {error && <ErrorBanner message={error} />}
          {!loading && !error && data && data.length === 0 && (
            <EmptyState
              message={
                kind === "tds"
                  ? "No TDS deductions in this quarter. Every payment with a tdsSection produces a row here."
                  : "No TCS collections in this quarter. Every receipt with a tcsSection produces a row here."
              }
            />
          )}
          {!loading && !error && data && data.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>PAN</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">Rate %</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead>Rationale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {(r.deductedAt ?? r.collectedAt ?? "").slice(0, 10)}
                      </TableCell>
                      <TableCell>{r.party.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.party.panNo ?? (r.noPan ? <span className="text-amber-600">NO PAN</span> : "—")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.section}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {Number(r.ratePercent).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtINR(r.baseAmount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {fmtINR(r.taxAmount)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.rationale}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CertView({
  kind,
  orgId,
  fy,
  quarter,
  label,
}: {
  kind: "tds" | "tcs";
  orgId: string;
  fy: string;
  quarter: 1 | 2 | 3 | 4;
  label: string;
}) {
  const [data, setData] = React.useState<Form16AResp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const path = kind === "tds" ? "tds-deductions" : "tcs-collections";
        const view = kind === "tds" ? "form16a" : "form27d";
        const r = await fetch(
          `/api/organizations/${orgId}/${path}?view=${view}&fy=${fy}&quarter=${quarter}`,
          { cache: "no-store" }
        );
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(body.error ?? "Failed");
        setData(body);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [kind, orgId, fy, quarter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {label} — FY {fy} Q{quarter}
          </CardTitle>
          <CardDescription>
            Party-wise {kind === "tds" ? "deductions" : "collections"} aggregated by section.
            Drives the cert PDF; download/print is a follow-up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <EmptyState message="Aggregating…" />}
          {error && <ErrorBanner message={error} />}
          {!loading && !error && data && (
            <>
              <div className="grid gap-4 md:grid-cols-4 mb-4">
                <Kpi label="Parties" value={String(data.totals.parties)} />
                <Kpi label="Entries" value={String(data.totals.deductions)} />
                <Kpi label="Total Base" value={fmtINR(data.totals.base)} />
                <Kpi
                  label={kind === "tds" ? "Total TDS" : "Total TCS"}
                  value={fmtINR(data.totals.tax)}
                />
              </div>
              {data.parties.length === 0 ? (
                <EmptyState message="No entries in this period." />
              ) : (
                <div className="space-y-4">
                  {data.parties.map((p) => (
                    <Card key={p.partyId}>
                      <CardHeader className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-sm">{p.partyName}</CardTitle>
                            <CardDescription className="text-xs font-mono">
                              PAN: {p.partyPan ?? "—"}
                            </CardDescription>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Total tax</div>
                            <div className="font-mono font-semibold">{fmtINR(p.totals.tax)}</div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Section</TableHead>
                              <TableHead className="text-right">Count</TableHead>
                              <TableHead className="text-right">Base</TableHead>
                              <TableHead className="text-right">Tax</TableHead>
                              <TableHead className="text-right">Effective Rate</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {p.sections.map((s) => (
                              <TableRow key={s.section}>
                                <TableCell className="font-mono text-xs">{s.section}</TableCell>
                                <TableCell className="text-right">{s.count}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{fmtINR(s.base)}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{fmtINR(s.tax)}</TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {s.effectiveRate ? `${Number(s.effectiveRate).toFixed(2)}%` : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      {message}
    </div>
  );
}

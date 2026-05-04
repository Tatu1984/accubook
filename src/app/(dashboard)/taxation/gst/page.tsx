"use client";

import * as React from "react";
import {
  FileSpreadsheet,
  Loader2,
  Download,
  AlertCircle,
} from "lucide-react";
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
import { useOrganization } from "@/frontend/hooks/use-organization";

type Money = string | number;

const fmtINR = (v: Money | undefined) => {
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

function fyOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export default function GSTPage() {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">GST Returns</h1>
          <p className="text-muted-foreground">
            Compute GSTR-1, GSTR-3B and GSTR-9 from your books and download
            portal-ready JSON.
          </p>
        </div>
      </div>

      <Tabs defaultValue="gstr1">
        <TabsList>
          <TabsTrigger value="gstr1">GSTR-1</TabsTrigger>
          <TabsTrigger value="gstr3b">GSTR-3B</TabsTrigger>
          <TabsTrigger value="gstr9">GSTR-9 (Annual)</TabsTrigger>
          <TabsTrigger value="cmp08">CMP-08 (Composition)</TabsTrigger>
        </TabsList>

        <TabsContent value="gstr1" className="mt-6">
          <Gstr1Tab orgId={organizationId} />
        </TabsContent>
        <TabsContent value="gstr3b" className="mt-6">
          <Gstr3bTab orgId={organizationId} />
        </TabsContent>
        <TabsContent value="gstr9" className="mt-6">
          <Gstr9Tab orgId={organizationId} />
        </TabsContent>
        <TabsContent value="cmp08" className="mt-6">
          <Cmp08Tab orgId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// CMP-08 (Composition)
// ============================================================

type Cmp08Resp = {
  fiscalYear: string;
  quarter: 1 | 2 | 3 | 4;
  period: { from: string; to: string };
  rate: string;
  outwardTurnover: string;
  inwardReverseCharge: { taxableValue: string; igst: string; cgst: string; sgst: string };
  compositionTax: { cgst: string; sgst: string; total: string };
  totalTaxPayable: string;
};

function Cmp08Tab({ orgId }: { orgId: string }) {
  const now = new Date();
  const m = now.getUTCMonth();
  const y = now.getUTCFullYear();
  const fyStart = m >= 3 ? y : y - 1;
  const initialFy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
  const initialQ: 1 | 2 | 3 | 4 =
    m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 && m <= 11 ? 3 : 4;

  const [fy, setFy] = React.useState(initialFy);
  const [quarter, setQuarter] = React.useState<1 | 2 | 3 | 4>(initialQ);
  const [data, setData] = React.useState<Cmp08Resp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/gst-returns/cmp08?fy=${fy}&quarter=${quarter}`,
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Period</CardTitle>
          <CardDescription>
            CMP-08 is the quarterly tax-payment statement for composition-scheme suppliers.
            Filed by the 18th of the month following each quarter end. Requires
            <code className="mx-1 text-xs">compositionScheme=true</code> on the organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="cmp08-fy" className="text-xs">FY</Label>
              <Input
                id="cmp08-fy"
                value={fy}
                onChange={(e) => setFy(e.target.value)}
                className="w-32 font-mono"
                placeholder="2025-26"
              />
            </div>
            <div>
              <Label htmlFor="cmp08-q" className="text-xs">Quarter</Label>
              <select
                id="cmp08-q"
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
            <Button onClick={run} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Compute
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-amber-200 dark:border-amber-900/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Outward turnover</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold">{fmtINR(data.outwardTurnover)}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Q{data.quarter} {data.fiscalYear}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Composition tax</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold">{fmtINR(data.compositionTax.total)}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  @ {data.rate}% (CGST {fmtINR(data.compositionTax.cgst)} + SGST {fmtINR(data.compositionTax.sgst)})
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">RCM-inward GST</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold">
                  {fmtINR(
                    Number(data.inwardReverseCharge.igst) +
                      Number(data.inwardReverseCharge.cgst) +
                      Number(data.inwardReverseCharge.sgst)
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  on {fmtINR(data.inwardReverseCharge.taxableValue)} taxable
                </p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 dark:border-emerald-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total payable</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold">{fmtINR(data.totalTaxPayable)}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Composition + RCM
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">CMP-08 cells</CardTitle>
              <CardDescription>
                These map directly to the GSTN portal&apos;s CMP-08 form.
                Period <span className="font-mono">{data.period.from}</span> to{" "}
                <span className="font-mono">{data.period.to}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs">
              <dl className="grid gap-2 md:grid-cols-2">
                <Cmp08Cell label="3.1 Outward (taxable)" value={fmtINR(data.outwardTurnover)} />
                <Cmp08Cell label="3.2 RCM-inward (taxable)" value={fmtINR(data.inwardReverseCharge.taxableValue)} />
                <Cmp08Cell label="3.3 Composition CGST" value={fmtINR(data.compositionTax.cgst)} />
                <Cmp08Cell label="3.3 Composition SGST" value={fmtINR(data.compositionTax.sgst)} />
                <Cmp08Cell label="3.2 RCM IGST" value={fmtINR(data.inwardReverseCharge.igst)} />
                <Cmp08Cell label="3.2 RCM CGST" value={fmtINR(data.inwardReverseCharge.cgst)} />
                <Cmp08Cell label="3.2 RCM SGST" value={fmtINR(data.inwardReverseCharge.sgst)} />
                <Cmp08Cell label="3.4 Total tax payable" value={fmtINR(data.totalTaxPayable)} />
              </dl>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Cmp08Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-dashed pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono font-medium">{value}</dd>
    </div>
  );
}

// ============================================================
// GSTR-1
// ============================================================

type Gstr1Summary = {
  totalInvoices: number;
  totalTaxable: string;
  totalCgst: string;
  totalSgst: string;
  totalIgst: string;
  totalCess: string;
  totalTax: string;
  creditNotesValue: string;
  debitNotesValue: string;
};
type Gstr1Resp = {
  period: { from: string; to: string };
  b2b: Array<{ ctin: string; partyName: string; invoices: unknown[] }>;
  b2cl: unknown[];
  b2cs: unknown[];
  cdnr: unknown[];
  cdnur: unknown[];
  exp: unknown[];
  hsn: unknown[];
  docs: unknown[];
  summary: Gstr1Summary;
};

function Gstr1Tab({ orgId }: { orgId: string }) {
  const initial = defaultPeriod();
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState(initial.to);
  const [data, setData] = React.useState<Gstr1Resp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/gst-returns/gstr1?from=${from}&to=${to}`,
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

  function downloadPortal() {
    const url = `/api/organizations/${orgId}/gst-returns/gstr1/portal?from=${from}&to=${to}&download=true`;
    window.location.href = url;
  }

  return (
    <div className="space-y-4">
      <PeriodControls
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onRun={run}
        onDownload={downloadPortal}
        loading={loading}
      />
      {error && <ErrorBanner message={error} />}
      {!error && data && (
        <>
          <SummaryCards
            cards={[
              { label: "Invoices", value: String(data.summary.totalInvoices) },
              { label: "Taxable Value", value: fmtINR(data.summary.totalTaxable) },
              { label: "Total Tax", value: fmtINR(data.summary.totalTax) },
              { label: "Credit Notes", value: fmtINR(data.summary.creditNotesValue) },
            ]}
          />
          <Card>
            <CardHeader>
              <CardTitle>Section breakdown</CardTitle>
              <CardDescription>Counts per GSTR-1 section.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                <SectionRow label="B2B (registered)" count={data.b2b.length} />
                <SectionRow label="B2CL (unreg ≥ ₹2.5L)" count={data.b2cl.length} />
                <SectionRow label="B2CS (unreg)" count={data.b2cs.length} />
                <SectionRow label="CDNR (CN/DN registered)" count={data.cdnr.length} />
                <SectionRow label="CDNUR (CN/DN unregistered)" count={data.cdnur.length} />
                <SectionRow label="EXP (exports)" count={data.exp.length} />
                <SectionRow label="HSN summary rows" count={data.hsn.length} />
              </div>
            </CardContent>
          </Card>
          <TaxBreakdownCard
            cgst={data.summary.totalCgst}
            sgst={data.summary.totalSgst}
            igst={data.summary.totalIgst}
            cess={data.summary.totalCess}
          />
        </>
      )}
      {loading && !data && <LoadingState />}
    </div>
  );
}

// ============================================================
// GSTR-3B
// ============================================================

type Gstr3bResp = {
  period: { from: string; to: string };
  s3_1: {
    outwardTaxable: TaxBlock;
    outwardZeroRated: TaxBlock;
    outwardNilRated: TaxBlock;
    inwardReverseCharge: TaxBlock;
    outwardNonGst: TaxBlock;
  };
  s4: {
    available: { reverseCharge: TaxBlock; other: TaxBlock };
    reversed: TaxBlock;
    net: TaxBlock;
  };
  summary: {
    outwardTax: TaxBlock;
    itcNet: TaxBlock;
    netPayable: TaxBlock;
  };
};

type TaxBlock = {
  taxableValue?: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
};

function Gstr3bTab({ orgId }: { orgId: string }) {
  const initial = defaultPeriod();
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState(initial.to);
  const [data, setData] = React.useState<Gstr3bResp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/gst-returns/gstr3b?from=${from}&to=${to}`,
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

  function downloadPortal() {
    window.location.href = `/api/organizations/${orgId}/gst-returns/gstr3b/portal?from=${from}&to=${to}&download=true`;
  }

  return (
    <div className="space-y-4">
      <PeriodControls
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onRun={run}
        onDownload={downloadPortal}
        loading={loading}
      />
      {error && <ErrorBanner message={error} />}
      {!error && data && (
        <>
          <SummaryCards
            cards={[
              { label: "Output Tax", value: fmtINR(sumTax(data.summary.outwardTax)) },
              { label: "Net ITC", value: fmtINR(sumTax(data.summary.itcNet)) },
              { label: "Net Payable", value: fmtINR(sumTax(data.summary.netPayable)) },
              { label: "RCM Inward", value: fmtINR(data.s3_1.inwardReverseCharge.taxableValue) },
            ]}
          />
          <Card>
            <CardHeader>
              <CardTitle>3.1 Outward + RCM</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <SectionLine label="3.1(a) Outward taxable" block={data.s3_1.outwardTaxable} />
                <SectionLine label="3.1(b) Zero-rated (exports)" block={data.s3_1.outwardZeroRated} />
                <SectionLine label="3.1(c) Nil-rated / exempt" block={data.s3_1.outwardNilRated} />
                <SectionLine label="3.1(d) Inward RCM" block={data.s3_1.inwardReverseCharge} />
                <SectionLine label="3.1(e) Non-GST outward" block={data.s3_1.outwardNonGst} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>4 ITC</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <SectionLine label="4.A.(3) ISRC (RCM)" block={data.s4.available.reverseCharge} />
                <SectionLine label="4.A.(5) OTH (other)" block={data.s4.available.other} />
                <SectionLine label="4.B Reversed" block={data.s4.reversed} />
                <SectionLine label="4.C Net ITC" block={data.s4.net} highlight />
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {loading && !data && <LoadingState />}
    </div>
  );
}

// ============================================================
// GSTR-9
// ============================================================

type Gstr9Resp = {
  fiscalYear: { start: string; end: string; label: string };
  s4: {
    b2cOutward: TaxBlock;
    b2bOutward: TaxBlock;
    exportsWithTax: TaxBlock;
    inwardReverseCharge: TaxBlock;
    subtotal: TaxBlock;
    creditNotesAdjustment: TaxBlock;
    debitNotesAdjustment: TaxBlock;
    netSupplies: TaxBlock;
  };
  s5: { exportsLut: TaxBlock; nilRated: TaxBlock; nonGst: TaxBlock; total: TaxBlock };
  s6: { totalItcAvailed: TaxBlock; rcmDomestic: TaxBlock };
  s7: { reversed: TaxBlock; netItc: TaxBlock };
  s9: { taxPayable: TaxBlock; paidThroughItc: TaxBlock; paidInCash: TaxBlock };
};

function Gstr9Tab({ orgId }: { orgId: string }) {
  const [fy, setFy] = React.useState(fyOf(new Date()));
  const [data, setData] = React.useState<Gstr9Resp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/gst-returns/gstr9?fy=${fy}`,
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
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="fy">Financial Year</Label>
            <Input
              id="fy"
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              placeholder="2026-27"
              className="w-32"
            />
          </div>
          <Button onClick={run} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Compute
          </Button>
        </CardContent>
      </Card>
      {error && <ErrorBanner message={error} />}
      {!error && data && (
        <>
          <SummaryCards
            cards={[
              { label: "Net Supplies", value: fmtINR(data.s4.netSupplies.taxableValue) },
              { label: "Tax Payable", value: fmtINR(sumTax(data.s9.taxPayable)) },
              { label: "Paid via ITC", value: fmtINR(sumTax(data.s9.paidThroughItc)) },
              { label: "Paid in Cash", value: fmtINR(sumTax(data.s9.paidInCash)) },
            ]}
          />
          <Card>
            <CardHeader>
              <CardTitle>4 — Outward + RCM (annualized)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <SectionLine label="4A B2C" block={data.s4.b2cOutward} />
                <SectionLine label="4B B2B" block={data.s4.b2bOutward} />
                <SectionLine label="4C Exports w/ tax" block={data.s4.exportsWithTax} />
                <SectionLine label="4G Inward RCM" block={data.s4.inwardReverseCharge} />
                <SectionLine label="4I Credit Notes" block={data.s4.creditNotesAdjustment} />
                <SectionLine label="4J Debit Notes" block={data.s4.debitNotesAdjustment} />
                <SectionLine label="4N Net Supplies" block={data.s4.netSupplies} highlight />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>5 / 6 / 7 — Non-payable, ITC</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <SectionLine label="5A Exports under LUT" block={data.s5.exportsLut} />
                <SectionLine label="5E Nil-rated / exempt" block={data.s5.nilRated} />
                <SectionLine label="5F Non-GST" block={data.s5.nonGst} />
                <SectionLine label="6A ITC availed (total)" block={data.s6.totalItcAvailed} />
                <SectionLine label="6B ITC RCM domestic" block={data.s6.rcmDomestic} />
                <SectionLine label="7J Net ITC" block={data.s7.netItc} highlight />
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {loading && !data && <LoadingState />}
    </div>
  );
}

// ============================================================
// Shared bits
// ============================================================

function PeriodControls({
  from,
  to,
  setFrom,
  setTo,
  onRun,
  onDownload,
  loading,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  onRun: () => void;
  onDownload: () => void;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 pt-6">
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
          Compute
        </Button>
        <Button variant="outline" onClick={onDownload} disabled={loading}>
          <Download className="mr-2 h-4 w-4" />
          Download portal JSON
        </Button>
      </CardContent>
    </Card>
  );
}

function SummaryCards({
  cards,
}: {
  cards: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {c.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TaxBreakdownCard({
  cgst,
  sgst,
  igst,
  cess,
}: {
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-4">
          <BreakdownPill label="CGST" value={cgst} />
          <BreakdownPill label="SGST" value={sgst} />
          <BreakdownPill label="IGST" value={igst} />
          <BreakdownPill label="CESS" value={cess} />
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{fmtINR(value)}</div>
    </div>
  );
}

function SectionRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm font-semibold">{count}</span>
    </div>
  );
}

function SectionLine({
  label,
  block,
  highlight,
}: {
  label: string;
  block: TaxBlock;
  highlight?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-2 rounded p-2 text-sm md:grid-cols-6 ${
        highlight ? "bg-primary/5 font-medium" : ""
      }`}
    >
      <span className="md:col-span-2">{label}</span>
      <Cell label="Taxable" value={block.taxableValue} />
      <Cell label="CGST" value={block.cgst} />
      <Cell label="SGST" value={block.sgst} />
      <Cell label="IGST" value={block.igst} />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string | undefined }) {
  return (
    <span className="flex items-baseline justify-end gap-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="font-mono">{fmtINR(value)}</span>
    </span>
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

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <FileSpreadsheet className="mb-3 h-10 w-10" />
      <p>Computing return…</p>
    </div>
  );
}

function sumTax(b: TaxBlock): number {
  return Number(b.cgst) + Number(b.sgst) + Number(b.igst) + Number(b.cess);
}

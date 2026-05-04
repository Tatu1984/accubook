"use client";

import * as React from "react";
import {
  Loader2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  FileX,
} from "lucide-react";
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

type ReconResult = {
  ok: boolean;
  period: string;
  buyerGstin: string | null;
  supplierCount: number;
  billsConsidered: number;
  totals: {
    matched: number;
    mismatched: number;
    missingInBooks: number;
    missingIn2b: number;
  };
  rows: ReconRow[];
};

type ReconRow =
  | {
      status: "MATCHED";
      supplierGstin: string;
      supplierName: string;
      invoiceNumber: string;
      invoiceDate: string;
      invoiceValue: number;
      bill: { id: string; billNumber: string };
    }
  | {
      status: "MISMATCHED";
      supplierGstin: string;
      supplierName: string;
      invoiceNumber: string;
      invoiceDate: string;
      invoiceValue: number;
      bill: { id: string; billNumber: string };
      reasons: string[];
    }
  | {
      status: "MISSING_IN_BOOKS";
      supplierGstin: string;
      supplierName: string;
      invoiceNumber: string;
      invoiceDate: string;
      invoiceValue: number;
      itcAvailable: boolean;
    }
  | {
      status: "MISSING_IN_2B";
      supplierGstin: string;
      supplierName: string;
      bill: {
        id: string;
        billNumber: string;
        vendorBillNo: string | null;
        date: string;
      };
      totalAmount: string;
    };

export default function Gstr2bPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ReconResult | null>(null);

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

  async function reconcile() {
    if (!file) {
      setError("Pick the GSTN GSTR-2B JSON file first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(
        `/api/organizations/${organizationId}/gst-returns/gstr2b/reconcile`,
        { method: "POST", body: fd }
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Reconciliation failed");
      setResult(body as ReconResult);
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const matchedRows = result?.rows.filter((r) => r.status === "MATCHED") ?? [];
  const mismatchedRows = result?.rows.filter((r) => r.status === "MISMATCHED") ?? [];
  const missingInBooksRows = result?.rows.filter((r) => r.status === "MISSING_IN_BOOKS") ?? [];
  const missingIn2bRows = result?.rows.filter((r) => r.status === "MISSING_IN_2B") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">GSTR-2B Reconciliation</h1>
        <p className="text-muted-foreground">
          Upload the GSTN portal&apos;s GSTR-2B JSON to reconcile against your purchase register.
          Mismatches block ITC and create scrutiny risk — fix them before filing GSTR-3B.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload GSTR-2B JSON</CardTitle>
          <CardDescription>
            Download the JSON from{" "}
            <span className="font-mono text-xs">Returns Dashboard → GSTR-2B → Download</span>
            {" "}on the GSTN portal. The filing period is read from the file&apos;s{" "}
            <code className="text-xs">rtnprd</code>; bills in that calendar month are pulled
            from your books.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
              className="text-sm"
            />
            <Button onClick={reconcile} disabled={!file || loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reconciling…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Reconcile
                </>
              )}
            </Button>
          </div>
          {error && (
            <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              label="Matched"
              value={String(result.totals.matched)}
              hint="Books and 2B agree"
            />
            <Kpi
              icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
              label="Mismatched"
              value={String(result.totals.mismatched)}
              hint="Same invoice, different amounts"
              tone="warning"
            />
            <Kpi
              icon={<FileWarning className="h-5 w-5 text-amber-700" />}
              label="Missing in books"
              value={String(result.totals.missingInBooks)}
              hint="Supplier filed; we didn't enter the bill"
              tone="warning"
            />
            <Kpi
              icon={<FileX className="h-5 w-5 text-red-600" />}
              label="Missing in 2B"
              value={String(result.totals.missingIn2b)}
              hint="We have the bill; supplier hasn't filed"
              tone="danger"
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Period <span className="font-mono">{result.period}</span> ·{" "}
            <span className="font-mono">{result.supplierCount}</span> suppliers in 2B ·{" "}
            <span className="font-mono">{result.billsConsidered}</span> bills considered
            {result.buyerGstin && (
              <>
                {" "}
                · Buyer <span className="font-mono">{result.buyerGstin}</span>
              </>
            )}
          </div>

          <Tabs defaultValue="mismatched" className="w-full">
            <TabsList>
              <TabsTrigger value="matched">Matched ({matchedRows.length})</TabsTrigger>
              <TabsTrigger value="mismatched">Mismatched ({mismatchedRows.length})</TabsTrigger>
              <TabsTrigger value="missing-books">Missing in Books ({missingInBooksRows.length})</TabsTrigger>
              <TabsTrigger value="missing-2b">Missing in 2B ({missingIn2bRows.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="matched" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Matched invoices</CardTitle>
                  <CardDescription>
                    Books and 2B agree within ₹1 per cell — these are safe to claim ITC on.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {matchedRows.length === 0 ? (
                    <Empty message="None." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Invoice #</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead>Bill #</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matchedRows.map((r) => (
                          <TableRow key={`${r.supplierGstin}-${(r as { invoiceNumber: string }).invoiceNumber}`}>
                            <TableCell className="whitespace-nowrap text-xs">
                              {(r as { invoiceDate: string }).invoiceDate}
                            </TableCell>
                            <TableCell>
                              <div>{r.supplierName}</div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {r.supplierGstin}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {(r as { invoiceNumber: string }).invoiceNumber}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {fmtINR((r as { invoiceValue: number }).invoiceValue)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {(r as { bill: { billNumber: string } }).bill.billNumber}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mismatched" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Mismatched invoices</CardTitle>
                  <CardDescription>
                    Same invoice exists in books and 2B but values differ. Fix before filing 3B.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {mismatchedRows.length === 0 ? (
                    <Empty message="None." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Invoice #</TableHead>
                          <TableHead className="text-right">2B Value</TableHead>
                          <TableHead>Bill #</TableHead>
                          <TableHead>Reasons</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mismatchedRows.map((r) => {
                          const m = r as Extract<ReconRow, { status: "MISMATCHED" }>;
                          return (
                            <TableRow key={`${m.supplierGstin}-${m.invoiceNumber}`}>
                              <TableCell>
                                <div>{m.supplierName}</div>
                                <div className="font-mono text-xs text-muted-foreground">
                                  {m.supplierGstin}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{m.invoiceNumber}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {fmtINR(m.invoiceValue)}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{m.bill.billNumber}</TableCell>
                              <TableCell>
                                <ul className="list-disc pl-4 text-xs text-amber-700 dark:text-amber-300">
                                  {m.reasons.map((reason, i) => (
                                    <li key={i}>{reason}</li>
                                  ))}
                                </ul>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="missing-books" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">In 2B but not in books</CardTitle>
                  <CardDescription>
                    Supplier reported these to GSTN but you haven&apos;t entered the bill yet.
                    Enter them before filing 3B or you lose the ITC.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {missingInBooksRows.length === 0 ? (
                    <Empty message="None." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Invoice #</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead>ITC</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {missingInBooksRows.map((r) => {
                          const m = r as Extract<ReconRow, { status: "MISSING_IN_BOOKS" }>;
                          return (
                            <TableRow key={`${m.supplierGstin}-${m.invoiceNumber}`}>
                              <TableCell className="whitespace-nowrap text-xs">{m.invoiceDate}</TableCell>
                              <TableCell>
                                <div>{m.supplierName}</div>
                                <div className="font-mono text-xs text-muted-foreground">
                                  {m.supplierGstin}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{m.invoiceNumber}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {fmtINR(m.invoiceValue)}
                              </TableCell>
                              <TableCell>
                                {m.itcAvailable ? (
                                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    eligible
                                  </span>
                                ) : (
                                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-300">
                                    blocked
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="missing-2b" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">In books but not in 2B</CardTitle>
                  <CardDescription>
                    You have the bill but the supplier hasn&apos;t reported it yet. ITC is at risk —
                    chase the supplier before the GSTR-3B deadline.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {missingIn2bRows.length === 0 ? (
                    <Empty message="None." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Bill #</TableHead>
                          <TableHead>Vendor Inv #</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {missingIn2bRows.map((r) => {
                          const m = r as Extract<ReconRow, { status: "MISSING_IN_2B" }>;
                          return (
                            <TableRow key={m.bill.id}>
                              <TableCell className="whitespace-nowrap text-xs">{m.bill.date}</TableCell>
                              <TableCell>
                                <div>{m.supplierName}</div>
                                <div className="font-mono text-xs text-muted-foreground">
                                  {m.supplierGstin}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{m.bill.billNumber}</TableCell>
                              <TableCell className="font-mono text-xs">{m.bill.vendorBillNo ?? "—"}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {fmtINR(m.totalAmount)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
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
  tone?: "warning" | "danger";
}) {
  const cardClass =
    tone === "danger"
      ? "border-red-200 dark:border-red-900/50"
      : tone === "warning"
      ? "border-amber-200 dark:border-amber-900/50"
      : "";
  return (
    <Card className={cardClass}>
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
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">{message}</div>
  );
}

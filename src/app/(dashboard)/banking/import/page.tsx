"use client";

import * as React from "react";
import {
  Loader2,
  Upload,
  Check,
  AlertCircle,
  RefreshCcw,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
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

type BankAccount = { id: string; name: string; bankName: string };

type ImportResult = {
  ok: boolean;
  bank: string;
  result: {
    parsed: number;
    inserted: number;
    skipped: number;
    errors: string[];
  };
  parserWarnings?: string[];
};

type ReconcileResult = {
  considered: number;
  matched: number;
  ambiguous: number;
  errors: string[];
  matches: Array<{
    bankTransactionId: string;
    voucherId: string;
    paymentOrReceiptId: string;
    side: "DEBIT" | "CREDIT";
    score: number;
    rationale: string[];
  }>;
};

const BANKS = [
  { value: "HDFC", label: "HDFC Bank" },
  { value: "ICICI", label: "ICICI Bank" },
  { value: "SBI", label: "State Bank of India" },
  { value: "AXIS", label: "Axis Bank" },
  { value: "GENERIC", label: "Generic CSV" },
] as const;

export default function BankingImportPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [accounts, setAccounts] = React.useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = React.useState<string>("");
  const [bankFormat, setBankFormat] = React.useState<string>("HDFC");
  const [file, setFile] = React.useState<File | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [reconciling, setReconciling] = React.useState(false);
  const [reconcileResult, setReconcileResult] = React.useState<ReconcileResult | null>(null);
  const [reconcileError, setReconcileError] = React.useState<string | null>(null);

  // Load bank accounts for the dropdown.
  React.useEffect(() => {
    if (!organizationId) return;
    fetch(`/api/organizations/${organizationId}/bank-accounts`)
      .then((r) => r.json())
      .then((b) => {
        const list = (b.data ?? b ?? []) as BankAccount[];
        setAccounts(list);
        if (list.length && !bankAccountId) setBankAccountId(list[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

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

  async function runImport() {
    if (!bankAccountId || !file) {
      setImportError("Pick a bank account and a CSV file");
      return;
    }
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bankAccountId", bankAccountId);
      fd.append("bank", bankFormat);
      const r = await fetch(`/api/organizations/${organizationId}/banking/import-statement`, {
        method: "POST",
        body: fd,
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? body.message ?? "Failed");
      setImportResult(body);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function runReconcile() {
    if (!bankAccountId) {
      setReconcileError("Pick a bank account first");
      return;
    }
    setReconciling(true);
    setReconcileError(null);
    setReconcileResult(null);
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/banking/reconcile?bankAccountId=${bankAccountId}`,
        { method: "POST" }
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? body.message ?? "Failed");
      setReconcileResult(body);
    } catch (e) {
      setReconcileError((e as Error).message);
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bank Import &amp; Reconciliation</h1>
        <p className="text-muted-foreground">
          Upload a bank statement CSV, then auto-match transactions against your
          payments and receipts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Upload statement</CardTitle>
          <CardDescription>
            HDFC, ICICI, SBI, Axis, or generic CSV. Re-uploads are idempotent —
            duplicate rows are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bank-account">Bank Account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger id="bank-account">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — {a.bankName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-format">Statement format</Label>
              <Select value={bankFormat} onValueChange={setBankFormat}>
                <SelectTrigger id="bank-format">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {BANKS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csv">CSV file</Label>
              <Input
                id="csv"
                type="file"
                accept=".csv,text/csv,application/vnd.ms-excel,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={runImport} disabled={importing || !file || !bankAccountId}>
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import statement
            </Button>
            {importError && (
              <span className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {importError}
              </span>
            )}
          </div>
          {importResult && (
            <div className="mt-6 rounded-lg border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Check className="h-4 w-4 text-emerald-500" />
                Import complete
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <Stat label="Parsed" value={String(importResult.result.parsed)} />
                <Stat label="Inserted" value={String(importResult.result.inserted)} accent="emerald" />
                <Stat label="Skipped (dupes)" value={String(importResult.result.skipped)} />
              </div>
              {importResult.result.errors.length > 0 && (
                <div className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                  <div className="font-medium">Errors:</div>
                  <ul className="ml-4 list-disc">
                    {importResult.result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              {importResult.parserWarnings && importResult.parserWarnings.length > 0 && (
                <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                  <div className="font-medium">Parser warnings:</div>
                  <ul className="ml-4 list-disc">
                    {importResult.parserWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Auto-reconcile</CardTitle>
          <CardDescription>
            Matches each unreconciled bank transaction against existing payments
            (debits) or receipts (credits) on the same bank account. Layered
            scoring on amount + date + reference + party tokens. Ambiguous
            matches are flagged for manual review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button onClick={runReconcile} disabled={reconciling || !bankAccountId} variant="default">
              {reconciling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Run reconciliation
            </Button>
            {reconcileError && (
              <span className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {reconcileError}
              </span>
            )}
          </div>
          {reconcileResult && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <Stat label="Considered" value={String(reconcileResult.considered)} />
                <Stat label="Matched" value={String(reconcileResult.matched)} accent="emerald" />
                <Stat label="Ambiguous" value={String(reconcileResult.ambiguous)} accent="amber" />
              </div>
              {reconcileResult.matches.length > 0 && (
                <div>
                  <div className="mb-2 text-sm font-medium">Matches</div>
                  <div className="overflow-x-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Side</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Bank txn</TableHead>
                          <TableHead>Matched to</TableHead>
                          <TableHead>Rationale</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reconcileResult.matches.map((m) => (
                          <TableRow key={m.bankTransactionId}>
                            <TableCell>
                              <span
                                className={
                                  m.side === "DEBIT"
                                    ? "rounded bg-rose-500/10 px-2 py-0.5 text-xs text-rose-700 dark:text-rose-300"
                                    : "rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400"
                                }
                              >
                                {m.side === "DEBIT" ? "OUT (Payment)" : "IN (Receipt)"}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{m.score}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {m.bankTransactionId.slice(0, 12)}…
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {m.paymentOrReceiptId.slice(0, 12)}…
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {m.rationale.join(" · ")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              {reconcileResult.errors.length > 0 && (
                <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                  <div className="font-medium">Errors:</div>
                  <ul className="ml-4 list-disc">
                    {reconcileResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Ambiguous matches are not auto-applied — review them manually
                from the Transactions page or re-run after creating the missing
                payment/receipt.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber";
}) {
  const tone =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

// Suppress unused-import warning when fmtINR ends up unused in this file.
void fmtINR;

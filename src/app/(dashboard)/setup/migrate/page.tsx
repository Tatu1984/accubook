"use client";

import * as React from "react";
import { Loader2, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
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
import { useOrganization } from "@/frontend/hooks/use-organization";

type SectionResult = { created: number; skipped: number; errors: string[] };

type ImportResponse = {
  ok: boolean;
  summary: {
    groups: SectionResult;
    ledgers: SectionResult;
    parties: SectionResult;
    items: SectionResult;
  };
};

export default function TallyMigratePage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [result, setResult] = React.useState<ImportResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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
    if (!file) {
      setError("Pick a Tally All-Masters XML file first");
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/organizations/${organizationId}/migration/tally`, {
        method: "POST",
        body: fd,
      });
      const body = (await r.json()) as ImportResponse | { error: string; message?: string };
      if (!r.ok) {
        const msg =
          (body as { error?: string; message?: string }).message ??
          (body as { error?: string }).error ??
          "Import failed";
        throw new Error(msg);
      }
      setResult(body as ImportResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Migrate from Tally</h1>
        <p className="text-muted-foreground">
          Upload a Tally All-Masters XML export to seed your organization with
          ledger groups, ledgers, parties, and stock items. Idempotent — re-uploading
          the same file is safe.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How to export from Tally</CardTitle>
          <CardDescription>
            In Tally Prime: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">F1 → Export → Masters → All Masters</code>{" "}
            and choose XML format. Keep the resulting file under 50 MB.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="xml">Tally XML file</Label>
              <Input
                id="xml"
                type="file"
                accept=".xml,application/xml,text/xml"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} — {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={runImport} disabled={uploading || !file}>
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Run import
            </Button>
            {error && (
              <span className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <CardTitle>Import complete</CardTitle>
            </div>
            <CardDescription>
              Re-running with the same file is safe — duplicates skipped.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <SectionStat label="Ledger Groups" data={result.summary.groups} />
              <SectionStat label="Ledgers" data={result.summary.ledgers} />
              <SectionStat label="Parties" data={result.summary.parties} />
              <SectionStat label="Stock Items" data={result.summary.items} />
            </div>

            <div className="mt-6 space-y-3">
              {(["groups", "ledgers", "parties", "items"] as const).map((k) => {
                const s = result.summary[k];
                if (s.errors.length === 0) return null;
                return (
                  <div
                    key={k}
                    className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
                  >
                    <div className="mb-1 font-medium uppercase tracking-wide">
                      {k} — {s.errors.length} issue{s.errors.length === 1 ? "" : "s"}
                    </div>
                    <ul className="ml-4 list-disc space-y-0.5">
                      {s.errors.slice(0, 10).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                      {s.errors.length > 10 && (
                        <li className="italic">…and {s.errors.length - 10} more</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What gets imported</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
            <li>
              <strong>Ledger Groups</strong> — Tally GROUP elements with their NATURE and PARENT, two-pass for child-before-parent ordering.
            </li>
            <li>
              <strong>Ledgers</strong> — non-party LEDGER elements (Cash, Bank, Sales, Expenses, etc.) with opening balance.
            </li>
            <li>
              <strong>Parties</strong> — LEDGER elements under <em>Sundry Debtors</em> (CUSTOMER) or <em>Sundry Creditors</em> (VENDOR), with PARTYGSTIN, state, PIN, address, credit period.
            </li>
            <li>
              <strong>Stock Items</strong> — STOCKITEM elements with HSN code, BASEUNITS (mapped to existing UoM), costing method (FIFO/LIFO/WAC).
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Vouchers (sales, purchase, payment, receipt entries) are not yet imported — that&apos;s a separate piece of work.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionStat({ label, data }: { label: string; data: SectionResult }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {data.created}
          </div>
          <div className="text-[10px] uppercase text-muted-foreground">Created</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-muted-foreground">
            {data.skipped}
          </div>
          <div className="text-[10px] uppercase text-muted-foreground">Skipped</div>
        </div>
        <div>
          <div
            className={`text-2xl font-semibold ${
              data.errors.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
            }`}
          >
            {data.errors.length}
          </div>
          <div className="text-[10px] uppercase text-muted-foreground">Errors</div>
        </div>
      </div>
    </div>
  );
}

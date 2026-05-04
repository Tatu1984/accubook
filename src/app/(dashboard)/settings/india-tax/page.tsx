"use client";

import * as React from "react";
import { Loader2, Save, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Label } from "@/frontend/components/ui/label";
import { Input } from "@/frontend/components/ui/input";
import { useOrganization } from "@/frontend/hooks/use-organization";

type Org = {
  id: string;
  name: string;
  gstNo: string | null;
  state: string | null;
  country: string;
  compositionScheme: boolean;
  compositionRate: string | number | null;
};

export default function IndiaTaxSettingsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [org, setOrg] = React.useState<Org | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  // Form state.
  const [gstNo, setGstNo] = React.useState("");
  const [state, setState] = React.useState("");
  const [composition, setComposition] = React.useState(false);
  const [rate, setRate] = React.useState("1");

  const reload = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/organizations/${organizationId}`, { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed to load");
      setOrg(body);
      setGstNo(body.gstNo ?? "");
      setState(body.state ?? "");
      setComposition(!!body.compositionScheme);
      setRate(body.compositionRate ? String(body.compositionRate) : "1");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function save() {
    if (!organizationId) return;
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const r = await fetch(`/api/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gstNo: gstNo || null,
          state: state || null,
          compositionScheme: composition,
          compositionRate: composition ? Number(rate) : null,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Save failed");
      setSavedAt(new Date().toLocaleTimeString());
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (orgLoading || (loading && !org)) {
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
        <h1 className="text-2xl font-bold tracking-tight">India Tax Settings</h1>
        <p className="text-muted-foreground">
          GSTIN, supplier state (drives place-of-supply), and composition-scheme controls.
          These flags affect every invoice POST, every return, and the CMP-08 / GSTR pipeline.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identification</CardTitle>
          <CardDescription>
            Used as supplier on every invoice and as the &quot;buyer GSTIN&quot; on every bill
            that enters the GSTR-2B reconciliation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="gstin" className="text-xs">GSTIN</Label>
            <Input
              id="gstin"
              value={gstNo}
              onChange={(e) => setGstNo(e.target.value.toUpperCase())}
              placeholder="27AAAAA0000A1Z5"
              className="font-mono"
              maxLength={15}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              15 chars: state code (2) + PAN (10) + entity (1) + Z + checksum (1).
            </p>
          </div>
          <div>
            <Label htmlFor="state" className="text-xs">Supplier state (2-letter code)</Label>
            <Input
              id="state"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              placeholder="MH"
              className="w-24 font-mono"
              maxLength={3}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              MH=Maharashtra, KA=Karnataka, DL=Delhi, etc. Drives intra/interstate detection.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Composition Scheme</CardTitle>
          <CardDescription>
            When enabled, invoice POST zeros out per-line GST cells (no GST charged to
            customer) and the supplier files CMP-08 quarterly + GSTR-4 annually instead
            of GSTR-1 + 3B every month. ITC on bills is not claimable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={composition}
              onChange={(e) => setComposition(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium">
              Organization is on the composition scheme
            </span>
          </label>
          {composition && (
            <div>
              <Label htmlFor="rate" className="text-xs">Composition rate (%)</Label>
              <select
                id="rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="mt-1 flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="1">1% — Trader / Manufacturer (Sec 10(1))</option>
                <option value="5">5% — Restaurant (Sec 10(1)(c))</option>
                <option value="6">6% — Service provider (Sec 10(2A))</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Rate applies to total turnover for the quarter. Split half/half as
                CGST/SGST in the CMP-08 statement.
              </p>
            </div>
          )}
          {!composition && org?.compositionScheme && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              <strong>Heads up:</strong> turning composition off mid-year means new invoices
              will charge GST normally. Returns previously filed under composition aren&apos;t
              affected, but check with your CA before the next return cycle.
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {savedAt && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>Saved at {savedAt}.</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  Scale,
  Loader2,
  Download,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { useOrganization } from "@/frontend/hooks/use-organization";

/** India's fiscal year runs April to March. */
function fyRange() {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { startDate: `${startYear}-04-01`, endDate: `${startYear + 1}-03-31` };
}

export default function BalanceSheetPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);
  const [asOf, setAsOf] = React.useState("today");

  const [data, setData] = React.useState<{ summary?: { totalAssets?: string; totalLiabilities?: string; totalEquity?: string; isBalanced?: boolean } } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * This page showed zeros regardless of what was in the ledger — it never
   * called the endpoint that had been producing the statement correctly.
   */
  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { startDate, endDate } = fyRange();
        const res = await fetch(
          `/api/organizations/${organizationId}/reports/balance-sheet?startDate=${startDate}&endDate=${endDate}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load report");
        setData(await res.json());
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [organizationId]);

  const num = (v: unknown) => Number(v ?? 0);
  const summary = data?.summary ?? {};


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Balance Sheet</h1>
          <p className="text-muted-foreground">
            View assets, liabilities, and equity
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={asOf} onValueChange={setAsOf}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="As of" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">As of Today</SelectItem>
              <SelectItem value="fy-end">FY End</SelectItem>
              <SelectItem value="last-month">Last Month End</SelectItem>
              <SelectItem value="custom">Custom Date</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(num(summary.totalAssets))}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(num(summary.totalLiabilities))}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(num(summary.totalEquity))}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assets</CardTitle>
            <CardDescription>Current and fixed assets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <Scale className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No asset data</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Liabilities & Equity</CardTitle>
            <CardDescription>Current and long-term liabilities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <Scale className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No liability data</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

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
import { resolveAsOf } from "@/frontend/utils/report-period";
import { exportReport } from "@/frontend/utils/export-report";
import { toast } from "sonner";


export default function BalanceSheetPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);
  const [asOf, setAsOf] = React.useState("today");

  interface Group {
    name: string;
    total: string | number;
    ledgers?: { name: string; balance: string | number }[];
  }
  const [data, setData] = React.useState<{
    assets?: { groups?: Group[]; total?: string };
    liabilities?: { groups?: Group[]; total?: string };
    equity?: { groups?: Group[]; retainedEarnings?: string; total?: string };
    summary?: {
      totalAssets?: string;
      totalLiabilities?: string;
      totalEquity?: string;
      isBalanced?: boolean;
    };
  } | null>(null);
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
        const { startDate, endDate } = resolveAsOf(asOf);
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
  }, [organizationId, asOf]);

  const num = (v: unknown) => Number(v ?? 0);
  const summary = data?.summary ?? {};


  const renderGroups = (groups: Group[] | undefined, emptyText: string) => {
    if (!groups || groups.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <Scale className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.name} className="space-y-1">
            <div className="flex items-center justify-between font-medium">
              <span>{group.name}</span>
              <span>{formatCurrency(num(group.total))}</span>
            </div>
            {(group.ledgers ?? []).map((ledger) => (
              <div
                key={`${group.name}-${ledger.name}`}
                className="flex items-center justify-between pl-4 text-sm text-muted-foreground"
              >
                <span>{ledger.name}</span>
                <span>{formatCurrency(num(ledger.balance))}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const [exporting, setExporting] = React.useState(false);

  const handleExport = async () => {
    if (!organizationId) return;
    const { startDate, endDate } = resolveAsOf(asOf);
    setExporting(true);
    try {
      await exportReport(organizationId, "balance-sheet", { startDate, endDate }, "xlsx");
      toast.success("Report exported");
    } catch (e) {
      toast.error((e as Error).message || "Failed to export report");
    } finally {
      setExporting(false);
    }
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
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
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
            {/* The endpoint returns the group breakdown; this panel used to
                show "No asset data" unconditionally, so a balanced statement
                still looked empty. */}
            {renderGroups(data?.assets?.groups, "No asset balances")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Liabilities &amp; Equity</CardTitle>
            <CardDescription>Current and long-term liabilities</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderGroups(
              [...(data?.liabilities?.groups ?? []), ...(data?.equity?.groups ?? [])],
              "No liability or equity balances"
            )}
            {data?.equity?.retainedEarnings != null && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">
                  Retained earnings (current year)
                </span>
                <span className="font-medium">
                  {formatCurrency(num(data.equity.retainedEarnings))}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

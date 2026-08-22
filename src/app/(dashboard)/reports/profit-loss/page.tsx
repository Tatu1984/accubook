"use client";

import * as React from "react";
import {
  BarChart3,
  Loader2,
  Download,
  TrendingUp,
  TrendingDown,
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
import { resolvePeriod } from "@/frontend/utils/report-period";
import { exportReport } from "@/frontend/utils/export-report";
import { toast } from "sonner";


export default function ProfitLossPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);
  const [period, setPeriod] = React.useState("current-fy");

  const [data, setData] = React.useState<{ income?: { total?: string }; directExpenses?: { total?: string }; indirectExpenses?: { total?: string }; netProfit?: { amount?: string } } | null>(null);
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
        const { startDate, endDate } = resolvePeriod(period);
        const res = await fetch(
          `/api/organizations/${organizationId}/reports/profit-loss?startDate=${startDate}&endDate=${endDate}`,
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
  }, [organizationId, period]);

  const num = (v: unknown) => Number(v ?? 0);
  const revenue = num(data?.income?.total);
  const expenses = num(data?.directExpenses?.total) + num(data?.indirectExpenses?.total);
  const netProfit = num(data?.netProfit?.amount);


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const [exporting, setExporting] = React.useState(false);

  const handleExport = async () => {
    if (!organizationId) return;
    const { startDate, endDate } = resolvePeriod(period);
    setExporting(true);
    try {
      await exportReport(organizationId, "profit-loss", { startDate, endDate }, "xlsx");
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
          <h1 className="text-2xl font-bold tracking-tight">Profit & Loss Statement</h1>
          <p className="text-muted-foreground">
            View income and expense summary
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current-fy">Current FY</SelectItem>
              <SelectItem value="last-fy">Last FY</SelectItem>
              <SelectItem value="q1">Q1</SelectItem>
              <SelectItem value="q2">Q2</SelectItem>
              <SelectItem value="q3">Q3</SelectItem>
              <SelectItem value="q4">Q4</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
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
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(revenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(expenses)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Profit/Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(netProfit)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <CardDescription>Income from operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No revenue data</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Expenses</CardTitle>
            <CardDescription>Operating and other expenses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No expense data</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

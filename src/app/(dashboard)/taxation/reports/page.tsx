"use client";

import * as React from "react";
import {
  FileSpreadsheet,
  Loader2,
  ArrowRight,
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
import { useOrganization } from "@/frontend/hooks/use-organization";
import { useRouter } from "next/navigation";

/**
 * Each card links to the screen that actually produces the report — where the
 * period and filters are chosen and the return is computed or downloaded.
 *
 * The cards previously carried "Configure" and "Generate" buttons wired to
 * nothing; there is no generic generator behind these six, each is produced by
 * its own screen.
 */
const taxReports = [
  {
    title: "GST Summary Report",
    description: "Summary of GST collected and paid",
    icon: FileSpreadsheet,
    href: "/taxation/gst",
  },
  {
    title: "GSTR-1 Report",
    description: "Outward supplies report",
    icon: FileSpreadsheet,
    href: "/settings/gst-returns",
  },
  {
    title: "GSTR-2A/2B Reconciliation",
    description: "Input tax credit reconciliation",
    icon: FileSpreadsheet,
    href: "/taxation/gstr2b",
  },
  {
    title: "TDS Summary Report",
    description: "Summary of TDS deductions",
    icon: FileSpreadsheet,
    href: "/taxation/tds-tcs",
  },
  {
    title: "TCS Summary Report",
    description: "Summary of TCS collections",
    icon: FileSpreadsheet,
    href: "/taxation/tds-tcs",
  },
  {
    title: "Tax Ledger Report",
    description: "All tax transactions",
    icon: FileSpreadsheet,
    href: "/accounting/ledgers?nature=DUTIES_AND_TAXES",
  },
];

/** Live figure shown on a card, so this is a dashboard rather than a static menu. */
interface TaxStats {
  pendingReturns: number;
  filedReturns: number;
  tdsCount: number;
  tcsCount: number;
}

export default function TaxationReportsPage() {
  const router = useRouter();
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);
  const [stats, setStats] = React.useState<TaxStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * The cards used to be a static menu with no data behind them. Each now
   * carries a live count from the endpoint that actually owns that report, so
   * a glance shows what needs attention before anything is opened.
   */
  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const get = async (path: string) => {
          const r = await fetch(`/api/organizations/${organizationId}/${path}`, {
            signal: controller.signal,
          });
          if (!r.ok) {
            throw new Error(
              (await r.json().catch(() => ({}))).error ?? `Failed to load ${path}`
            );
          }
          return r.json();
        };

        const [returns, tds, tcs] = await Promise.all([
          get("gst-returns?limit=200"),
          get("tds-deductions?limit=1"),
          get("tcs-collections?limit=1"),
        ]);

        type ReturnRow = { status: string };
        const rows: ReturnRow[] = returns.data ?? [];

        setStats({
          pendingReturns: rows.filter((r) => r.status === "PENDING").length,
          filedReturns: rows.filter((r) => r.status !== "PENDING").length,
          tdsCount: tds.pagination?.total ?? (tds.data ?? []).length,
          tcsCount: tcs.pagination?.total ?? (tcs.data ?? []).length,
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [organizationId]);

  /** The figure a given card should show, or null when that card has none. */
  const statFor = (title: string): { label: string; tone?: "warn" } | null => {
    if (!stats) return null;
    switch (title) {
      case "GST Summary Report":
      case "GSTR-1 Report":
        return stats.pendingReturns > 0
          ? { label: `${stats.pendingReturns} return(s) pending`, tone: "warn" }
          : { label: `${stats.filedReturns} filed` };
      case "TDS Summary Report":
        return { label: `${stats.tdsCount} deduction(s) recorded` };
      case "TCS Summary Report":
        return { label: `${stats.tcsCount} collection(s) recorded` };
      default:
        return null;
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
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

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taxation Reports</h1>
          <p className="text-muted-foreground">
            Generate and download tax-related reports
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {taxReports.map((report) => (
          <Card key={report.title} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <report.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <CardDescription className="text-sm">
                    {report.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const stat = statFor(report.title);
                if (!stat) return null;
                return (
                  <p
                    className={
                      stat.tone === "warn"
                        ? "text-sm font-medium text-amber-600"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {stat.label}
                  </p>
                );
              })()}
              <Button
                size="sm"
                className="w-full"
                onClick={() => router.push(report.href)}
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Open report
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

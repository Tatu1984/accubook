"use client";

import * as React from "react";
import {
  BookOpen,
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

type TbItem = {
  ledgerId: string;
  ledgerName: string;
  groupName: string;
  nature: string;
  closingDebit?: string;
  closingCredit?: string;
};

/** Resolve the period selector to a concrete date. */
function asOfDate(choice: string) {
  const now = new Date();
  if (choice === "fy-end") {
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear + 1}-03-31`;
  }
  if (choice === "last-month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 0);
    return d.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

export default function TrialBalancePage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);
  const [asOf, setAsOf] = React.useState("today");
  const [items, setItems] = React.useState<TbItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * This page rendered "No account data" and two zero totals no matter
   * what was in the ledger — it never called the endpoint that had been
   * producing a correct trial balance all along.
   */
  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const end = asOfDate(asOf);
        const res = await fetch(
          `/api/organizations/${organizationId}/reports/trial-balance?startDate=2000-01-01&endDate=${end}&asOfDate=${end}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load trial balance");
        const json = await res.json();
        setItems((json.items ?? []) as TbItem[]);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [organizationId, asOf]);

  const rows = items.filter((i) => Number(i.closingDebit) || Number(i.closingCredit));
  const totalDebit = rows.reduce((t, i) => t + Number(i.closingDebit ?? 0), 0);
  const totalCredit = rows.reduce((t, i) => t + Number(i.closingCredit ?? 0), 0);
  const agrees = Math.abs(totalDebit - totalCredit) < 0.01;

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
          <h1 className="text-2xl font-bold tracking-tight">Trial Balance</h1>
          <p className="text-muted-foreground">
            View debit and credit balances of all accounts
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Debit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalDebit)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Credit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCredit)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Account Balances</CardTitle>
              <CardDescription>All ledger account balances</CardDescription>
            </div>
            {rows.length > 0 && (
              <span className={agrees ? "text-sm text-green-600" : "text-sm text-red-600 font-medium"}>
                {agrees ? "Agrees" : `Out by ${formatCurrency(totalDebit - totalCredit)}`}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="py-12 text-center text-muted-foreground">{error}</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No account data</h3>
              <p className="text-muted-foreground">
                Trial balance will appear when you have ledger entries
              </p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <div className="grid grid-cols-4 gap-4 py-3 px-4 bg-muted font-medium text-sm border-b">
                <div>Ledger Account</div>
                <div>Group</div>
                <div className="text-right">Debit</div>
                <div className="text-right">Credit</div>
              </div>
              {rows.map((i) => (
                <div key={i.ledgerId} className="grid grid-cols-4 gap-4 py-2 px-4 border-b last:border-0 hover:bg-muted/50">
                  <div>{i.ledgerName}</div>
                  <div className="text-muted-foreground text-sm">{i.groupName}</div>
                  <div className="text-right">{Number(i.closingDebit) ? formatCurrency(Number(i.closingDebit)) : "-"}</div>
                  <div className="text-right">{Number(i.closingCredit) ? formatCurrency(Number(i.closingCredit)) : "-"}</div>
                </div>
              ))}
              <div className="grid grid-cols-4 gap-4 py-3 px-4 bg-muted font-semibold border-t-2">
                <div className="col-span-2">Total</div>
                <div className="text-right">{formatCurrency(totalDebit)}</div>
                <div className="text-right">{formatCurrency(totalCredit)}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

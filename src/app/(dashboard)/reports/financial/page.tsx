"use client";

import * as React from "react";
import {
  FileText,
  Download,
  TrendingUp,
  Building2,
  ChevronDown,
  ChevronRight,
  Printer,
  Loader2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { Badge } from "@/frontend/components/ui/badge";
import { Separator } from "@/frontend/components/ui/separator";
import { cn } from "@/shared/utils/common.util";
import { useOrganization } from "@/frontend/hooks/use-organization";

/**
 * Financial statements, read from the ledger.
 *
 * Every figure on this page used to be invented — a ₹1.58 crore P&L, a
 * balance sheet, a cash flow statement, and a trial balance whose columns
 * came to 2,97,40,000 against 3,25,00,000 under a note explaining the
 * difference away as "timing adjustments and provisions". None of it had
 * any connection to the books.
 *
 * The four endpoints behind these tabs were complete and correct the whole
 * time; nothing was calling them.
 */

interface ReportLineItem {
  id: string;
  name: string;
  amount: number;
  previousAmount?: number;
  children?: ReportLineItem[];
  isTotal?: boolean;
  isBold?: boolean;
}

/** A group as the report endpoints return it. */
type ApiGroup = {
  groupId: string;
  groupName: string;
  total: string;
  previousTotal?: string;
  items: { ledgerId: string; ledgerName: string; amount?: string; balance?: string; previousBalance?: string }[];
  subGroups?: ApiGroup[];
};

const num = (v: unknown) => Number(v ?? 0);

/** Shapes returned by the four report endpoints. */
type ApiSection = { label?: string; total?: string; groups?: ApiGroup[] };
type PlResponse = {
  income?: ApiSection;
  directExpenses?: ApiSection;
  indirectExpenses?: ApiSection;
  grossProfit?: { amount?: string; percentage?: number };
  netProfit?: { amount?: string; percentage?: number };
};
type BsResponse = {
  assets?: { groups?: ApiGroup[] };
  liabilities?: { groups?: ApiGroup[] };
  equity?: { groups?: ApiGroup[] };
  currentYearProfit?: { amount?: string; label?: string };
  summary?: {
    totalAssets?: string;
    totalLiabilitiesAndEquity?: string;
    isBalanced?: boolean;
    difference?: string;
  };
};
type CfItem = { description: string; amount: string; type: "inflow" | "outflow" };
type CfSection = { label: string; items: CfItem[]; netAmount: string };
type CfResponse = {
  operatingActivities?: CfSection;
  investingActivities?: CfSection;
  financingActivities?: CfSection;
  netCashFlow?: string;
  openingBalance?: string;
  closingBalance?: string;
};
type TbItem = {
  ledgerId: string;
  ledgerName: string;
  groupName: string;
  closingDebit?: string;
  closingCredit?: string;
};
type TbResponse = { items?: TbItem[] };

/** Map one API group (and any nesting under it) onto a report line. */
function groupToLine(g: ApiGroup): ReportLineItem {
  const children: ReportLineItem[] = [
    ...(g.items ?? []).map((i) => ({
      id: i.ledgerId,
      name: i.ledgerName,
      amount: num(i.amount ?? i.balance),
      previousAmount: i.previousBalance !== undefined ? num(i.previousBalance) : undefined,
    })),
    ...(g.subGroups ?? []).map(groupToLine),
  ];
  return {
    id: g.groupId,
    name: g.groupName,
    amount: num(g.total),
    previousAmount: g.previousTotal !== undefined ? num(g.previousTotal) : undefined,
    children: children.length ? children : undefined,
  };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

function formatPercentage(current: number, previous: number) {
  if (previous === 0) return "N/A";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function ReportLine({
  item,
  level = 0,
  showComparison = true,
}: {
  item: ReportLineItem;
  level?: number;
  showComparison?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(level === 0);
  const hasChildren = !!item.children?.length;
  const change = item.previousAmount ? item.amount - item.previousAmount : 0;

  return (
    <>
      <div
        className={cn(
          "grid gap-4 py-2 px-4 border-b last:border-0 hover:bg-muted/50",
          showComparison ? "grid-cols-[2fr_1fr_1fr_1fr_1fr]" : "grid-cols-[3fr_1fr]",
          item.isTotal && "bg-muted font-semibold border-t-2",
          item.isBold && "font-semibold"
        )}
      >
        <div className="flex items-center gap-1" style={{ paddingLeft: `${level * 20}px` }}>
          {hasChildren ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 hover:bg-muted rounded"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <span>{item.name}</span>
        </div>
        <div className={cn("text-right", item.amount < 0 ? "text-red-600" : "text-foreground")}>
          {item.amount < 0 ? `(${formatCurrency(item.amount)})` : formatCurrency(item.amount)}
        </div>
        {showComparison && (
          <>
            <div className={cn("text-right text-muted-foreground", item.previousAmount && item.previousAmount < 0 ? "text-red-400" : "")}>
              {item.previousAmount
                ? item.previousAmount < 0
                  ? `(${formatCurrency(item.previousAmount)})`
                  : formatCurrency(item.previousAmount)
                : "-"}
            </div>
            <div className="text-right">
              {item.previousAmount ? (
                <span className={cn("text-sm", change >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatPercentage(item.amount, item.previousAmount)}
                </span>
              ) : "-"}
            </div>
            <div className="text-right">
              {item.previousAmount ? (
                <span className={cn("text-sm", change >= 0 ? "text-green-600" : "text-red-600")}>
                  {change >= 0 ? "+" : ""}
                  {formatCurrency(change)}
                </span>
              ) : "-"}
            </div>
          </>
        )}
      </div>
      {hasChildren && expanded && item.children?.map((child) => (
        <ReportLine key={child.id} item={child} level={level + 1} showComparison={showComparison} />
      ))}
    </>
  );
}

/** India's fiscal year runs April to March. */
function fyRange(offsetYears = 0) {
  const now = new Date();
  const startYear = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) + offsetYears;
  return {
    label: `FY ${startYear}-${String(startYear + 1).slice(-2)}`,
    startDate: `${startYear}-04-01`,
    endDate: `${startYear + 1}-03-31`,
  };
}

export default function FinancialReportsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [periodOffset, setPeriodOffset] = React.useState("0");
  const [comparison, setComparison] = React.useState("previous-fy");

  const [pl, setPl] = React.useState<PlResponse | null>(null);
  const [bs, setBs] = React.useState<BsResponse | null>(null);
  const [cf, setCf] = React.useState<CfResponse | null>(null);
  const [tb, setTb] = React.useState<TbResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const period = fyRange(Number(periodOffset));
  const showComparison = comparison !== "none";

  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      const range = `startDate=${period.startDate}&endDate=${period.endDate}`;
      const cmp = showComparison ? "&compareWithPrevious=true" : "";
      try {
        const get = async (path: string) => {
          const res = await fetch(`/api/organizations/${organizationId}/reports/${path}`, { signal: controller.signal });
          if (!res.ok) {
            const b = await res.json().catch(() => ({}));
            throw new Error(b.error || `${path} failed (${res.status})`);
          }
          return res.json();
        };
        const [plRes, bsRes, cfRes, tbRes] = await Promise.all([
          get(`profit-loss?${range}${cmp}`),
          get(`balance-sheet?${range}${cmp}`),
          get(`cash-flow?${range}`),
          get(`trial-balance?${range}`),
        ]);
        setPl(plRes); setBs(bsRes); setCf(cfRes); setTb(tbRes);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [organizationId, period.startDate, period.endDate, showComparison]);

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  // ── Profit & loss ─────────────────────────────────────────────────────
  const plLines: ReportLineItem[] = pl ? [
    { id: "income", name: "Revenue", amount: num(pl.income?.total), isBold: true,
      previousAmount: showComparison
        ? (pl.income?.groups ?? []).reduce((t, g) => t + num(g.previousTotal), 0)
        : undefined,
      children: (pl.income?.groups ?? []).map(groupToLine) },
    { id: "direct", name: pl.directExpenses?.label ?? "Direct Expenses", amount: num(pl.directExpenses?.total), isBold: true,
      children: (pl.directExpenses?.groups ?? []).map(groupToLine) },
    { id: "gross", name: "Gross Profit", amount: num(pl.grossProfit?.amount), isTotal: true },
    { id: "indirect", name: "Indirect Expenses", amount: num(pl.indirectExpenses?.total), isBold: true,
      children: (pl.indirectExpenses?.groups ?? []).map(groupToLine) },
    { id: "net", name: "Net Profit", amount: num(pl.netProfit?.amount), isTotal: true },
  ] : [];

  // ── Balance sheet ─────────────────────────────────────────────────────
  const assetLines = (bs?.assets?.groups ?? []).map(groupToLine);
  const liabilityLines = [
    ...(bs?.liabilities?.groups ?? []).map(groupToLine),
    ...(bs?.equity?.groups ?? []).map(groupToLine),
    ...(bs?.currentYearProfit ? [{
      id: "cy-profit",
      name: bs.currentYearProfit.label ?? "Current Year Profit / (Loss)",
      amount: num(bs.currentYearProfit.amount),
    }] : []),
  ];
  const totalAssets = num(bs?.summary?.totalAssets);
  const totalLiabilities = num(bs?.summary?.totalLiabilitiesAndEquity);
  const balanced = !!bs?.summary?.isBalanced;

  // ── Trial balance ─────────────────────────────────────────────────────
  const tbRows = (tb?.items ?? []).filter((i) => num(i.closingDebit) || num(i.closingCredit));
  const tbDebit = tbRows.reduce((t, i) => t + num(i.closingDebit), 0);
  const tbCredit = tbRows.reduce((t, i) => t + num(i.closingCredit), 0);
  const tbAgrees = Math.abs(tbDebit - tbCredit) < 0.01;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-muted-foreground">
            Statements drawn from the ledger for {period.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodOffset} onValueChange={setPeriodOffset}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{fyRange(0).label}</SelectItem>
              <SelectItem value="-1">{fyRange(-1).label}</SelectItem>
              <SelectItem value="-2">{fyRange(-2).label}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={comparison} onValueChange={setComparison}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="previous-fy">Compare previous year</SelectItem>
              <SelectItem value="none">No comparison</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => window.print()} aria-label="Print">
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" asChild aria-label="Export">
            <a href={`/api/organizations/${organizationId}/reports/export?report=trial-balance&startDate=${period.startDate}&endDate=${period.endDate}`}>
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(num(pl?.income?.total))}</div>
            <p className="text-xs text-muted-foreground">{period.label}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", num(pl?.netProfit?.amount) < 0 && "text-red-600")}>
              {formatCurrency(num(pl?.netProfit?.amount))}
            </div>
            <p className="text-xs text-muted-foreground">
              {pl?.netProfit?.percentage !== undefined ? `${Number(pl.netProfit.percentage).toFixed(1)}% margin` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalAssets)}</div>
            <p className="text-xs text-muted-foreground">As at {period.endDate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trial Balance</CardTitle>
            <FileText className={cn("h-4 w-4", tbAgrees ? "text-green-600" : "text-red-600")} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", !tbAgrees && "text-red-600")}>
              {tbAgrees ? "Agrees" : "Out"}
            </div>
            <p className="text-xs text-muted-foreground">
              {tbAgrees ? "Debits equal credits" : `Difference ${formatCurrency(tbDebit - tbCredit)}`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pnl" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl">
          <Card>
            <CardHeader>
              <CardTitle>Profit &amp; Loss Statement</CardTitle>
              <CardDescription>{period.startDate} to {period.endDate}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg">
                <div className={cn("grid gap-4 py-3 px-4 bg-muted font-medium text-sm border-b",
                  showComparison ? "grid-cols-[2fr_1fr_1fr_1fr_1fr]" : "grid-cols-[3fr_1fr]")}>
                  <div>Particulars</div>
                  <div className="text-right">Current</div>
                  {showComparison && (<><div className="text-right">Previous</div><div className="text-right">Change %</div><div className="text-right">Change</div></>)}
                </div>
                {plLines.map((item) => (
                  <ReportLine key={item.id} item={item} showComparison={showComparison} />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance-sheet">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Balance Sheet</CardTitle>
                  <CardDescription>As at {period.endDate}</CardDescription>
                </div>
                <Badge className={balanced ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                  {balanced ? "Balanced" : `Out by ${formatCurrency(num(bs?.summary?.difference))}`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">Assets</h3>
                <div className="border rounded-lg">
                  {assetLines.length ? assetLines.map((item) => (
                    <ReportLine key={item.id} item={item} showComparison={showComparison} />
                  )) : <p className="p-4 text-sm text-muted-foreground">No asset balances in this period.</p>}
                  <div className={cn("grid gap-4 py-3 px-4 bg-muted font-semibold border-t-2",
                    showComparison ? "grid-cols-[2fr_1fr_1fr_1fr_1fr]" : "grid-cols-[3fr_1fr]")}>
                    <div>Total Assets</div>
                    <div className="text-right">{formatCurrency(totalAssets)}</div>
                    {showComparison && <><div /><div /><div /></>}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-3">Liabilities &amp; Equity</h3>
                <div className="border rounded-lg">
                  {liabilityLines.length ? liabilityLines.map((item) => (
                    <ReportLine key={item.id} item={item} showComparison={showComparison} />
                  )) : <p className="p-4 text-sm text-muted-foreground">No liability balances in this period.</p>}
                  <div className={cn("grid gap-4 py-3 px-4 bg-muted font-semibold border-t-2",
                    showComparison ? "grid-cols-[2fr_1fr_1fr_1fr_1fr]" : "grid-cols-[3fr_1fr]")}>
                    <div>Total Liabilities &amp; Equity</div>
                    <div className="text-right">{formatCurrency(totalLiabilities)}</div>
                    {showComparison && <><div /><div /><div /></>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cash-flow">
          <Card>
            <CardHeader>
              <CardTitle>Cash Flow Statement</CardTitle>
              <CardDescription>{period.startDate} to {period.endDate}</CardDescription>
            </CardHeader>
            <CardContent>
              {cf ? (
                <div className="space-y-4">
                  {([cf.operatingActivities, cf.investingActivities, cf.financingActivities]
                    .filter(Boolean) as CfSection[]).map((s) => (
                      <div key={s.label}>
                        <h3 className="font-semibold mb-2">{s.label}</h3>
                        <div className="space-y-1 pl-4">
                          {s.items.length ? s.items.map((r, i) => (
                            <div key={i} className="flex justify-between py-1 text-sm">
                              <span className="text-muted-foreground">{r.description}</span>
                              <span className={num(r.amount) < 0 ? "text-red-600" : ""}>
                                {num(r.amount) < 0
                                  ? `(${formatCurrency(num(r.amount))})`
                                  : formatCurrency(num(r.amount))}
                              </span>
                            </div>
                          )) : <p className="text-sm text-muted-foreground">No movement in this period.</p>}
                          <Separator className="my-2" />
                          <div className="flex justify-between py-1 font-semibold">
                            <span>Net</span>
                            <span>{formatCurrency(num(s.netAmount))}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  <Separator />
                  <div className="flex justify-between py-2 font-semibold text-lg">
                    <span>Net change in cash</span>
                    <span>{formatCurrency(num(cf.netCashFlow))}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No cash flow data for this period.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial-balance">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Trial Balance</CardTitle>
                  <CardDescription>As at {period.endDate}</CardDescription>
                </div>
                <Badge className={tbAgrees ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                  {tbAgrees ? "Agrees" : `Out by ${formatCurrency(tbDebit - tbCredit)}`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg">
                <div className="grid grid-cols-4 gap-4 py-3 px-4 bg-muted font-medium text-sm border-b">
                  <div>Ledger Account</div>
                  <div>Group</div>
                  <div className="text-right">Debit</div>
                  <div className="text-right">Credit</div>
                </div>
                {tbRows.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">No ledger balances in this period.</p>
                )}
                {tbRows.map((item) => (
                  <div key={item.ledgerId} className="grid grid-cols-4 gap-4 py-2 px-4 border-b last:border-0 hover:bg-muted/50">
                    <div>{item.ledgerName}</div>
                    <div className="text-muted-foreground text-sm">{item.groupName}</div>
                    <div className="text-right">{num(item.closingDebit) > 0 ? formatCurrency(num(item.closingDebit)) : "-"}</div>
                    <div className="text-right">{num(item.closingCredit) > 0 ? formatCurrency(num(item.closingCredit)) : "-"}</div>
                  </div>
                ))}
                <div className="grid grid-cols-4 gap-4 py-3 px-4 bg-muted font-semibold border-t-2">
                  <div className="col-span-2">Total</div>
                  <div className="text-right">{formatCurrency(tbDebit)}</div>
                  <div className="text-right">{formatCurrency(tbCredit)}</div>
                </div>
              </div>
              {!tbAgrees && (
                <p className="text-sm text-red-600 mt-4">
                  Debits and credits do not agree. This is a real difference in the ledger,
                  not a rounding or presentation artefact — it should be investigated before
                  these statements are relied on.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

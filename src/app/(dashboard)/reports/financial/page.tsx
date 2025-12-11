"use client";

import * as React from "react";
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Building2,
  Filter,
  ChevronDown,
  ChevronRight,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// Types
interface ReportLineItem {
  id: string;
  name: string;
  amount: number;
  previousAmount?: number;
  children?: ReportLineItem[];
  isTotal?: boolean;
  isBold?: boolean;
}

// Mock data for P&L
const profitAndLossData: ReportLineItem[] = [
  {
    id: "revenue",
    name: "Revenue",
    amount: 15890000,
    previousAmount: 12450000,
    children: [
      { id: "sales-goods", name: "Sales - Goods", amount: 12500000, previousAmount: 9800000 },
      { id: "sales-services", name: "Sales - Services", amount: 3200000, previousAmount: 2500000 },
      { id: "other-income", name: "Other Income", amount: 190000, previousAmount: 150000 },
    ],
  },
  {
    id: "cogs",
    name: "Cost of Goods Sold",
    amount: -9450000,
    previousAmount: -7200000,
    children: [
      { id: "purchases", name: "Purchases", amount: -8200000, previousAmount: -6100000 },
      { id: "freight", name: "Freight Inward", amount: -450000, previousAmount: -380000 },
      { id: "customs", name: "Customs Duty", amount: -800000, previousAmount: -720000 },
    ],
  },
  {
    id: "gross-profit",
    name: "Gross Profit",
    amount: 6440000,
    previousAmount: 5250000,
    isTotal: true,
    isBold: true,
  },
  {
    id: "operating-expenses",
    name: "Operating Expenses",
    amount: -3890000,
    previousAmount: -3200000,
    children: [
      { id: "salaries", name: "Salaries & Wages", amount: -2100000, previousAmount: -1800000 },
      { id: "rent", name: "Rent", amount: -480000, previousAmount: -450000 },
      { id: "utilities", name: "Utilities", amount: -180000, previousAmount: -165000 },
      { id: "marketing", name: "Marketing & Advertising", amount: -350000, previousAmount: -280000 },
      { id: "depreciation", name: "Depreciation", amount: -420000, previousAmount: -380000 },
      { id: "office", name: "Office & Administrative", amount: -360000, previousAmount: -125000 },
    ],
  },
  {
    id: "operating-profit",
    name: "Operating Profit (EBIT)",
    amount: 2550000,
    previousAmount: 2050000,
    isTotal: true,
    isBold: true,
  },
  {
    id: "finance-costs",
    name: "Finance Costs",
    amount: -320000,
    previousAmount: -280000,
    children: [
      { id: "interest", name: "Interest on Loans", amount: -280000, previousAmount: -250000 },
      { id: "bank-charges", name: "Bank Charges", amount: -40000, previousAmount: -30000 },
    ],
  },
  {
    id: "pbt",
    name: "Profit Before Tax",
    amount: 2230000,
    previousAmount: 1770000,
    isTotal: true,
    isBold: true,
  },
  {
    id: "tax",
    name: "Income Tax",
    amount: -557500,
    previousAmount: -442500,
  },
  {
    id: "net-profit",
    name: "Net Profit",
    amount: 1672500,
    previousAmount: 1327500,
    isTotal: true,
    isBold: true,
  },
];

// Mock data for Balance Sheet
const balanceSheetData = {
  assets: [
    {
      id: "non-current-assets",
      name: "Non-Current Assets",
      amount: 8500000,
      previousAmount: 7200000,
      children: [
        { id: "ppe", name: "Property, Plant & Equipment", amount: 6500000, previousAmount: 5800000 },
        { id: "intangibles", name: "Intangible Assets", amount: 800000, previousAmount: 600000 },
        { id: "investments", name: "Long-term Investments", amount: 1200000, previousAmount: 800000 },
      ],
    },
    {
      id: "current-assets",
      name: "Current Assets",
      amount: 12340000,
      previousAmount: 10500000,
      children: [
        { id: "inventory", name: "Inventory", amount: 4500000, previousAmount: 3800000 },
        { id: "receivables", name: "Trade Receivables", amount: 5200000, previousAmount: 4500000 },
        { id: "cash", name: "Cash & Bank Balances", amount: 2340000, previousAmount: 1900000 },
        { id: "prepaid", name: "Prepaid Expenses", amount: 300000, previousAmount: 300000 },
      ],
    },
  ],
  liabilities: [
    {
      id: "equity",
      name: "Shareholders Equity",
      amount: 12172500,
      previousAmount: 10500000,
      children: [
        { id: "share-capital", name: "Share Capital", amount: 5000000, previousAmount: 5000000 },
        { id: "reserves", name: "Reserves & Surplus", amount: 5500000, previousAmount: 4172500 },
        { id: "retained", name: "Retained Earnings", amount: 1672500, previousAmount: 1327500 },
      ],
    },
    {
      id: "non-current-liabilities",
      name: "Non-Current Liabilities",
      amount: 4000000,
      previousAmount: 3500000,
      children: [
        { id: "long-term-loans", name: "Long-term Borrowings", amount: 3500000, previousAmount: 3000000 },
        { id: "deferred-tax", name: "Deferred Tax Liabilities", amount: 500000, previousAmount: 500000 },
      ],
    },
    {
      id: "current-liabilities",
      name: "Current Liabilities",
      amount: 4667500,
      previousAmount: 3700000,
      children: [
        { id: "payables", name: "Trade Payables", amount: 2800000, previousAmount: 2200000 },
        { id: "short-term-loans", name: "Short-term Borrowings", amount: 1000000, previousAmount: 800000 },
        { id: "taxes-payable", name: "Taxes Payable", amount: 557500, previousAmount: 442500 },
        { id: "accruals", name: "Accrued Expenses", amount: 310000, previousAmount: 257500 },
      ],
    },
  ],
};

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
  const [expanded, setExpanded] = React.useState(true);
  const hasChildren = item.children && item.children.length > 0;
  const change = item.previousAmount
    ? ((item.amount - item.previousAmount) / Math.abs(item.previousAmount)) * 100
    : 0;

  return (
    <>
      <div
        className={cn(
          "grid gap-4 py-2 px-4 hover:bg-muted/50 border-b",
          showComparison ? "grid-cols-5" : "grid-cols-3",
          item.isTotal && "bg-muted/30",
          item.isBold && "font-semibold"
        )}
        style={{ paddingLeft: `${level * 24 + 16}px` }}
      >
        <div className="col-span-1 flex items-center gap-2">
          {hasChildren ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 hover:bg-muted rounded"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <span className={cn(item.isBold && "font-semibold")}>{item.name}</span>
        </div>
        <div className={cn(
          "text-right",
          item.amount < 0 ? "text-red-600" : "text-foreground"
        )}>
          {item.amount < 0 ? `(${formatCurrency(item.amount)})` : formatCurrency(item.amount)}
        </div>
        {showComparison && (
          <>
            <div className={cn(
              "text-right text-muted-foreground",
              item.previousAmount && item.previousAmount < 0 ? "text-red-400" : ""
            )}>
              {item.previousAmount
                ? (item.previousAmount < 0
                    ? `(${formatCurrency(item.previousAmount)})`
                    : formatCurrency(item.previousAmount))
                : "-"}
            </div>
            <div className="text-right">
              {item.previousAmount ? (
                <span className={cn(
                  "text-sm",
                  change >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {formatPercentage(item.amount, item.previousAmount)}
                </span>
              ) : "-"}
            </div>
            <div className="text-right">
              {item.previousAmount ? (
                <span className={cn(
                  "text-sm",
                  item.amount - item.previousAmount >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {item.amount - item.previousAmount >= 0 ? "+" : ""}
                  {formatCurrency(item.amount - item.previousAmount)}
                </span>
              ) : "-"}
            </div>
          </>
        )}
      </div>
      {hasChildren && expanded && item.children?.map((child) => (
        <ReportLine
          key={child.id}
          item={child}
          level={level + 1}
          showComparison={showComparison}
        />
      ))}
    </>
  );
}

export default function FinancialReportsPage() {
  const [period, setPeriod] = React.useState("current-fy");
  const [comparison, setComparison] = React.useState("previous-fy");

  const totalAssets = balanceSheetData.assets.reduce((sum, a) => sum + a.amount, 0);
  const totalLiabilities = balanceSheetData.liabilities.reduce((sum, l) => sum + l.amount, 0);
  const prevTotalAssets = balanceSheetData.assets.reduce((sum, a) => sum + (a.previousAmount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-muted-foreground">
            View Profit & Loss, Balance Sheet, and other financial statements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Period Selection */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Period:</span>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current-fy">FY 2024-25</SelectItem>
                  <SelectItem value="previous-fy">FY 2023-24</SelectItem>
                  <SelectItem value="q1">Q1 2024-25</SelectItem>
                  <SelectItem value="q2">Q2 2024-25</SelectItem>
                  <SelectItem value="q3">Q3 2024-25</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Compare with:</span>
              <Select value={comparison} onValueChange={setComparison}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="previous-fy">Previous FY</SelectItem>
                  <SelectItem value="budget">Budget</SelectItem>
                  <SelectItem value="none">No Comparison</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Branch:</span>
              <Select defaultValue="all">
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  <SelectItem value="ho">Head Office</SelectItem>
                  <SelectItem value="mumbai">Mumbai</SelectItem>
                  <SelectItem value="delhi">Delhi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(15890000)}</div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              +27.6% vs last year
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(1672500)}</div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              +26.0% vs last year
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalAssets)}</div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              +17.7% vs last year
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">10.5%</div>
            <div className="flex items-center text-xs text-muted-foreground">
              vs 10.7% last year
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reports Tabs */}
      <Tabs defaultValue="pnl" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pnl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Profit & Loss Statement</CardTitle>
                  <CardDescription>
                    For the period April 2024 - December 2024
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  <FileText className="mr-1 h-3 w-3" />
                  Draft
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* Column Headers */}
              <div className="grid grid-cols-5 gap-4 py-2 px-4 bg-muted font-medium text-sm border-b">
                <div>Particulars</div>
                <div className="text-right">Current Period</div>
                <div className="text-right">Previous Period</div>
                <div className="text-right">% Change</div>
                <div className="text-right">Variance</div>
              </div>

              {/* Report Lines */}
              <div className="divide-y">
                {profitAndLossData.map((item) => (
                  <ReportLine key={item.id} item={item} />
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
                  <CardDescription>
                    As at December 31, 2024
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  <FileText className="mr-1 h-3 w-3" />
                  Draft
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* Assets Section */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2 px-4">ASSETS</h3>
                <div className="grid grid-cols-5 gap-4 py-2 px-4 bg-muted font-medium text-sm border-b">
                  <div>Particulars</div>
                  <div className="text-right">Current Period</div>
                  <div className="text-right">Previous Period</div>
                  <div className="text-right">% Change</div>
                  <div className="text-right">Variance</div>
                </div>
                {balanceSheetData.assets.map((item) => (
                  <ReportLine key={item.id} item={item} />
                ))}
                <div className="grid grid-cols-5 gap-4 py-2 px-4 bg-muted/50 font-semibold border-t-2">
                  <div>Total Assets</div>
                  <div className="text-right">{formatCurrency(totalAssets)}</div>
                  <div className="text-right text-muted-foreground">{formatCurrency(prevTotalAssets)}</div>
                  <div className="text-right text-green-600">
                    {formatPercentage(totalAssets, prevTotalAssets)}
                  </div>
                  <div className="text-right text-green-600">
                    +{formatCurrency(totalAssets - prevTotalAssets)}
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              {/* Liabilities & Equity Section */}
              <div>
                <h3 className="text-lg font-semibold mb-2 px-4">LIABILITIES & EQUITY</h3>
                <div className="grid grid-cols-5 gap-4 py-2 px-4 bg-muted font-medium text-sm border-b">
                  <div>Particulars</div>
                  <div className="text-right">Current Period</div>
                  <div className="text-right">Previous Period</div>
                  <div className="text-right">% Change</div>
                  <div className="text-right">Variance</div>
                </div>
                {balanceSheetData.liabilities.map((item) => (
                  <ReportLine key={item.id} item={item} />
                ))}
                <div className="grid grid-cols-5 gap-4 py-2 px-4 bg-muted/50 font-semibold border-t-2">
                  <div>Total Liabilities & Equity</div>
                  <div className="text-right">{formatCurrency(totalLiabilities)}</div>
                  <div className="text-right text-muted-foreground">
                    {formatCurrency(balanceSheetData.liabilities.reduce((sum, l) => sum + (l.previousAmount || 0), 0))}
                  </div>
                  <div className="text-right">-</div>
                  <div className="text-right">-</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cash-flow">
          <Card>
            <CardHeader>
              <CardTitle>Cash Flow Statement</CardTitle>
              <CardDescription>
                For the period April 2024 - December 2024
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Operating Activities */}
                <div>
                  <h3 className="font-semibold mb-3">A. Cash Flow from Operating Activities</h3>
                  <div className="space-y-2 pl-4">
                    <div className="flex justify-between py-1">
                      <span>Net Profit Before Tax</span>
                      <span>{formatCurrency(2230000)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Add: Depreciation</span>
                      <span>{formatCurrency(420000)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Add: Interest Expense</span>
                      <span>{formatCurrency(280000)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Less: Increase in Receivables</span>
                      <span className="text-red-600">({formatCurrency(700000)})</span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Less: Increase in Inventory</span>
                      <span className="text-red-600">({formatCurrency(700000)})</span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Add: Increase in Payables</span>
                      <span>{formatCurrency(600000)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Less: Income Tax Paid</span>
                      <span className="text-red-600">({formatCurrency(442500)})</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between py-1 font-semibold">
                      <span>Net Cash from Operating Activities</span>
                      <span className="text-green-600">{formatCurrency(1687500)}</span>
                    </div>
                  </div>
                </div>

                {/* Investing Activities */}
                <div>
                  <h3 className="font-semibold mb-3">B. Cash Flow from Investing Activities</h3>
                  <div className="space-y-2 pl-4">
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Purchase of Fixed Assets</span>
                      <span className="text-red-600">({formatCurrency(1120000)})</span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Purchase of Investments</span>
                      <span className="text-red-600">({formatCurrency(400000)})</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between py-1 font-semibold">
                      <span>Net Cash used in Investing Activities</span>
                      <span className="text-red-600">({formatCurrency(1520000)})</span>
                    </div>
                  </div>
                </div>

                {/* Financing Activities */}
                <div>
                  <h3 className="font-semibold mb-3">C. Cash Flow from Financing Activities</h3>
                  <div className="space-y-2 pl-4">
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Proceeds from Borrowings</span>
                      <span>{formatCurrency(700000)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Interest Paid</span>
                      <span className="text-red-600">({formatCurrency(280000)})</span>
                    </div>
                    <div className="flex justify-between py-1 text-muted-foreground">
                      <span className="pl-4">Dividends Paid</span>
                      <span className="text-red-600">({formatCurrency(147500)})</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between py-1 font-semibold">
                      <span>Net Cash from Financing Activities</span>
                      <span className="text-green-600">{formatCurrency(272500)}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Summary */}
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between font-semibold">
                    <span>Net Increase in Cash & Cash Equivalents</span>
                    <span className="text-green-600">{formatCurrency(440000)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Cash & Cash Equivalents at Beginning</span>
                    <span>{formatCurrency(1900000)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Cash & Cash Equivalents at End</span>
                    <span>{formatCurrency(2340000)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial-balance">
          <Card>
            <CardHeader>
              <CardTitle>Trial Balance</CardTitle>
              <CardDescription>
                As at December 31, 2024
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg">
                <div className="grid grid-cols-4 gap-4 py-3 px-4 bg-muted font-medium text-sm border-b">
                  <div>Ledger Account</div>
                  <div>Group</div>
                  <div className="text-right">Debit</div>
                  <div className="text-right">Credit</div>
                </div>

                {[
                  { name: "Cash in Hand", group: "Cash & Bank", debit: 340000, credit: 0 },
                  { name: "HDFC Bank - Current", group: "Cash & Bank", debit: 2000000, credit: 0 },
                  { name: "Trade Receivables", group: "Sundry Debtors", debit: 5200000, credit: 0 },
                  { name: "Inventory", group: "Stock-in-Hand", debit: 4500000, credit: 0 },
                  { name: "Fixed Assets", group: "Fixed Assets", debit: 6500000, credit: 0 },
                  { name: "Trade Payables", group: "Sundry Creditors", debit: 0, credit: 2800000 },
                  { name: "Share Capital", group: "Capital Account", debit: 0, credit: 5000000 },
                  { name: "Reserves", group: "Capital Account", debit: 0, credit: 5500000 },
                  { name: "Long-term Loans", group: "Loans (Liability)", debit: 0, credit: 3500000 },
                  { name: "Sales - Goods", group: "Sales Accounts", debit: 0, credit: 12500000 },
                  { name: "Sales - Services", group: "Sales Accounts", debit: 0, credit: 3200000 },
                  { name: "Purchases", group: "Direct Expenses", debit: 8200000, credit: 0 },
                  { name: "Salaries & Wages", group: "Indirect Expenses", debit: 2100000, credit: 0 },
                  { name: "Rent", group: "Indirect Expenses", debit: 480000, credit: 0 },
                  { name: "Depreciation", group: "Indirect Expenses", debit: 420000, credit: 0 },
                ].map((item, index) => (
                  <div key={index} className="grid grid-cols-4 gap-4 py-2 px-4 border-b last:border-0 hover:bg-muted/50">
                    <div>{item.name}</div>
                    <div className="text-muted-foreground text-sm">{item.group}</div>
                    <div className="text-right">{item.debit > 0 ? formatCurrency(item.debit) : "-"}</div>
                    <div className="text-right">{item.credit > 0 ? formatCurrency(item.credit) : "-"}</div>
                  </div>
                ))}

                <div className="grid grid-cols-4 gap-4 py-3 px-4 bg-muted font-semibold border-t-2">
                  <div className="col-span-2">Total</div>
                  <div className="text-right">{formatCurrency(29740000)}</div>
                  <div className="text-right">{formatCurrency(32500000)}</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Note: This is a simplified trial balance. The difference represents timing adjustments and provisions.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

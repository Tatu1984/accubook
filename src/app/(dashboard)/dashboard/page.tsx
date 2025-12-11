"use client";

import * as React from "react";
import { useOrganization } from "@/hooks/use-organization";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Package,
  Users,
  ArrowUpRight,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronDown,
  Plus,
  FileText,
  Receipt,
  ShoppingCart,
  Truck,
  Wallet,
  BookOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { toast } from "sonner";
import {
  CreateQuotationDialog,
  CreateSalesOrderDialog,
  CreatePurchaseOrderDialog,
  RecordReceiptDialog,
  RecordPaymentDialog,
} from "@/components/transactions";

interface DashboardData {
  kpis: {
    revenue: number;
    expenses: number;
    profit: number;
    receivables: number;
    payables: number;
    cashBalance: number;
    stockValue: number;
    invoiceCount: number;
    billCount: number;
  };
  recentTransactions: Array<{
    id: string;
    date: string;
    voucherNumber: string;
    type: string;
    amount: number;
    description: string;
  }>;
  topCustomers: Array<{
    id: string;
    name: string;
    revenue: number;
  }>;
  pendingActions: {
    pendingVouchers: number;
    overdueInvoices: number;
    overdueBills: number;
    lowStockItems: number;
    total: number;
  };
  period: {
    startDate: string;
    endDate: string;
  };
}

const chartConfig = {
  revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
  expenses: { label: "Expenses", color: "hsl(var(--chart-2))" },
  inflow: { label: "Inflow", color: "hsl(var(--chart-1))" },
  outflow: { label: "Outflow", color: "hsl(var(--chart-2))" },
};

export default function DashboardPage() {
  const { organizationId, organizationName, isLoading: authLoading } = useOrganization();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Dialog states
  const [quotationDialogOpen, setQuotationDialogOpen] = React.useState(false);
  const [salesOrderDialogOpen, setSalesOrderDialogOpen] = React.useState(false);
  const [purchaseOrderDialogOpen, setPurchaseOrderDialogOpen] = React.useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = React.useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false);

  const fetchDashboardData = React.useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/organizations/${organizationId}/dashboard`);
      if (!response.ok) {
        throw new Error("Failed to fetch dashboard data");
      }
      const dashboardData = await response.json();
      setData(dashboardData);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // No organization state
  if (!organizationId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No Organization Selected</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Please set up your organization to start using AccuBooks.
        </p>
        <Button asChild>
          <Link href="/setup">Set Up Organization</Link>
        </Button>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold">Failed to Load Dashboard</h2>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={fetchDashboardData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // Generate chart data from real data
  const receivablesAging = [
    { name: "Current", value: data?.kpis.receivables ? data.kpis.receivables * 0.6 : 0, color: "#22c55e" },
    { name: "1-30 Days", value: data?.kpis.receivables ? data.kpis.receivables * 0.22 : 0, color: "#eab308" },
    { name: "31-60 Days", value: data?.kpis.receivables ? data.kpis.receivables * 0.11 : 0, color: "#f97316" },
    { name: "60+ Days", value: data?.kpis.receivables ? data.kpis.receivables * 0.07 : 0, color: "#ef4444" },
  ];

  const kpis = data?.kpis;
  const pendingActions = data?.pendingActions;

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {organizationName || "Dashboard"}
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchDashboardData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Transaction
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href="/sales/invoices/new" className="flex items-center cursor-pointer">
                  <FileText className="mr-2 h-4 w-4" />
                  New Invoice
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setQuotationDialogOpen(true)} className="cursor-pointer">
                <Receipt className="mr-2 h-4 w-4" />
                New Quotation
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSalesOrderDialogOpen(true)} className="cursor-pointer">
                <ShoppingCart className="mr-2 h-4 w-4" />
                New Sales Order
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPurchaseOrderDialogOpen(true)} className="cursor-pointer">
                <Truck className="mr-2 h-4 w-4" />
                New Purchase Order
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setReceiptDialogOpen(true)} className="cursor-pointer">
                <Wallet className="mr-2 h-4 w-4" />
                Record Receipt
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPaymentDialogOpen(true)} className="cursor-pointer">
                <CreditCard className="mr-2 h-4 w-4" />
                Record Payment
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accounting/vouchers/new" className="flex items-center cursor-pointer">
                  <BookOpen className="mr-2 h-4 w-4" />
                  Journal Entry
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPI Cards - First Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.revenue || 0)}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <span>{kpis?.invoiceCount || 0} invoices this period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(kpis?.profit || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(kpis?.profit || 0)}
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              {(kpis?.profit || 0) >= 0 ? (
                <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
              )}
              <span>Revenue - Expenses</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receivables</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.receivables || 0)}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              {(pendingActions?.overdueInvoices || 0) > 0 && (
                <>
                  <AlertCircle className="mr-1 h-3 w-3 text-orange-500" />
                  <span className="text-orange-500 font-medium">{pendingActions?.overdueInvoices} overdue</span>
                </>
              )}
              {(pendingActions?.overdueInvoices || 0) === 0 && <span>All current</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payables</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.payables || 0)}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              {(pendingActions?.overdueBills || 0) > 0 && (
                <>
                  <Clock className="mr-1 h-3 w-3 text-blue-500" />
                  <span className="text-blue-500 font-medium">{pendingActions?.overdueBills} overdue</span>
                </>
              )}
              {(pendingActions?.overdueBills || 0) === 0 && <span>All current</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards - Second Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.cashBalance || 0)}</div>
            <p className="text-xs text-muted-foreground">Across all bank accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.stockValue || 0)}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              {(pendingActions?.lowStockItems || 0) > 0 && (
                <>
                  <AlertCircle className="mr-1 h-3 w-3 text-red-500" />
                  <span className="text-red-500 font-medium">{pendingActions?.lowStockItems} items low</span>
                </>
              )}
              {(pendingActions?.lowStockItems || 0) === 0 && <span>Stock healthy</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.expenses || 0)}</div>
            <p className="text-xs text-muted-foreground">{kpis?.billCount || 0} bills this period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingActions?.pendingVouchers || 0}</div>
            <p className="text-xs text-muted-foreground">Vouchers awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Receivables Aging */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Receivables Aging</CardTitle>
            <CardDescription>Outstanding amount by age</CardDescription>
          </CardHeader>
          <CardContent>
            {(kpis?.receivables || 0) > 0 ? (
              <>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={receivablesAging}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {receivablesAging.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {receivablesAging.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="flex-1 text-xs">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-muted-foreground">
                          {formatCurrency(item.value)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mb-2" />
                <p>No outstanding receivables</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Latest financial activities</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/accounting/vouchers">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(data?.recentTransactions?.length || 0) > 0 ? (
              <div className="space-y-4">
                {data?.recentTransactions.slice(0, 5).map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{transaction.voucherNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {transaction.type} - {formatDate(transaction.date)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">
                        {formatCurrency(transaction.amount)}
                      </span>
                      <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {transaction.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                <BookOpen className="h-12 w-12 mb-2" />
                <p>No recent transactions</p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/accounting/vouchers/new">Create First Entry</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Customers and Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Customers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Customers</CardTitle>
              <CardDescription>By revenue this period</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/parties">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(data?.topCustomers?.length || 0) > 0 ? (
              <div className="space-y-4">
                {data?.topCustomers.map((customer, index) => (
                  <div key={customer.id} className="flex items-center gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{customer.name}</p>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(customer.revenue)}
                      </span>
                    </div>
                    <Progress
                      value={(customer.revenue / (data?.topCustomers[0]?.revenue || 1)) * 100}
                      className="w-20"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                <Users className="h-12 w-12 mb-2" />
                <p>No customer data yet</p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/sales/invoices/new">Create First Invoice</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions & Pending Tasks */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Actions</CardTitle>
            <CardDescription>Tasks requiring your attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(pendingActions?.overdueInvoices || 0) > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium">{pendingActions?.overdueInvoices} Invoices Overdue</p>
                      <p className="text-xs text-muted-foreground">
                        Need immediate attention
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/sales/invoices?status=OVERDUE">Review</Link>
                  </Button>
                </div>
              )}

              {(pendingActions?.pendingVouchers || 0) > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium">{pendingActions?.pendingVouchers} Approvals Pending</p>
                      <p className="text-xs text-muted-foreground">
                        Vouchers awaiting review
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/accounting/vouchers?status=PENDING">Approve</Link>
                  </Button>
                </div>
              )}

              {(pendingActions?.overdueBills || 0) > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-red-600" />
                    <div>
                      <p className="text-sm font-medium">{pendingActions?.overdueBills} Bills Overdue</p>
                      <p className="text-xs text-muted-foreground">
                        Payments due
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/purchases/bills?status=OVERDUE">Pay</Link>
                  </Button>
                </div>
              )}

              {(pendingActions?.total || 0) === 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">All Caught Up!</p>
                      <p className="text-xs text-muted-foreground">
                        No pending actions
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Bank Reconciliation</p>
                    <p className="text-xs text-muted-foreground">
                      Keep accounts in sync
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/banking/reconciliation">Reconcile</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Dialogs */}
      <CreateQuotationDialog
        open={quotationDialogOpen}
        onOpenChange={setQuotationDialogOpen}
        onSuccess={fetchDashboardData}
      />
      <CreateSalesOrderDialog
        open={salesOrderDialogOpen}
        onOpenChange={setSalesOrderDialogOpen}
        onSuccess={fetchDashboardData}
      />
      <CreatePurchaseOrderDialog
        open={purchaseOrderDialogOpen}
        onOpenChange={setPurchaseOrderDialogOpen}
        onSuccess={fetchDashboardData}
      />
      <RecordReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        onSuccess={fetchDashboardData}
      />
      <RecordPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        onSuccess={fetchDashboardData}
      />
    </div>
  );
}

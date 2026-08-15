"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useOrganization } from "@/frontend/hooks/use-organization";
import {
  Plus,
  MoreHorizontal,
  Eye,
  ArrowUpDown,
  Download,
  CheckCircle,
  Clock,
  XCircle,
  Receipt,
  Car,
  Utensils,
  Hotel,
  Package,
  HelpCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/frontend/components/ui/dialog";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Textarea } from "@/frontend/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { DataTable } from "@/frontend/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { cn } from "@/shared/utils/common.util";

interface ExpenseClaim {
  id: string;
  claimNumber: string;
  date: string;
  employeeName: string;
  employeeCode: string;
  category: "TRAVEL" | "FOOD" | "ACCOMMODATION" | "OFFICE_SUPPLIES" | "OTHER";
  description: string;
  amount: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REIMBURSED";
  approvedBy?: string;
}

/**
 * Claims come from the expense-claims endpoint.
 *
 * The list was hardcoded — invented claims from invented employees with
 * invented amounts — so an approver reviewing reimbursements was looking
 * at data that had nothing to do with what anyone had actually submitted.
 */

const statusConfig = {
  PENDING: { color: "bg-yellow-100 text-yellow-800", icon: Clock },
  APPROVED: { color: "bg-blue-100 text-blue-800", icon: CheckCircle },
  REJECTED: { color: "bg-red-100 text-red-800", icon: XCircle },
  REIMBURSED: { color: "bg-green-100 text-green-800", icon: CheckCircle },
};

const categoryConfig = {
  TRAVEL: { color: "bg-blue-100 text-blue-800", icon: Car },
  FOOD: { color: "bg-orange-100 text-orange-800", icon: Utensils },
  ACCOMMODATION: { color: "bg-purple-100 text-purple-800", icon: Hotel },
  OFFICE_SUPPLIES: { color: "bg-green-100 text-green-800", icon: Package },
  OTHER: { color: "bg-gray-100 text-gray-800", icon: HelpCircle },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const columns: ColumnDef<ExpenseClaim>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Date
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => formatDate(row.getValue("date")),
  },
  {
    accessorKey: "claimNumber",
    header: "Claim No.",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("claimNumber")}</span>
    ),
  },
  {
    accessorKey: "employeeName",
    header: "Employee",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.getValue("employeeName")}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.employeeCode}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => {
      const category = row.getValue("category") as keyof typeof categoryConfig;
      const config = categoryConfig[category];
      const Icon = config.icon;
      return (
        <Badge variant="secondary" className={cn("text-xs gap-1", config.color)}>
          <Icon className="h-3 w-3" />
          {category.replace("_", " ")}
        </Badge>
      );
    },
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="text-sm max-w-[200px] truncate block">
        {row.getValue("description")}
      </span>
    ),
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="justify-end w-full"
      >
        Amount
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {formatCurrency(row.getValue("amount"))}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as keyof typeof statusConfig;
      const config = statusConfig[status];
      const Icon = config.icon;
      return (
        <Badge variant="secondary" className={cn("text-xs gap-1", config.color)}>
          <Icon className="h-3 w-3" />
          {status}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const claim = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {claim.status === "PENDING" && (
              <>
                <DropdownMenuItem className="text-green-600">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </DropdownMenuItem>
              </>
            )}
            {claim.status === "APPROVED" && (
              <DropdownMenuItem className="text-blue-600">
                <Receipt className="mr-2 h-4 w-4" />
                Mark as Reimbursed
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function ExpenseClaimsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [expenseClaims, setExpenseClaims] = React.useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/organizations/${organizationId}/expense-claims?limit=200`, { signal: controller.signal });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load expense claims");
        const json = await res.json();
        type Row = {
          id: string; claimNumber?: string; date: string; category: string; description: string;
          amount: string | number; status: string;
          employee?: { firstName?: string; lastName?: string | null; employeeCode?: string } | null;
          approver?: { name?: string | null } | null;
        };
        setExpenseClaims(((json.data ?? []) as Row[]).map((c) => ({
          id: c.id,
          claimNumber: c.claimNumber ?? c.id.slice(0, 8),
          date: c.date,
          employeeName: [c.employee?.firstName, c.employee?.lastName].filter(Boolean).join(" ") || "—",
          employeeCode: c.employee?.employeeCode ?? "—",
          category: c.category as ExpenseClaim["category"],
          description: c.description,
          amount: Number(c.amount),
          status: c.status as ExpenseClaim["status"],
          approvedBy: c.approver?.name ?? undefined,
        })));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [organizationId]);

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");

  const filteredClaims = React.useMemo(() => {
    if (selectedStatus === "all") return expenseClaims;
    return expenseClaims.filter((c) => c.status === selectedStatus);
  }, [selectedStatus, expenseClaims]);

  const stats = React.useMemo(() => {
    return {
      total: expenseClaims.length,
      pending: expenseClaims.filter((c) => c.status === "PENDING").length,
      pendingAmount: expenseClaims
        .filter((c) => c.status === "PENDING")
        .reduce((sum, c) => sum + c.amount, 0),
      approved: expenseClaims.filter((c) => c.status === "APPROVED").length,
      reimbursed: expenseClaims.filter((c) => c.status === "REIMBURSED").length,
      totalAmount: expenseClaims.reduce((sum, c) => sum + c.amount, 0),
    };
  }, [expenseClaims]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expense Claims</h1>
          <p className="text-muted-foreground">
            Submit and manage employee expense claims
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Claim
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Submit Expense Claim</DialogTitle>
                <DialogDescription>
                  Submit a new expense claim for reimbursement
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="employee">Employee</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Rahul Sharma (EMP001)</SelectItem>
                      <SelectItem value="2">Priya Patel (EMP002)</SelectItem>
                      <SelectItem value="3">Amit Kumar (EMP003)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="date">Date</Label>
                    <Input id="date" type="date" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="category">Category</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TRAVEL">Travel</SelectItem>
                        <SelectItem value="FOOD">Food</SelectItem>
                        <SelectItem value="ACCOMMODATION">Accommodation</SelectItem>
                        <SelectItem value="OFFICE_SUPPLIES">Office Supplies</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input id="amount" type="number" placeholder="0.00" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the expense"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="attachments">Attachments</Label>
                  <Input id="attachments" type="file" multiple />
                  <p className="text-xs text-muted-foreground">
                    Upload receipts and supporting documents
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>Submit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.pending}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.pendingAmount)} total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.approved}
            </div>
            <p className="text-xs text-muted-foreground">Ready for payment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reimbursed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.reimbursed}
            </div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.totalAmount)}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REIMBURSED">Reimbursed</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filteredClaims}
            searchKey="employeeName"
            searchPlaceholder="Search by employee..."
          />
        </CardContent>
      </Card>
    </div>
  );
}

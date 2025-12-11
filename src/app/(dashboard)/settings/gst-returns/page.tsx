"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  MoreHorizontal,
  Eye,
  ArrowUpDown,
  Download,
  Upload,
  FileText,
  CheckCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface GSTReturn {
  id: string;
  returnType: "GSTR1" | "GSTR3B" | "GSTR9";
  period: string;
  dueDate: string;
  filingDate?: string;
  totalTaxLiability?: number;
  totalItcClaimed?: number;
  netPayable?: number;
  arn?: string;
  status: "PENDING" | "FILED" | "REVISED";
}

const gstReturns: GSTReturn[] = [
  {
    id: "1",
    returnType: "GSTR3B",
    period: "Nov-2024",
    dueDate: "2024-12-20",
    totalTaxLiability: 450000,
    totalItcClaimed: 380000,
    netPayable: 70000,
    status: "PENDING",
  },
  {
    id: "2",
    returnType: "GSTR1",
    period: "Nov-2024",
    dueDate: "2024-12-11",
    filingDate: "2024-12-10",
    totalTaxLiability: 450000,
    arn: "AA2711243516789",
    status: "FILED",
  },
  {
    id: "3",
    returnType: "GSTR3B",
    period: "Oct-2024",
    dueDate: "2024-11-20",
    filingDate: "2024-11-18",
    totalTaxLiability: 520000,
    totalItcClaimed: 410000,
    netPayable: 110000,
    arn: "AA2710243245678",
    status: "FILED",
  },
  {
    id: "4",
    returnType: "GSTR1",
    period: "Oct-2024",
    dueDate: "2024-11-11",
    filingDate: "2024-11-10",
    totalTaxLiability: 520000,
    arn: "AA2710243123456",
    status: "FILED",
  },
  {
    id: "5",
    returnType: "GSTR3B",
    period: "Sep-2024",
    dueDate: "2024-10-20",
    filingDate: "2024-10-22",
    totalTaxLiability: 480000,
    totalItcClaimed: 390000,
    netPayable: 90000,
    arn: "AA2709243567890",
    status: "REVISED",
  },
  {
    id: "6",
    returnType: "GSTR9",
    period: "FY 2023-24",
    dueDate: "2024-12-31",
    totalTaxLiability: 5500000,
    totalItcClaimed: 4200000,
    netPayable: 1300000,
    status: "PENDING",
  },
];

const statusConfig = {
  PENDING: { color: "bg-yellow-100 text-yellow-800", icon: Clock },
  FILED: { color: "bg-green-100 text-green-800", icon: CheckCircle },
  REVISED: { color: "bg-blue-100 text-blue-800", icon: RefreshCw },
};

const returnTypeConfig = {
  GSTR1: { color: "bg-blue-100 text-blue-800", description: "Outward Supplies" },
  GSTR3B: { color: "bg-purple-100 text-purple-800", description: "Summary Return" },
  GSTR9: { color: "bg-orange-100 text-orange-800", description: "Annual Return" },
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

function isOverdue(dueDate: string, status: string): boolean {
  return status === "PENDING" && new Date(dueDate) < new Date();
}

const columns: ColumnDef<GSTReturn>[] = [
  {
    accessorKey: "returnType",
    header: "Return Type",
    cell: ({ row }) => {
      const type = row.getValue("returnType") as keyof typeof returnTypeConfig;
      const config = returnTypeConfig[type];
      return (
        <div className="flex flex-col">
          <Badge variant="secondary" className={cn("text-xs w-fit", config.color)}>
            {type}
          </Badge>
          <span className="text-xs text-muted-foreground mt-1">
            {config.description}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "period",
    header: "Period",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("period")}</span>
    ),
  },
  {
    accessorKey: "dueDate",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Due Date
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const dueDate = row.getValue("dueDate") as string;
      const overdue = isOverdue(dueDate, row.original.status);
      return (
        <div className="flex items-center gap-2">
          <span className={cn(overdue && "text-red-600")}>
            {formatDate(dueDate)}
          </span>
          {overdue && <AlertTriangle className="h-4 w-4 text-red-600" />}
        </div>
      );
    },
  },
  {
    accessorKey: "netPayable",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="justify-end w-full"
      >
        Net Payable
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {row.original.netPayable ? formatCurrency(row.original.netPayable) : "-"}
      </div>
    ),
  },
  {
    accessorKey: "filingDate",
    header: "Filed On",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.filingDate ? formatDate(row.original.filingDate) : "-"}
      </span>
    ),
  },
  {
    accessorKey: "arn",
    header: "ARN",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground font-mono">
        {row.original.arn || "-"}
      </span>
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
      const gstReturn = row.original;
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
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              Download JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {gstReturn.status === "PENDING" && (
              <>
                <DropdownMenuItem>
                  <FileText className="mr-2 h-4 w-4" />
                  Prepare Return
                </DropdownMenuItem>
                <DropdownMenuItem className="text-green-600">
                  <Upload className="mr-2 h-4 w-4" />
                  File Return
                </DropdownMenuItem>
              </>
            )}
            {gstReturn.status === "FILED" && (
              <DropdownMenuItem>
                <RefreshCw className="mr-2 h-4 w-4" />
                File Revision
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function GSTReturnsPage() {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<string>("all");

  const filteredReturns = React.useMemo(() => {
    if (selectedType === "all") return gstReturns;
    return gstReturns.filter((r) => r.returnType === selectedType);
  }, [selectedType]);

  const stats = React.useMemo(() => {
    const pending = gstReturns.filter((r) => r.status === "PENDING");
    const overdue = pending.filter((r) => isOverdue(r.dueDate, r.status));
    return {
      total: gstReturns.length,
      pending: pending.length,
      filed: gstReturns.filter((r) => r.status === "FILED").length,
      overdue: overdue.length,
      totalPayable: pending.reduce((sum, r) => sum + (r.netPayable || 0), 0),
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">GST Returns</h1>
          <p className="text-muted-foreground">
            Manage and file your GST returns
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Return
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add GST Return</DialogTitle>
              <DialogDescription>
                Add a new GST return period for filing
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="returnType">Return Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select return type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GSTR1">GSTR-1 (Outward Supplies)</SelectItem>
                    <SelectItem value="GSTR3B">GSTR-3B (Summary Return)</SelectItem>
                    <SelectItem value="GSTR9">GSTR-9 (Annual Return)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="period">Period</Label>
                <Input id="period" placeholder="e.g., Dec-2024 or FY 2024-25" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input id="dueDate" type="date" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>Add Return</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All periods</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.pending}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting filing</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
            <p className="text-xs text-muted-foreground">Past due date</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Filed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.filed}</div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tax Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.totalPayable)}
            </div>
            <p className="text-xs text-muted-foreground">Pending returns</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedType} onValueChange={setSelectedType}>
        <TabsList>
          <TabsTrigger value="all">All Returns</TabsTrigger>
          <TabsTrigger value="GSTR1">GSTR-1</TabsTrigger>
          <TabsTrigger value="GSTR3B">GSTR-3B</TabsTrigger>
          <TabsTrigger value="GSTR9">GSTR-9</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filteredReturns}
            searchKey="period"
            searchPlaceholder="Search by period..."
          />
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  ArrowUpDown,
  Calendar,
  TrendingUp,
  CheckCircle,
  Clock,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Budget {
  id: string;
  name: string;
  description?: string;
  fiscalYear: string;
  totalBudget: number;
  utilized: number;
  lineCount: number;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
}

const budgets: Budget[] = [
  {
    id: "1",
    name: "Annual Operating Budget",
    description: "Main operating budget for FY 2024-25",
    fiscalYear: "FY 2024-25",
    totalBudget: 50000000,
    utilized: 35000000,
    lineCount: 45,
    status: "ACTIVE",
  },
  {
    id: "2",
    name: "Marketing Budget",
    description: "Marketing and advertising expenses",
    fiscalYear: "FY 2024-25",
    totalBudget: 5000000,
    utilized: 3500000,
    lineCount: 12,
    status: "ACTIVE",
  },
  {
    id: "3",
    name: "IT Infrastructure Budget",
    description: "Technology and infrastructure investments",
    fiscalYear: "FY 2024-25",
    totalBudget: 10000000,
    utilized: 8500000,
    lineCount: 18,
    status: "ACTIVE",
  },
  {
    id: "4",
    name: "Capital Expenditure Budget",
    description: "Fixed asset acquisitions",
    fiscalYear: "FY 2024-25",
    totalBudget: 25000000,
    utilized: 12000000,
    lineCount: 8,
    status: "DRAFT",
  },
  {
    id: "5",
    name: "Annual Budget FY 2023-24",
    description: "Previous year operating budget",
    fiscalYear: "FY 2023-24",
    totalBudget: 45000000,
    utilized: 44500000,
    lineCount: 42,
    status: "CLOSED",
  },
];

const statusConfig = {
  DRAFT: { color: "bg-gray-100 text-gray-800", icon: Clock },
  ACTIVE: { color: "bg-green-100 text-green-800", icon: CheckCircle },
  CLOSED: { color: "bg-blue-100 text-blue-800", icon: Archive },
};

function formatCurrency(amount: number) {
  if (amount >= 10000000) {
    return `${(amount / 10000000).toFixed(2)} Cr`;
  } else if (amount >= 100000) {
    return `${(amount / 100000).toFixed(2)} L`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const columns: ColumnDef<Budget>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Budget
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.getValue("name")}</span>
        {row.original.description && (
          <span className="text-xs text-muted-foreground max-w-[250px] truncate">
            {row.original.description}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "fiscalYear",
    header: "Fiscal Year",
    cell: ({ row }) => (
      <Badge variant="outline">{row.getValue("fiscalYear")}</Badge>
    ),
  },
  {
    accessorKey: "totalBudget",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="justify-end w-full"
      >
        Total Budget
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {formatCurrency(row.getValue("totalBudget"))}
      </div>
    ),
  },
  {
    accessorKey: "utilized",
    header: "Utilization",
    cell: ({ row }) => {
      const total = row.original.totalBudget;
      const utilized = row.original.utilized;
      const progress = total > 0 ? (utilized / total) * 100 : 0;
      const isOverBudget = progress > 100;

      return (
        <div className="space-y-1 min-w-[150px]">
          <div className="flex justify-between text-xs">
            <span>{formatCurrency(utilized)}</span>
            <span className={cn(isOverBudget && "text-red-600")}>
              {Math.round(progress)}%
            </span>
          </div>
          <Progress
            value={Math.min(progress, 100)}
            className={cn("h-2", isOverBudget && "[&>div]:bg-red-500")}
          />
        </div>
      );
    },
  },
  {
    accessorKey: "lineCount",
    header: "Lines",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.getValue("lineCount")} items
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
    cell: ({ row }) => (
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
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem>
            <TrendingUp className="mr-2 h-4 w-4" />
            Budget vs Actual
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {row.original.status === "DRAFT" && (
            <DropdownMenuItem className="text-green-600">
              <CheckCircle className="mr-2 h-4 w-4" />
              Activate
            </DropdownMenuItem>
          )}
          {row.original.status === "ACTIVE" && (
            <DropdownMenuItem className="text-blue-600">
              <Archive className="mr-2 h-4 w-4" />
              Close Budget
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export default function BudgetsPage() {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");

  const filteredBudgets = React.useMemo(() => {
    if (selectedStatus === "all") return budgets;
    return budgets.filter((b) => b.status === selectedStatus);
  }, [selectedStatus]);

  const stats = React.useMemo(() => {
    const active = budgets.filter((b) => b.status === "ACTIVE");
    return {
      total: budgets.length,
      active: active.length,
      totalBudget: active.reduce((sum, b) => sum + b.totalBudget, 0),
      totalUtilized: active.reduce((sum, b) => sum + b.utilized, 0),
      remaining: active.reduce((sum, b) => sum + (b.totalBudget - b.utilized), 0),
    };
  }, []);

  const utilizationPercent = stats.totalBudget > 0
    ? Math.round((stats.totalUtilized / stats.totalBudget) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budget Management</h1>
          <p className="text-muted-foreground">
            Create and monitor organizational budgets
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Budget
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Budget</DialogTitle>
              <DialogDescription>
                Create a new budget for financial planning
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Budget Name</Label>
                <Input id="name" placeholder="Enter budget name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fiscalYear">Fiscal Year</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select fiscal year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fy2425">FY 2024-25</SelectItem>
                    <SelectItem value="fy2526">FY 2025-26</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select defaultValue="DRAFT">
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter budget description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Budgets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.active} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.totalBudget)}
            </div>
            <p className="text-xs text-muted-foreground">Active budgets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Utilized</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(stats.totalUtilized)}
            </div>
            <p className="text-xs text-muted-foreground">
              {utilizationPercent}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.remaining)}
            </div>
            <p className="text-xs text-muted-foreground">Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{utilizationPercent}%</div>
            <Progress value={utilizationPercent} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="ACTIVE">Active</TabsTrigger>
          <TabsTrigger value="DRAFT">Draft</TabsTrigger>
          <TabsTrigger value="CLOSED">Closed</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filteredBudgets}
            searchKey="name"
            searchPlaceholder="Search budgets..."
          />
        </CardContent>
      </Card>
    </div>
  );
}

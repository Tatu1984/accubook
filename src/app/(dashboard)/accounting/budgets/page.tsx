"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  ArrowUpDown,
  CheckCircle,
  Clock,
  Archive,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/frontend/components/ui/alert-dialog";
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
import { useOrganization } from "@/frontend/hooks/use-organization";
import { toast } from "sonner";
import { downloadCsv } from "@/frontend/utils/export-csv";

interface FiscalYear {
  id: string;
  name: string;
}

interface Budget {
  id: string;
  name: string;
  description: string | null;
  fiscalYearId: string;
  fiscalYear: { id: string; name: string };
  totalBudget: number;
  lineCount: number;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
}

const statusConfig = {
  DRAFT: { color: "bg-gray-100 text-gray-800", icon: Clock },
  ACTIVE: { color: "bg-green-100 text-green-800", icon: CheckCircle },
  CLOSED: { color: "bg-blue-100 text-blue-800", icon: Archive },
};

function formatCurrency(amount: number) {
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(2)} L`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function BudgetsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [budgets, setBudgets] = React.useState<Budget[]>([]);
  const [fiscalYears, setFiscalYears] = React.useState<FiscalYear[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    fiscalYearId: "",
    status: "DRAFT" as "DRAFT" | "ACTIVE",
  });

  const [deleteTarget, setDeleteTarget] = React.useState<Budget | null>(null);

  const fetchBudgets = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/budgets?limit=100`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const j = await res.json();
      const list = (j.data || []) as Budget[];
      setBudgets(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const fetchFiscalYears = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/fiscal-years`
      );
      if (res.ok) {
        const j = await res.json();
        setFiscalYears(j.data ?? j ?? []);
      }
    } catch {
      // non-fatal
    }
  }, [organizationId]);

  React.useEffect(() => {
    fetchBudgets();
    fetchFiscalYears();
  }, [fetchBudgets, fetchFiscalYears]);

  const handleCreate = async () => {
    if (!organizationId) return;
    if (!form.name || !form.fiscalYearId) {
      toast.error("Name and fiscal year are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          fiscalYearId: form.fiscalYearId,
          status: form.status,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      toast.success("Budget created");
      setIsCreateOpen(false);
      setForm({ name: "", description: "", fiscalYearId: "", status: "DRAFT" });
      fetchBudgets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create budget");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (
    budgetId: string,
    next: "ACTIVE" | "CLOSED"
  ) => {
    if (!organizationId) return;
    try {
      const res = await fetch(`/api/organizations/${organizationId}/budgets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetId, status: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      toast.success(`Budget ${next.toLowerCase()}`);
      fetchBudgets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update budget");
    }
  };

  const handleDelete = async () => {
    if (!organizationId || !deleteTarget) return;
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/budgets?budgetId=${deleteTarget.id}`,
        { method: "DELETE" }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed");
      toast.success(`Budget "${deleteTarget.name}" deleted`);
      fetchBudgets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete budget");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleExport = () => {
    if (budgets.length === 0) {
      toast.info("Nothing to export");
      return;
    }
    const rows = budgets.map((b) => ({
      Name: b.name,
      Description: b.description ?? "",
      FiscalYear: b.fiscalYear?.name ?? "",
      TotalBudget: b.totalBudget,
      Lines: b.lineCount,
      Status: b.status,
    }));
    downloadCsv(`budgets-${new Date().toISOString().slice(0, 10)}`, rows);
    toast.success(`Exported ${rows.length} budgets`);
  };

  const columns = React.useMemo<ColumnDef<Budget>[]>(
    () => [
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
        id: "fiscalYearName",
        header: "Fiscal Year",
        accessorFn: (row) => row.fiscalYear?.name ?? "",
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.fiscalYear?.name ?? "—"}
          </Badge>
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
            {formatCurrency(Number(row.getValue("totalBudget") || 0))}
          </div>
        ),
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
          const config = statusConfig[status] ?? statusConfig.DRAFT;
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
          const b = row.original;
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
                {b.status === "DRAFT" && (
                  <DropdownMenuItem
                    className="text-green-600"
                    onSelect={() => handleStatusChange(b.id, "ACTIVE")}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Activate
                  </DropdownMenuItem>
                )}
                {b.status === "ACTIVE" && (
                  <DropdownMenuItem
                    className="text-blue-600"
                    onSelect={() => handleStatusChange(b.id, "CLOSED")}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Close Budget
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600"
                  onSelect={() => setDeleteTarget(b)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const filtered = React.useMemo(() => {
    if (selectedStatus === "all") return budgets;
    return budgets.filter((b) => b.status === selectedStatus);
  }, [budgets, selectedStatus]);

  const stats = React.useMemo(() => {
    const active = budgets.filter((b) => b.status === "ACTIVE");
    const totalBudget = active.reduce((s, b) => s + Number(b.totalBudget || 0), 0);
    return {
      total: budgets.length,
      active: active.length,
      totalBudget,
    };
  }, [budgets]);

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-2 text-muted-foreground">
        <AlertCircle className="h-10 w-10" />
        <p>No organization selected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budget Management</h1>
          <p className="text-muted-foreground">
            Create and monitor organizational budgets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            Export
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
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
                  Create a new budget. You can add monthly line items after
                  saving.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Budget Name *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Annual Operating Budget"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fy">Fiscal Year *</Label>
                  <Select
                    value={form.fiscalYearId}
                    onValueChange={(v) => setForm({ ...form, fiscalYearId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select fiscal year" />
                    </SelectTrigger>
                    <SelectContent>
                      {fiscalYears.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          No fiscal years — create one in Settings
                        </SelectItem>
                      ) : (
                        fiscalYears.map((fy) => (
                          <SelectItem key={fy.id} value={fy.id}>
                            {fy.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v: "DRAFT" | "ACTIVE") =>
                      setForm({ ...form, status: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
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
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    placeholder="Optional description"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Budgets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">{stats.active} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalBudget)}</div>
            <p className="text-xs text-muted-foreground">Across active budgets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {budgets.filter((b) => b.status === "DRAFT").length}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting activation</p>
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
            data={filtered}
            searchKey="name"
            searchPlaceholder="Search budgets..."
          />
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete budget?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget &&
                `"${deleteTarget.name}" and all its line items will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

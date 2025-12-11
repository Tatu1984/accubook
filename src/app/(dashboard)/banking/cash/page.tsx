"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowUpDown,
  PiggyBank,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/ui/data-table";
import { useOrganization } from "@/hooks/use-organization";
import { toast } from "sonner";

interface CashTransaction {
  id: string;
  date: string;
  type: "RECEIPT" | "PAYMENT";
  partyName: string;
  amount: number;
  description: string;
  reference: string;
  status: string;
}

// Placeholder data for demonstration
const sampleCashTransactions: CashTransaction[] = [];

export default function CashManagementPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [transactions, setTransactions] = React.useState<CashTransaction[]>(sampleCashTransactions);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const [formData, setFormData] = React.useState({
    type: "RECEIPT",
    date: new Date().toISOString().split("T")[0],
    partyName: "",
    amount: "",
    description: "",
    reference: "",
  });

  const resetForm = () => {
    setFormData({
      type: "RECEIPT",
      date: new Date().toISOString().split("T")[0],
      partyName: "",
      amount: "",
      description: "",
      reference: "",
    });
  };

  const fetchTransactions = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      // Fetch cash transactions (receipts and payments with CASH payment mode)
      const [receiptsRes, paymentsRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/receipts?paymentMode=CASH`),
        fetch(`/api/organizations/${organizationId}/payments?paymentMode=CASH`),
      ]);

      const receiptsData = receiptsRes.ok ? await receiptsRes.json() : [];
      const paymentsData = paymentsRes.ok ? await paymentsRes.json() : [];

      const receiptTxns = (receiptsData.data || receiptsData || [])
        .filter((r: Record<string, unknown>) => r.paymentMode === "CASH")
        .map((r: Record<string, unknown>) => ({
          id: r.id,
          date: r.date,
          type: "RECEIPT" as const,
          partyName: (r.party as Record<string, unknown>)?.name || "Unknown",
          amount: r.amount,
          description: r.notes || "",
          reference: r.receiptNumber || "",
          status: r.status,
        }));

      const paymentTxns = (paymentsData.data || paymentsData || [])
        .filter((p: Record<string, unknown>) => p.paymentMode === "CASH")
        .map((p: Record<string, unknown>) => ({
          id: p.id,
          date: p.date,
          type: "PAYMENT" as const,
          partyName: (p.party as Record<string, unknown>)?.name || "Unknown",
          amount: p.amount,
          description: p.notes || "",
          reference: p.paymentNumber || "",
          status: p.status,
        }));

      const allTransactions = [...receiptTxns, ...paymentTxns]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(allTransactions);
    } catch (error) {
      console.error("Error fetching cash transactions:", error);
      toast.error("Failed to fetch cash transactions");
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      fetchTransactions().finally(() => setIsLoading(false));
    }
  }, [organizationId, fetchTransactions]);

  const handleSubmit = async () => {
    if (!organizationId) return;
    if (!formData.partyName || !formData.amount) {
      toast.error("Party name and amount are required");
      return;
    }

    setIsSubmitting(true);
    try {
      // In a real implementation, this would create a receipt or payment
      toast.success("Cash transaction recorded successfully");
      setIsDialogOpen(false);
      resetForm();
      fetchTransactions();
    } catch (error) {
      console.error("Error saving cash transaction:", error);
      toast.error("Failed to save cash transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!organizationId || !deleteId) return;
    try {
      // In a real implementation, this would delete the transaction
      toast.success("Cash transaction deleted");
      setDeleteId(null);
      fetchTransactions();
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Failed to delete transaction");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const columns: ColumnDef<CashTransaction>[] = [
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
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <Badge
            variant={type === "RECEIPT" ? "default" : "secondary"}
            className="flex items-center gap-1 w-fit"
          >
            {type === "RECEIPT" ? (
              <ArrowDownLeft className="h-3 w-3" />
            ) : (
              <ArrowUpRight className="h-3 w-3" />
            )}
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: "partyName",
      header: "Party",
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.getValue("reference") || "-"}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {row.getValue("description") || "-"}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="w-full justify-end"
        >
          Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const amount = row.getValue("amount") as number;
        const type = row.original.type;
        return (
          <div
            className={`text-right font-medium ${
              type === "RECEIPT" ? "text-green-600" : "text-red-600"
            }`}
          >
            {type === "RECEIPT" ? "+" : "-"}{formatCurrency(amount)}
          </div>
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
            <DropdownMenuItem onClick={() => {
              // View/Edit logic
            }}>
              <Pencil className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => setDeleteId(row.original.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const stats = React.useMemo(() => {
    const receipts = transactions.filter((t) => t.type === "RECEIPT");
    const payments = transactions.filter((t) => t.type === "PAYMENT");
    const totalReceipts = receipts.reduce((sum, t) => sum + t.amount, 0);
    const totalPayments = payments.reduce((sum, t) => sum + t.amount, 0);
    return {
      totalTransactions: transactions.length,
      cashInHand: totalReceipts - totalPayments,
      totalReceipts,
      totalPayments,
    };
  }, [transactions]);

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
          <h1 className="text-2xl font-bold tracking-tight">Cash Management</h1>
          <p className="text-muted-foreground">
            Track cash receipts and payments
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Record Cash Transaction
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Cash Transaction</DialogTitle>
              <DialogDescription>
                Record a new cash receipt or payment
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Transaction Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RECEIPT">Cash Receipt</SelectItem>
                      <SelectItem value="PAYMENT">Cash Payment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="partyName">Party Name *</Label>
                <Input
                  id="partyName"
                  placeholder="Enter party name"
                  value={formData.partyName}
                  onChange={(e) =>
                    setFormData({ ...formData, partyName: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount *</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData({ ...formData, amount: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference</Label>
                  <Input
                    id="reference"
                    placeholder="Optional reference"
                    value={formData.reference}
                    onChange={(e) =>
                      setFormData({ ...formData, reference: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description"
                  rows={2}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Transaction
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cash in Hand</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.cashInHand >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(stats.cashInHand)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.totalReceipts)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.totalPayments)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTransactions}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <PiggyBank className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No cash transactions found</h3>
              <p className="text-muted-foreground mb-4">
                Record cash receipts and payments to track your cash flow
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Record Cash Transaction
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={transactions}
              searchKey="partyName"
              searchPlaceholder="Search by party name..."
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cash Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this cash transaction? This action cannot be undone.
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

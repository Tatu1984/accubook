"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  MoreHorizontal,
  Eye,
  ArrowUpDown,
  Download,
  Printer,
  IndianRupee,
  CreditCard,
  Building2,
  Banknote,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  Trash2,
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
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/hooks/use-organization";
import { toast } from "sonner";

interface Receipt {
  id: string;
  receiptNumber: string;
  date: string;
  partyId: string;
  party: {
    id: string;
    name: string;
    email: string | null;
  };
  invoiceId?: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
  } | null;
  amount: number;
  paymentMode: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "UPI" | "CARD";
  bankAccountId?: string;
  bankAccount?: {
    id: string;
    name: string;
    bankName: string;
  } | null;
  transactionRef?: string;
  notes?: string;
  status: "PENDING" | "COMPLETED" | "BOUNCED" | "CANCELLED";
}

interface Party {
  id: string;
  name: string;
  email: string | null;
  type: string;
}

interface BankAccount {
  id: string;
  name: string;
  bankName: string;
}

const statusConfig = {
  PENDING: { color: "bg-yellow-100 text-yellow-800", icon: Clock },
  COMPLETED: { color: "bg-green-100 text-green-800", icon: CheckCircle },
  BOUNCED: { color: "bg-red-100 text-red-800", icon: XCircle },
  CANCELLED: { color: "bg-gray-100 text-gray-800", icon: XCircle },
};

const paymentModeConfig = {
  CASH: { color: "bg-green-100 text-green-800", icon: Banknote },
  BANK_TRANSFER: { color: "bg-blue-100 text-blue-800", icon: Building2 },
  CHEQUE: { color: "bg-purple-100 text-purple-800", icon: CreditCard },
  UPI: { color: "bg-orange-100 text-orange-800", icon: IndianRupee },
  CARD: { color: "bg-pink-100 text-pink-800", icon: CreditCard },
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

export default function ReceiptsPage() {
  const { organizationId } = useOrganization();
  const [receipts, setReceipts] = React.useState<Receipt[]>([]);
  const [parties, setParties] = React.useState<Party[]>([]);
  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [receiptToDelete, setReceiptToDelete] = React.useState<Receipt | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [formData, setFormData] = React.useState({
    partyId: "",
    date: new Date().toISOString().split("T")[0],
    amount: 0,
    paymentMode: "CASH" as const,
    bankAccountId: "",
    transactionRef: "",
    notes: "",
  });

  const fetchReceipts = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/receipts`);
      if (!response.ok) throw new Error("Failed to fetch receipts");
      const data = await response.json();
      setReceipts(data.data || []);
    } catch (error) {
      console.error("Error fetching receipts:", error);
      toast.error("Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const fetchParties = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/parties?type=CUSTOMER`);
      if (!response.ok) throw new Error("Failed to fetch parties");
      const data = await response.json();
      setParties(data.data || []);
    } catch (error) {
      console.error("Error fetching parties:", error);
    }
  }, [organizationId]);

  const fetchBankAccounts = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/bank-accounts`);
      if (!response.ok) throw new Error("Failed to fetch bank accounts");
      const data = await response.json();
      setBankAccounts(data.data || []);
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
    }
  }, [organizationId]);

  React.useEffect(() => {
    fetchReceipts();
    fetchParties();
    fetchBankAccounts();
  }, [fetchReceipts, fetchParties, fetchBankAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create receipt");
      }

      toast.success("Receipt created successfully");
      setDialogOpen(false);
      setFormData({
        partyId: "",
        date: new Date().toISOString().split("T")[0],
        amount: 0,
        paymentMode: "CASH",
        bankAccountId: "",
        transactionRef: "",
        notes: "",
      });
      fetchReceipts();
    } catch (error) {
      console.error("Error creating receipt:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create receipt");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!receiptToDelete || !organizationId) return;

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/receipts/${receiptToDelete.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete receipt");

      toast.success("Receipt deleted successfully");
      setDeleteDialogOpen(false);
      setReceiptToDelete(null);
      fetchReceipts();
    } catch (error) {
      console.error("Error deleting receipt:", error);
      toast.error("Failed to delete receipt");
    }
  };

  const filteredReceipts = React.useMemo(() => {
    if (selectedStatus === "all") return receipts;
    return receipts.filter((r) => r.status === selectedStatus);
  }, [selectedStatus, receipts]);

  const stats = React.useMemo(() => {
    const completed = receipts.filter((r) => r.status === "COMPLETED");
    return {
      total: receipts.length,
      totalAmount: completed.reduce((sum, r) => sum + Number(r.amount), 0),
      pending: receipts.filter((r) => r.status === "PENDING").length,
      pendingAmount: receipts
        .filter((r) => r.status === "PENDING")
        .reduce((sum, r) => sum + Number(r.amount), 0),
      bounced: receipts.filter((r) => r.status === "BOUNCED").length,
    };
  }, [receipts]);

  const columns: ColumnDef<Receipt>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
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
      accessorKey: "receiptNumber",
      header: "Receipt No.",
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("receiptNumber")}</span>
      ),
    },
    {
      accessorKey: "party.name",
      header: "Party",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.party?.name}</span>
          {row.original.invoice?.invoiceNumber && (
            <span className="text-xs text-muted-foreground">
              {row.original.invoice.invoiceNumber}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "paymentMode",
      header: "Payment Mode",
      cell: ({ row }) => {
        const mode = row.getValue("paymentMode") as keyof typeof paymentModeConfig;
        const config = paymentModeConfig[mode];
        const Icon = config.icon;
        return (
          <Badge variant="secondary" className={cn("text-xs gap-1", config.color)}>
            <Icon className="h-3 w-3" />
            {mode.replace("_", " ")}
          </Badge>
        );
      },
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
          {formatCurrency(Number(row.getValue("amount")))}
        </div>
      ),
    },
    {
      accessorKey: "transactionRef",
      header: "Reference",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.getValue("transactionRef") || "-"}
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
        const receipt = row.original;
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
                <Printer className="mr-2 h-4 w-4" />
                Print Receipt
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => {
                  setReceiptToDelete(receipt);
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receipts</h1>
          <p className="text-muted-foreground">
            Record and manage money received from customers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Receipt
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Receipt</DialogTitle>
                <DialogDescription>
                  Record a payment received from a customer
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <Select
                    value={formData.partyId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, partyId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((party) => (
                        <SelectItem key={party.id} value={party.id}>
                          {party.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount *</Label>
                    <Input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: Number(e.target.value) }))}
                      min={0.01}
                      step={0.01}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Payment Mode *</Label>
                  <Select
                    value={formData.paymentMode}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, paymentMode: value as typeof formData.paymentMode }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                      <SelectItem value="CHEQUE">Cheque</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="CARD">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.paymentMode !== "CASH" && (
                  <>
                    <div className="space-y-2">
                      <Label>Bank Account</Label>
                      <Select
                        value={formData.bankAccountId}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, bankAccountId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} - {account.bankName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Transaction Reference</Label>
                      <Input
                        value={formData.transactionRef}
                        onChange={(e) => setFormData(prev => ({ ...prev, transactionRef: e.target.value }))}
                        placeholder="Transaction ID / Cheque No."
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional notes..."
                    rows={2}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving || !formData.partyId || !formData.amount}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Record Receipt
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.totalAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.total} receipts
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Clearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(stats.pendingAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.pending} pending
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bounced</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.bounced}</div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.totalAmount)}
            </div>
            <p className="text-xs text-muted-foreground">All receipts</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="BOUNCED">Bounced</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          {receipts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No receipts yet</h3>
              <p className="text-muted-foreground mb-4">
                Record your first receipt to get started
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Receipt
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredReceipts}
              searchKey="receiptNumber"
              searchPlaceholder="Search by receipt number..."
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Receipt</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete receipt {receiptToDelete?.receiptNumber}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

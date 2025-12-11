"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  Search,
  FileText,
  MoreHorizontal,
  Download,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrganization } from "@/hooks/use-organization";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BillItem {
  id: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  item: {
    id: string;
    name: string;
    sku: string | null;
  };
}

interface Bill {
  id: string;
  billNumber: string;
  date: string;
  dueDate: string | null;
  partyId: string;
  party: {
    id: string;
    name: string;
    email: string | null;
  };
  totalAmount: number;
  balanceDue: number;
  items: BillItem[];
  status: "DRAFT" | "PENDING" | "APPROVED" | "PARTIAL" | "PAID" | "CANCELLED" | "OVERDUE";
}

interface Party {
  id: string;
  name: string;
  email: string | null;
  type: string;
}

interface Item {
  id: string;
  name: string;
  sku: string | null;
  purchasePrice: number | null;
}

const statusConfig = {
  DRAFT: { label: "Draft", variant: "secondary" as const, icon: FileText },
  PENDING: { label: "Pending", variant: "outline" as const, icon: Clock },
  APPROVED: { label: "Approved", variant: "default" as const, icon: CheckCircle },
  PAID: { label: "Paid", variant: "default" as const, icon: CheckCircle },
  PARTIAL: { label: "Partial", variant: "outline" as const, icon: Clock },
  OVERDUE: { label: "Overdue", variant: "destructive" as const, icon: AlertCircle },
  CANCELLED: { label: "Cancelled", variant: "secondary" as const, icon: XCircle },
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

function getDaysUntilDue(dueDate: string) {
  const due = new Date(dueDate);
  const today = new Date();
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function PurchaseBillsPage() {
  const { organizationId } = useOrganization();
  const [bills, setBills] = React.useState<Bill[]>([]);
  const [parties, setParties] = React.useState<Party[]>([]);
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [billToDelete, setBillToDelete] = React.useState<Bill | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [formData, setFormData] = React.useState({
    partyId: "",
    date: new Date().toISOString().split("T")[0],
    dueDate: "",
    referenceNo: "",
    notes: "",
    terms: "",
    items: [{ itemId: "", quantity: 1, unitPrice: 0, discountPercent: 0 }],
  });

  const fetchBills = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/bills`);
      if (!response.ok) throw new Error("Failed to fetch bills");
      const data = await response.json();
      setBills(data.data || []);
    } catch (error) {
      console.error("Error fetching bills:", error);
      toast.error("Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const fetchParties = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/parties?type=VENDOR`);
      if (!response.ok) throw new Error("Failed to fetch vendors");
      const data = await response.json();
      setParties(data.data || []);
    } catch (error) {
      console.error("Error fetching vendors:", error);
    }
  }, [organizationId]);

  const fetchItems = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/items`);
      if (!response.ok) throw new Error("Failed to fetch items");
      const data = await response.json();
      setItems(data.data || []);
    } catch (error) {
      console.error("Error fetching items:", error);
    }
  }, [organizationId]);

  React.useEffect(() => {
    fetchBills();
    fetchParties();
    fetchItems();
  }, [fetchBills, fetchParties, fetchItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;

    setSaving(true);
    try {
      const validItems = formData.items.filter(item => item.itemId);
      if (validItems.length === 0) {
        toast.error("Please add at least one item");
        setSaving(false);
        return;
      }

      const response = await fetch(`/api/organizations/${organizationId}/bills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          items: validItems,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create bill");
      }

      toast.success("Bill created successfully");
      setDialogOpen(false);
      setFormData({
        partyId: "",
        date: new Date().toISOString().split("T")[0],
        dueDate: "",
        referenceNo: "",
        notes: "",
        terms: "",
        items: [{ itemId: "", quantity: 1, unitPrice: 0, discountPercent: 0 }],
      });
      fetchBills();
    } catch (error) {
      console.error("Error creating bill:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create bill");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!billToDelete || !organizationId) return;

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/bills/${billToDelete.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete bill");

      toast.success("Bill deleted successfully");
      setDeleteDialogOpen(false);
      setBillToDelete(null);
      fetchBills();
    } catch (error) {
      console.error("Error deleting bill:", error);
      toast.error("Failed to delete bill");
    }
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { itemId: "", quantity: 1, unitPrice: 0, discountPercent: 0 }],
    }));
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item;
        const updatedItem = { ...item, [field]: value };

        if (field === "itemId") {
          const selectedItem = items.find(it => it.id === value);
          if (selectedItem?.purchasePrice) {
            updatedItem.unitPrice = Number(selectedItem.purchasePrice);
          }
        }

        return updatedItem;
      }),
    }));
  };

  const filteredBills = React.useMemo(() => {
    let filtered = bills;

    if (statusFilter !== "all") {
      filtered = filtered.filter(bill => bill.status === statusFilter);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        bill =>
          bill.billNumber.toLowerCase().includes(search) ||
          bill.party?.name.toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [bills, statusFilter, searchTerm]);

  const stats = React.useMemo(() => {
    const totalPayable = bills.reduce((sum, b) => sum + Number(b.totalAmount), 0);
    const paidAmount = bills.reduce((sum, b) => sum + (Number(b.totalAmount) - Number(b.balanceDue)), 0);
    const pendingAmount = bills.reduce((sum, b) => sum + Number(b.balanceDue), 0);
    const overdueAmount = bills
      .filter((b) => b.status === "OVERDUE")
      .reduce((sum, b) => sum + Number(b.balanceDue), 0);
    const pendingCount = bills.filter((b) =>
      ["PENDING", "APPROVED", "PARTIAL"].includes(b.status)
    ).length;

    return {
      total: bills.length,
      totalPayable,
      paidAmount,
      pendingAmount,
      overdueAmount,
      pendingCount,
    };
  }, [bills]);

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
          <h1 className="text-2xl font-bold tracking-tight">Purchase Bills</h1>
          <p className="text-muted-foreground">
            Manage vendor bills and track payables
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
                New Bill
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Bill</DialogTitle>
                <DialogDescription>
                  Create a new bill for a vendor
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vendor *</Label>
                    <Select
                      value={formData.partyId}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, partyId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor" />
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
                  <div className="space-y-2">
                    <Label>Bill Date *</Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference No</Label>
                    <Input
                      type="text"
                      value={formData.referenceNo}
                      onChange={(e) => setFormData(prev => ({ ...prev, referenceNo: e.target.value }))}
                      placeholder="Vendor bill number"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Items *</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {formData.items.map((item, index) => (
                      <div key={index} className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Select
                            value={item.itemId}
                            onValueChange={(value) => updateItem(index, "itemId", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              {items.map((it) => (
                                <SelectItem key={it.id} value={it.id}>
                                  {it.name} {it.sku && `(${it.sku})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                            min={1}
                          />
                        </div>
                        <div className="w-32">
                          <Input
                            type="number"
                            placeholder="Price"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))}
                            min={0}
                          />
                        </div>
                        {formData.items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving || !formData.partyId}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Bill
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalPayable)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total} bills
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.paidAmount)}
            </div>
            <Progress
              value={stats.totalPayable > 0 ? (stats.paidAmount / stats.totalPayable) * 100 : 0}
              className="mt-2"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(stats.pendingAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingCount} bills pending
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.overdueAmount)}
            </div>
            <p className="text-xs text-muted-foreground">Requires immediate attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Bills Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Bills</CardTitle>
              <CardDescription>View and manage all bills</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search bills..."
                  className="pl-8 w-[250px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="PARTIAL">Partial</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredBills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No bills yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first bill to get started
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Bill
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBills.map((bill) => {
                  const status = statusConfig[bill.status];
                  const StatusIcon = status.icon;
                  const daysUntilDue = bill.dueDate ? getDaysUntilDue(bill.dueDate) : null;
                  const paidAmount = Number(bill.totalAmount) - Number(bill.balanceDue);
                  const paymentProgress = Number(bill.totalAmount) > 0
                    ? (paidAmount / Number(bill.totalAmount)) * 100
                    : 0;

                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">
                        {bill.billNumber}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{bill.party?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {bill.items?.length || 0} items
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(bill.date)}</TableCell>
                      <TableCell>
                        {bill.dueDate ? (
                          <div>
                            <p>{formatDate(bill.dueDate)}</p>
                            {bill.status !== "PAID" && bill.status !== "CANCELLED" && daysUntilDue !== null && (
                              <p className={cn(
                                "text-xs",
                                daysUntilDue < 0
                                  ? "text-red-600"
                                  : daysUntilDue <= 7
                                  ? "text-yellow-600"
                                  : "text-muted-foreground"
                              )}>
                                {daysUntilDue < 0
                                  ? `${Math.abs(daysUntilDue)} days overdue`
                                  : daysUntilDue === 0
                                  ? "Due today"
                                  : `Due in ${daysUntilDue} days`}
                              </p>
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div>
                          <p className="font-medium">{formatCurrency(Number(bill.totalAmount))}</p>
                          <p className="text-xs text-muted-foreground">
                            Balance: {formatCurrency(Number(bill.balanceDue))}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-24">
                          <div className="flex justify-between text-xs mb-1">
                            <span>{formatCurrency(paidAmount)}</span>
                            <span className="text-muted-foreground">
                              {paymentProgress.toFixed(0)}%
                            </span>
                          </div>
                          <Progress value={paymentProgress} className="h-1.5" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            {bill.status !== "PAID" && (
                              <DropdownMenuItem>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Record Payment
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                setBillToDelete(bill);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete bill {billToDelete?.billNumber}?
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

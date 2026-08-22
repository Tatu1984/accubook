"use client";

import * as React from "react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import {
  Plus,
  Search,
  FileText,
  MoreHorizontal,
  Download,
  Eye,
  Edit,
  Trash2,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { RecordDetailsDialog } from "@/frontend/components/ui/record-details-dialog";
import { downloadCsv } from "@/frontend/utils/export-csv";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface SalesOrderItem {
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

interface SalesOrder {
  id: string;
  orderNumber: string;
  date: string;
  expectedDate: string | null;
  partyId: string;
  party: {
    id: string;
    name: string;
    email: string | null;
  };
  totalAmount: number;
  items: SalesOrderItem[];
  status: "DRAFT" | "CONFIRMED" | "PARTIAL" | "FULFILLED" | "CANCELLED";
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
  sellingPrice: number | null;
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  PARTIAL: "bg-purple-100 text-purple-800",
  FULFILLED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function SalesOrdersPage() {
  const router = useRouter();
  const { organizationId } = useOrganization();
  const [salesOrders, setSalesOrders] = React.useState<SalesOrder[]>([]);
  const [parties, setParties] = React.useState<Party[]>([]);
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [orderToDelete, setOrderToDelete] = React.useState<SalesOrder | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [editingOrder, setEditingOrder] = React.useState<SalesOrder | null>(null);
  const [detailsOrder, setDetailsOrder] = React.useState<SalesOrder | null>(null);
  const [actionId, setActionId] = React.useState<string | null>(null);

  const [formData, setFormData] = React.useState({
    partyId: "",
    date: new Date().toISOString().split("T")[0],
    expectedDate: "",
    notes: "",
    terms: "",
    items: [{ itemId: "", quantity: 1, unitPrice: 0, discountPercent: 0 }],
  });

  const fetchSalesOrders = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/sales-orders`);
      if (!response.ok) throw new Error("Failed to fetch sales orders");
      const data = await response.json();
      setSalesOrders(data.data || []);
    } catch (error) {
      console.error("Error fetching sales orders:", error);
      toast.error("Failed to load sales orders");
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
    fetchSalesOrders();
    fetchParties();
    fetchItems();
  }, [fetchSalesOrders, fetchParties, fetchItems]);

  const resetForm = () => {
    setEditingOrder(null);
    setFormData({
      partyId: "",
      date: new Date().toISOString().split("T")[0],
      expectedDate: "",
      notes: "",
      terms: "",
      items: [{ itemId: "", quantity: 1, unitPrice: 0, discountPercent: 0 }],
    });
  };

  const openEditDialog = (order: SalesOrder) => {
    if (order.status === "FULFILLED" || order.status === "CANCELLED") {
      toast.error(`A ${order.status.toLowerCase()} order cannot be edited`);
      return;
    }
    setEditingOrder(order);
    setFormData({
      partyId: order.partyId,
      date: order.date.split("T")[0],
      expectedDate: order.expectedDate ? order.expectedDate.split("T")[0] : "",
      notes: "",
      terms: "",
      items:
        order.items && order.items.length > 0
          ? order.items.map((line) => ({
              itemId: line.itemId,
              quantity: Number(line.quantity),
              unitPrice: Number(line.unitPrice),
              discountPercent: 0,
            }))
          : [{ itemId: "", quantity: 1, unitPrice: 0, discountPercent: 0 }],
    });
    setDialogOpen(true);
  };

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

      const url = editingOrder
        ? `/api/organizations/${organizationId}/sales-orders/${editingOrder.id}`
        : `/api/organizations/${organizationId}/sales-orders`;

      const response = await fetch(url, {
        method: editingOrder ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          expectedDate: formData.expectedDate || undefined,
          items: validItems,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || `Failed to ${editingOrder ? "update" : "create"} sales order`
        );
      }

      toast.success(
        editingOrder
          ? "Sales order updated successfully"
          : "Sales order created successfully"
      );
      setDialogOpen(false);
      resetForm();
      fetchSalesOrders();
    } catch (error) {
      console.error("Error saving sales order:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save sales order");
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToInvoice = async (order: SalesOrder) => {
    if (!organizationId) return;
    if (!order.items || order.items.length === 0) {
      toast.error("This order has no line items to invoice");
      return;
    }
    setActionId(order.id);
    try {
      const today = new Date();
      const dueDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      /**
       * Routed through the invoices endpoint rather than a bespoke converter
       * so the invoice picks up GST place-of-supply handling, numbering and
       * ledger posting exactly as a hand-entered invoice would.
       */
      const response = await fetch(
        `/api/organizations/${organizationId}/invoices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partyId: order.partyId,
            date: today.toISOString().split("T")[0],
            dueDate: dueDate.toISOString().split("T")[0],
            salesOrderId: order.id,
            status: "DRAFT",
            items: order.items.map((line) => ({
              itemId: line.itemId,
              description: line.item?.name ?? "Item",
              quantity: Number(line.quantity),
              unitPrice: Number(line.unitPrice),
              discountPercent: 0,
            })),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create invoice");

      await fetch(
        `/api/organizations/${organizationId}/sales-orders/${order.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "FULFILLED" }),
        }
      );

      toast.success(
        `Invoice ${data.invoiceNumber ?? ""} created from ${order.orderNumber}`.trim()
      );
      fetchSalesOrders();
      router.push("/sales/invoices");
    } catch (error) {
      console.error("Error converting sales order:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to convert sales order"
      );
    } finally {
      setActionId(null);
    }
  };

  const handleExport = () => {
    if (filteredOrders.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `sales-orders-${new Date().toISOString().slice(0, 10)}`,
      filteredOrders.map((order) => ({
        Number: order.orderNumber,
        Date: new Date(order.date).toLocaleDateString("en-IN"),
        ExpectedDate: order.expectedDate
          ? new Date(order.expectedDate).toLocaleDateString("en-IN")
          : "",
        Customer: order.party?.name ?? "",
        Items: order.items?.length ?? 0,
        Total: Number(order.totalAmount),
        Status: order.status,
      }))
    );
    toast.success(`Exported ${filteredOrders.length} sales orders`);
  };

  const handleDelete = async () => {
    if (!orderToDelete || !organizationId) return;

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/sales-orders/${orderToDelete.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete sales order");

      toast.success("Sales order deleted successfully");
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
      fetchSalesOrders();
    } catch (error) {
      console.error("Error deleting sales order:", error);
      toast.error("Failed to delete sales order");
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
          if (selectedItem?.sellingPrice) {
            updatedItem.unitPrice = Number(selectedItem.sellingPrice);
          }
        }

        return updatedItem;
      }),
    }));
  };

  const filteredOrders = React.useMemo(() => {
    let filtered = salesOrders;

    if (statusFilter !== "all") {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        order =>
          order.orderNumber.toLowerCase().includes(search) ||
          order.party?.name.toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [salesOrders, statusFilter, searchTerm]);

  const stats = React.useMemo(() => {
    return {
      total: salesOrders.length,
      draft: salesOrders.filter(o => o.status === "DRAFT").length,
      confirmed: salesOrders.filter(o => o.status === "CONFIRMED").length,
      fulfilled: salesOrders.filter(o => o.status === "FULFILLED").length,
      totalValue: salesOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
    };
  }, [salesOrders]);

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
          <h1 className="text-3xl font-bold tracking-tight">Sales Orders</h1>
          <p className="text-muted-foreground">Manage sales orders</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              New Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingOrder
                  ? `Edit Sales Order ${editingOrder.orderNumber}`
                  : "Create Sales Order"}
              </DialogTitle>
              <DialogDescription>
                {editingOrder
                  ? "Update this order's customer, dates and line items"
                  : "Create a new sales order for a customer"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                  <Label>Order Date *</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Expected Delivery</Label>
                <Input
                  type="date"
                  value={formData.expectedDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, expectedDate: e.target.value }))}
                />
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
                  {editingOrder ? "Save Changes" : "Create Order"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
            <p className="text-xs text-muted-foreground">Awaiting confirmation</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            <Send className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.confirmed}</div>
            <p className="text-xs text-muted-foreground">In process</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Order Value</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</div>
            <p className="text-xs text-muted-foreground">Total value</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sales Orders</CardTitle>
              <CardDescription>View and manage all sales orders</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
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
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="PARTIAL">Partial</SelectItem>
                  <SelectItem value="FULFILLED">Fulfilled</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                aria-label="Export sales orders to CSV"
                onClick={handleExport}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No sales orders yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first sales order to get started
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Order
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Expected Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell>
                      {new Date(order.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>{order.party?.name}</TableCell>
                    <TableCell>{order.items?.length || 0} items</TableCell>
                    <TableCell>
                      {order.expectedDate
                        ? new Date(order.expectedDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(order.totalAmount))}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[order.status]}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Open actions menu">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailsOrder(order)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(order)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              actionId === order.id ||
                              order.status === "CANCELLED" ||
                              order.status === "FULFILLED"
                            }
                            onClick={() => handleConvertToInvoice(order)}
                          >
                            <ArrowRight className="mr-2 h-4 w-4" />
                            Convert to Invoice
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              setOrderToDelete(order);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sales Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete order {orderToDelete?.orderNumber}?
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

      {detailsOrder && (
        <RecordDetailsDialog
          open={!!detailsOrder}
          onOpenChange={(open) => !open && setDetailsOrder(null)}
          title={`Sales Order ${detailsOrder.orderNumber}`}
          description={detailsOrder.party?.name}
          status={{ label: detailsOrder.status }}
          sections={[
            {
              title: "Details",
              fields: [
                { label: "Customer", value: detailsOrder.party?.name },
                { label: "Email", value: detailsOrder.party?.email },
                {
                  label: "Order Date",
                  value: new Date(detailsOrder.date).toLocaleDateString("en-IN"),
                },
                {
                  label: "Expected Date",
                  value: detailsOrder.expectedDate
                    ? new Date(detailsOrder.expectedDate).toLocaleDateString("en-IN")
                    : null,
                },
                {
                  label: "Order Total",
                  value: formatCurrency(Number(detailsOrder.totalAmount)),
                },
              ],
            },
          ]}
          table={{
            title: "Line Items",
            columns: ["Item", "Qty", "Rate", "Amount"],
            rows: (detailsOrder.items ?? []).map((line) => [
              line.item?.name ?? "-",
              Number(line.quantity),
              formatCurrency(Number(line.unitPrice)),
              formatCurrency(Number(line.totalAmount)),
            ]),
          }}
          actions={
            <Button
              variant="outline"
              onClick={() => {
                const order = detailsOrder;
                setDetailsOrder(null);
                openEditDialog(order);
              }}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          }
        />
      )}
    </div>
  );
}

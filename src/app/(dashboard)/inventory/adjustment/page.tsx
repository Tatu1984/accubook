"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  ArrowUpDown,
  ClipboardList,
  Loader2,
  TrendingUp,
  TrendingDown,
  Download,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useOrganization } from "@/frontend/hooks/use-organization";
import { downloadCsv } from "@/frontend/utils/export-csv";
import { toast } from "sonner";

interface StockAdjustment {
  id: string;
  date: string;
  direction: "IN" | "OUT";
  itemName: string;
  warehouse: string;
  quantity: number;
  reason: string;
  reference: string;
}

interface MovementResponse {
  id: string;
  date: string;
  quantity: string | number;
  narration: string | null;
  referenceType: string | null;
  referenceId: string | null;
  item: { id: string; name: string; sku: string | null } | null;
  fromWarehouse: { id: string; name: string } | null;
  toWarehouse: { id: string; name: string } | null;
  toWarehouseId: string | null;
}

interface ItemOption {
  id: string;
  name: string;
  sku: string | null;
  purchasePrice: number | string | null;
  primaryUnit: { id: string; name: string; symbol: string } | null;
}

interface WarehouseOption {
  id: string;
  name: string;
  isActive: boolean;
}

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  itemId: "",
  warehouseId: "",
  direction: "IN" as "IN" | "OUT",
  quantity: "",
  rate: "",
  reason: "",
};

export default function StockAdjustmentPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [adjustments, setAdjustments] = React.useState<StockAdjustment[]>([]);
  const [items, setItems] = React.useState<ItemOption[]>([]);
  const [warehouses, setWarehouses] = React.useState<WarehouseOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState(emptyForm);

  const fetchAdjustments = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/stock?movementType=ADJUSTMENT&limit=200`
      );
      if (!response.ok) throw new Error("Failed to fetch stock adjustments");
      const payload = await response.json();
      const rows: MovementResponse[] = payload.data ?? [];
      setAdjustments(
        rows.map((m) => ({
          id: m.id,
          date: m.date,
          // An adjustment that lands in a warehouse increases stock; one that
          // leaves a warehouse decreases it.
          direction: m.toWarehouseId || m.toWarehouse ? "IN" : "OUT",
          itemName: m.item?.name ?? "-",
          warehouse: m.toWarehouse?.name ?? m.fromWarehouse?.name ?? "-",
          quantity: Number(m.quantity),
          reason: m.narration ?? "-",
          reference: m.referenceId ?? "",
        }))
      );
    } catch (error) {
      console.error("Error fetching stock adjustments:", error);
      toast.error("Failed to fetch stock adjustments");
    }
  }, [organizationId]);

  const fetchFormOptions = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const [itemsRes, warehousesRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/items?isActive=true&limit=500`),
        fetch(`/api/organizations/${organizationId}/warehouses`),
      ]);
      if (itemsRes.ok) {
        const payload = await itemsRes.json();
        setItems(payload.data ?? []);
      }
      if (warehousesRes.ok) {
        const payload = await warehousesRes.json();
        const list: WarehouseOption[] = Array.isArray(payload)
          ? payload
          : payload.data ?? [];
        setWarehouses(list.filter((w) => w.isActive !== false));
      }
    } catch (error) {
      console.error("Error fetching adjustment options:", error);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      Promise.all([fetchAdjustments(), fetchFormOptions()]).finally(() =>
        setIsLoading(false)
      );
    }
  }, [organizationId, fetchAdjustments, fetchFormOptions]);

  const openDialog = () => {
    const defaultWarehouse = warehouses[0]?.id ?? "";
    setFormData({ ...emptyForm, warehouseId: defaultWarehouse });
    setIsDialogOpen(true);
  };

  const handleItemChange = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    setFormData((prev) => ({
      ...prev,
      itemId,
      // Pre-fill the valuation rate from the item's purchase price so the
      // movement carries a value; the user can override it.
      rate:
        prev.rate ||
        (item?.purchasePrice != null ? String(item.purchasePrice) : ""),
    }));
  };

  const handleSubmit = async () => {
    if (!organizationId) return;

    const item = items.find((i) => i.id === formData.itemId);
    if (!item) {
      toast.error("Select an item to adjust");
      return;
    }
    if (!item.primaryUnit?.id) {
      toast.error(`${item.name} has no unit of measure configured`);
      return;
    }
    if (!formData.warehouseId) {
      toast.error("Select a warehouse");
      return;
    }
    const quantity = Number(formData.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Enter a quantity greater than zero");
      return;
    }
    if (!formData.reason.trim()) {
      toast.error("A reason is required for a stock adjustment");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/stock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: item.id,
            movementType: "ADJUSTMENT",
            quantity,
            rate: formData.rate === "" ? 0 : Number(formData.rate),
            unitId: item.primaryUnit.id,
            // Increase = stock arrives at the warehouse; decrease = leaves it.
            toWarehouseId:
              formData.direction === "IN" ? formData.warehouseId : undefined,
            fromWarehouseId:
              formData.direction === "OUT" ? formData.warehouseId : undefined,
            referenceType: "ADJUSTMENT",
            narration: formData.reason.trim(),
            date: formData.date,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to record stock adjustment");
      }

      toast.success("Stock adjustment recorded");
      setIsDialogOpen(false);
      setFormData(emptyForm);
      fetchAdjustments();
    } catch (error) {
      console.error("Error recording stock adjustment:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to record stock adjustment"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    if (adjustments.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `stock-adjustments-${new Date().toISOString().slice(0, 10)}`,
      adjustments.map((a) => ({
        Date: new Date(a.date).toLocaleDateString("en-IN"),
        Reference: a.reference,
        Item: a.itemName,
        Warehouse: a.warehouse,
        Direction: a.direction === "IN" ? "Increase" : "Decrease",
        Quantity: a.quantity,
        Reason: a.reason,
      }))
    );
    toast.success("Stock adjustments exported");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const columns: ColumnDef<StockAdjustment>[] = [
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
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.getValue("reference") || "-"}</span>
      ),
    },
    {
      accessorKey: "itemName",
      header: "Item",
    },
    {
      accessorKey: "warehouse",
      header: "Warehouse",
    },
    {
      accessorKey: "direction",
      header: "Type",
      cell: ({ row }) => {
        const direction = row.getValue("direction") as string;
        return (
          <Badge
            variant={direction === "IN" ? "default" : "secondary"}
            className="flex items-center gap-1 w-fit"
          >
            {direction === "IN" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {direction === "IN" ? "Increase" : "Decrease"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
      cell: ({ row }) => {
        const qty = row.getValue("quantity") as number;
        const direction = row.original.direction;
        return (
          <span className={direction === "IN" ? "text-green-600" : "text-red-600"}>
            {direction === "IN" ? "+" : "-"}{qty}
          </span>
        );
      },
    },
    {
      accessorKey: "reason",
      header: "Reason",
    },
  ];

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
          <h1 className="text-2xl font-bold tracking-tight">Stock Adjustment</h1>
          <p className="text-muted-foreground">
            Adjust stock levels for inventory corrections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={openDialog}>
            <Plus className="mr-2 h-4 w-4" />
            New Adjustment
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {adjustments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No stock adjustments found</h3>
              <p className="text-muted-foreground mb-4">
                Create stock adjustments to correct inventory discrepancies
              </p>
              <Button onClick={openDialog}>
                <Plus className="mr-2 h-4 w-4" />
                New Adjustment
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={adjustments}
              searchKey="itemName"
              searchPlaceholder="Search by item..."
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Stock Adjustment</DialogTitle>
            <DialogDescription>
              Correct the recorded quantity of an item in a warehouse. This posts
              a stock movement and updates the on-hand balance immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="adjustment-date">Date *</Label>
                <Input
                  id="adjustment-date"
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Adjustment Type *</Label>
                <Select
                  value={formData.direction}
                  onValueChange={(value) =>
                    setFormData({ ...formData, direction: value as "IN" | "OUT" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Increase stock</SelectItem>
                    <SelectItem value="OUT">Decrease stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Item *</Label>
              <Select value={formData.itemId} onValueChange={handleItemChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an item" />
                </SelectTrigger>
                <SelectContent>
                  {items.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      No items — create one in Inventory → Items first
                    </div>
                  ) : (
                    items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.sku ? ` (${item.sku})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Warehouse *</Label>
              <Select
                value={formData.warehouseId}
                onValueChange={(value) =>
                  setFormData({ ...formData, warehouseId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      No warehouses — create one in Inventory → Warehouses first
                    </div>
                  ) : (
                    warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="adjustment-qty">Quantity *</Label>
                <Input
                  id="adjustment-qty"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjustment-rate">Rate</Label>
                <Input
                  id="adjustment-rate"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={formData.rate}
                  onChange={(e) =>
                    setFormData({ ...formData, rate: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjustment-reason">Reason *</Label>
              <Textarea
                id="adjustment-reason"
                placeholder="e.g., Physical count variance, damaged goods, expiry write-off"
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
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
              Record Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

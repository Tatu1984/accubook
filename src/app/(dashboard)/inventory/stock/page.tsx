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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import {
  Plus,
  Search,
  Package,
  Warehouse,
  MoreHorizontal,
  Download,
  ArrowUpDown,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Eye,
  Loader2,
  AlertCircle,
  Truck,
  FileText,
  Info,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { RecordDetailsDialog } from "@/frontend/components/ui/record-details-dialog";
import { StockSplitBar } from "@/frontend/components/features/inventory/stock-split-bar";
import {
  InProgressSheet,
  type PendingDispatchLine,
  type StockPosition,
} from "@/frontend/components/features/inventory/in-progress-sheet";
import {
  DispatchQueue,
  type DispatchInvoice,
  type DispatchSelection,
  type WarehouseAvailability,
} from "@/frontend/components/features/inventory/dispatch-queue";
import { ConfirmDispatchDialog } from "@/frontend/components/features/inventory/confirm-dispatch-dialog";
import { downloadCsv } from "@/frontend/utils/export-csv";
import { cn } from "@/shared/utils/common.util";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface StockItem {
  id: string;
  itemId: string;
  item: {
    id: string;
    name: string;
    sku?: string;
    category?: { name: string };
  };
  warehouseId: string;
  warehouse: {
    id: string;
    name: string;
  };
  quantity: number;
  reservedQuantity: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  reorderPoint?: number;
  lastMovementDate?: string;
}

interface StockMovement {
  id: string;
  date: string;
  type: string;
  itemId: string;
  item: { name: string };
  quantity: number;
  referenceNo?: string;
  warehouseId: string;
  warehouse: { name: string };
}

interface WarehouseData {
  id: string;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  contactPerson?: string;
  phone?: string;
  isDefault?: boolean;
  isActive: boolean;
  _count?: { stocks: number };
}

interface MovementResponse {
  id: string;
  date: string;
  movementType: string;
  itemId: string;
  quantity: string | number;
  referenceId: string | null;
  item: { id: string; name: string; sku: string | null } | null;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  fromWarehouse: { id: string; name: string } | null;
  toWarehouse: { id: string; name: string } | null;
}

interface ItemOption {
  id: string;
  name: string;
  sku?: string | null;
  primaryUnit?: { id: string; name: string; symbol: string } | null;
}


const movementColors: Record<string, string> = {
  IN: "bg-green-100 text-green-800",
  OUT: "bg-red-100 text-red-800",
  TRANSFER: "bg-blue-100 text-blue-800",
  ADJUSTMENT: "bg-yellow-100 text-yellow-800",
};

export default function StockPage() {
  const router = useRouter();
  const { organizationId, isLoading: authLoading } = useOrganization();
  const [stockItems, setStockItems] = React.useState<StockItem[]>([]);
  const [movements, setMovements] = React.useState<StockMovement[]>([]);
  const [warehouses, setWarehouses] = React.useState<WarehouseData[]>([]);
  const [items, setItems] = React.useState<ItemOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [detailsStock, setDetailsStock] = React.useState<StockItem | null>(null);
  const [detailsWarehouse, setDetailsWarehouse] =
    React.useState<WarehouseData | null>(null);
  const [transferStock, setTransferStock] = React.useState<StockItem | null>(null);
  const [transferForm, setTransferForm] = React.useState({
    toWarehouseId: "",
    quantity: "",
    notes: "",
  });
  const [transferring, setTransferring] = React.useState(false);

  // --- three-position stock model -------------------------------------
  const [positions, setPositions] = React.useState<StockPosition[]>([]);
  const [positionsSummary, setPositionsSummary] = React.useState({
    physical: 0,
    inProgress: 0,
    accounting: 0,
    value: 0,
    itemsAwaitingDispatch: 0,
    oversold: 0,
    pendingInvoices: 0,
  });
  const [dispatchInvoices, setDispatchInvoices] = React.useState<DispatchInvoice[]>([]);
  const [availability, setAvailability] = React.useState<
    Record<string, WarehouseAvailability[]>
  >({});
  const [positionsLoading, setPositionsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("stock");
  const [inProgressItem, setInProgressItem] = React.useState<StockPosition | null>(null);
  const [focusInvoiceId, setFocusInvoiceId] = React.useState<string | null>(null);
  const [pendingSelections, setPendingSelections] =
    React.useState<DispatchSelection[] | null>(null);
  const [dispatching, setDispatching] = React.useState(false);

  const handlePostDispatch = async () => {
    if (!organizationId || !pendingSelections) return;
    setDispatching(true);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/stock/dispatch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: pendingSelections.map((s) => ({
              invoiceId: s.invoiceId,
              itemId: s.itemId,
              warehouseId: s.warehouseId,
              quantity: s.quantity,
            })),
          }),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Failed to post dispatch");

      toast.success(
        `Dispatched ${body.units} unit${body.units === 1 ? "" : "s"} across ${body.dispatched} line${body.dispatched === 1 ? "" : "s"}`
      );
      setPendingSelections(null);
      // Physical stock and the queue both moved; refresh each of them.
      await Promise.all([fetchPositions(), fetchData()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to post dispatch"
      );
    } finally {
      setDispatching(false);
    }
  };

  const fetchPositions = React.useCallback(async () => {
    if (!organizationId) return;
    setPositionsLoading(true);
    try {
      const [positionsRes, queueRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/stock/positions?view=positions`),
        fetch(`/api/organizations/${organizationId}/stock/positions?view=dispatch-queue`),
      ]);

      if (positionsRes.ok) {
        const body = await positionsRes.json();
        setPositions((body.data ?? []) as StockPosition[]);
        if (body.summary) setPositionsSummary(body.summary);
      }
      if (queueRes.ok) {
        const body = await queueRes.json();
        setDispatchInvoices((body.data ?? []) as DispatchInvoice[]);
        setAvailability(body.availability ?? {});
      }
    } catch (error) {
      console.error("Error loading stock positions:", error);
      toast.error("Failed to load stock positions");
    } finally {
      setPositionsLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  /** All pending lines flattened, for the per-item in-progress panel. */
  const pendingLines = React.useMemo<PendingDispatchLine[]>(
    () => dispatchInvoices.flatMap((invoice) => invoice.lines),
    [dispatchInvoices]
  );

  const linesForItem = React.useMemo(
    () =>
      inProgressItem
        ? pendingLines.filter((line) => line.itemId === inProgressItem.itemId)
        : [],
    [pendingLines, inProgressItem]
  );

  const visiblePositions = React.useMemo(() => {
    if (!searchTerm) return positions;
    const needle = searchTerm.toLowerCase();
    return positions.filter(
      (p) =>
        p.itemName.toLowerCase().includes(needle) ||
        (p.sku ?? "").toLowerCase().includes(needle) ||
        (p.category ?? "").toLowerCase().includes(needle)
    );
  }, [positions, searchTerm]);

  /** Jump from an item's in-progress panel straight to that invoice's pick list. */
  const goToDispatch = (invoiceId: string) => {
    setInProgressItem(null);
    setFocusInvoiceId(invoiceId);
    setActiveTab("dispatch");
  };

  const handleExportPositions = () => {
    if (visiblePositions.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `stock-positions-${new Date().toISOString().slice(0, 10)}`,
      visiblePositions.map((p) => ({
        Item: p.itemName,
        SKU: p.sku ?? "",
        Category: p.category ?? "",
        Unit: p.unit ?? "",
        AccountingStock: p.accounting,
        InProgress: p.inProgress,
        PhysicalStock: p.physical,
        OpenInvoices: p.openInvoices,
        Warehouses: p.warehouses.map((w) => `${w.warehouseName}:${w.quantity}`).join(" | "),
      }))
    );
    toast.success(`Exported ${visiblePositions.length} items`);
  };

  const [formData, setFormData] = React.useState({
    itemId: "",
    warehouseId: "",
    adjustmentType: "add",
    quantity: "",
    reason: "",
    notes: "",
  });

  // Fetch all data
  const fetchData = React.useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      /**
       * These three used to be one `/stock` call plus `?warehouses=true`, a
       * parameter the stock API never implemented: the warehouse list and the
       * movement list were read off keys (`data.warehouses`, `data.movements`)
       * that response never contains, so both tabs rendered permanently empty.
       * Each list now comes from the endpoint that actually serves it.
       */
      const [stockRes, movementsRes, warehouseRes, itemsRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/stock?limit=500`),
        fetch(`/api/organizations/${organizationId}/stock?view=movements&limit=100`),
        fetch(`/api/organizations/${organizationId}/warehouses`),
        fetch(`/api/organizations/${organizationId}/items?limit=500`),
      ]);

      if (stockRes.ok) {
        const data = await stockRes.json();
        setStockItems(data.data || []);
      }

      if (movementsRes.ok) {
        const data = await movementsRes.json();
        const rows: MovementResponse[] = data.data || [];
        setMovements(
          rows.map((m) => ({
            id: m.id,
            date: m.date,
            type: m.movementType,
            itemId: m.itemId,
            item: { name: m.item?.name ?? "-" },
            quantity: Number(m.quantity),
            referenceNo: m.referenceId ?? undefined,
            warehouseId: m.toWarehouseId ?? m.fromWarehouseId ?? "",
            warehouse: {
              name: m.toWarehouse?.name ?? m.fromWarehouse?.name ?? "-",
            },
          }))
        );
      }

      if (warehouseRes.ok) {
        const data = await warehouseRes.json();
        setWarehouses(Array.isArray(data) ? data : data.data || []);
      }

      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setItems(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching stock data:", error);
      toast.error("Failed to load stock data");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      fetchData();
    }
  }, [organizationId, fetchData]);

  // Handle stock adjustment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.itemId || !formData.warehouseId || !formData.quantity) {
      toast.error("Please fill all required fields");
      return;
    }

    const item = items.find((i) => i.id === formData.itemId);
    if (!item?.primaryUnit?.id) {
      toast.error("The selected item has no unit of measure configured");
      return;
    }

    setSaving(true);

    try {
      /**
       * The payload has to match the stock endpoint's schema. It previously
       * sent `warehouseId` / `type` / `reason` / `notes` and no `unitId`,
       * none of which that schema accepts, so every save failed validation.
       */
      const response = await fetch(
        `/api/organizations/${organizationId}/stock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: formData.itemId,
            movementType: "ADJUSTMENT",
            unitId: item.primaryUnit.id,
            quantity: Number(formData.quantity),
            toWarehouseId:
              formData.adjustmentType === "add" ? formData.warehouseId : undefined,
            fromWarehouseId:
              formData.adjustmentType === "add" ? undefined : formData.warehouseId,
            referenceType: "ADJUSTMENT",
            narration: [formData.reason, formData.notes]
              .filter(Boolean)
              .join(" — ") || undefined,
            date: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save adjustment");
      }

      toast.success("Stock adjustment saved successfully");
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save adjustment"
      );
    } finally {
      setSaving(false);
    }
  };

  const openTransferDialog = (stock: StockItem) => {
    setTransferStock(stock);
    setTransferForm({ toWarehouseId: "", quantity: "", notes: "" });
  };

  const handleTransfer = async () => {
    if (!organizationId || !transferStock) return;

    const item = items.find((i) => i.id === transferStock.itemId);
    if (!item?.primaryUnit?.id) {
      toast.error("The selected item has no unit of measure configured");
      return;
    }
    if (!transferForm.toWarehouseId) {
      toast.error("Choose a destination warehouse");
      return;
    }
    if (transferForm.toWarehouseId === transferStock.warehouseId) {
      toast.error("Source and destination warehouses must differ");
      return;
    }
    const quantity = Number(transferForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Enter a quantity greater than zero");
      return;
    }
    if (quantity > Number(transferStock.quantity)) {
      toast.error("Quantity exceeds the stock available at the source warehouse");
      return;
    }

    setTransferring(true);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/stock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: transferStock.itemId,
            movementType: "TRANSFER",
            unitId: item.primaryUnit.id,
            quantity,
            fromWarehouseId: transferStock.warehouseId,
            toWarehouseId: transferForm.toWarehouseId,
            referenceType: "TRANSFER",
            narration: transferForm.notes || undefined,
            date: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to transfer stock");
      }

      toast.success("Stock transferred successfully");
      setTransferStock(null);
      fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to transfer stock"
      );
    } finally {
      setTransferring(false);
    }
  };


  const resetForm = () => {
    setFormData({
      itemId: "",
      warehouseId: "",
      adjustmentType: "add",
      quantity: "",
      reason: "",
      notes: "",
    });
  };

  // Calculate stats
  const stats = React.useMemo(() => {
    const totalValue = stockItems.reduce((sum, s) => sum + (s.quantity || 0), 0);
    const lowStock = stockItems.filter(
      (s) => s.minStockLevel && s.quantity < s.minStockLevel
    ).length;
    const outOfStock = stockItems.filter((s) => s.quantity === 0).length;

    return {
      totalValue,
      lowStock,
      outOfStock,
      warehouseCount: warehouses.length,
    };
  }, [stockItems, warehouses]);


  // Get stock status
  const getStockStatus = (item: StockItem) => {
    if (item.quantity === 0) return "OUT_OF_STOCK";
    if (item.minStockLevel && item.quantity < item.minStockLevel) return "LOW";
    if (item.maxStockLevel && item.quantity > item.maxStockLevel) return "EXCESS";
    return "ADEQUATE";
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No organization selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock & Warehouse</h1>
          <p className="text-muted-foreground">
            Manage inventory stock levels and warehouse operations
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Stock Adjustment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Stock Adjustment</DialogTitle>
                <DialogDescription>
                  Adjust stock quantities for inventory corrections
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Item *</Label>
                  <Select
                    value={formData.itemId}
                    onValueChange={(v) => setFormData({ ...formData, itemId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Warehouse *</Label>
                  <Select
                    value={formData.warehouseId}
                    onValueChange={(v) =>
                      setFormData({ ...formData, warehouseId: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((wh) => (
                        <SelectItem key={wh.id} value={wh.id}>
                          {wh.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Adjustment Type *</Label>
                    <Select
                      value={formData.adjustmentType}
                      onValueChange={(v) =>
                        setFormData({ ...formData, adjustmentType: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add">Add Stock</SelectItem>
                        <SelectItem value="remove">Remove Stock</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      value={formData.quantity}
                      onChange={(e) =>
                        setFormData({ ...formData, quantity: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Select
                    value={formData.reason}
                    onValueChange={(v) => setFormData({ ...formData, reason: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical_count">Physical Count</SelectItem>
                      <SelectItem value="damaged">Damaged Goods</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="theft">Theft/Loss</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Additional notes..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saving ? "Saving..." : "Save Adjustment"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/*
        The three positions read left to right as one sentence:
        accounting + in progress = physical. The middle tile is the only
        actionable one, so it carries the accent and a way through to the work.
      */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounting stock</CardTitle>
            <FileText className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {positionsSummary.accounting.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground">
              What the books still consider owned
            </p>
          </CardContent>
        </Card>

        <Card className={cn(positionsSummary.inProgress > 0 && "border-amber-400/60")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In progress</CardTitle>
            <Truck className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-amber-600">
              {positionsSummary.inProgress.toLocaleString("en-IN")}
            </div>
            {positionsSummary.inProgress > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab("dispatch")}
                className="text-xs text-amber-700 underline-offset-2 hover:underline dark:text-amber-500"
              >
                {positionsSummary.pendingInvoices} invoice
                {positionsSummary.pendingInvoices === 1 ? "" : "s"} awaiting dispatch
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing awaiting dispatch</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Physical stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {positionsSummary.physical.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground">
              On the shelf across {stats.warehouseCount} warehouse
              {stats.warehouseCount === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(positionsSummary.oversold > 0 && "border-red-400/60")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs attention</CardTitle>
            <AlertTriangle
              className={cn(
                "h-4 w-4",
                positionsSummary.oversold > 0 ? "text-red-600" : "text-yellow-600"
              )}
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {positionsSummary.oversold + stats.outOfStock}
            </div>
            <p className="text-xs text-muted-foreground">
              {positionsSummary.oversold} oversold · {stats.outOfStock} out of stock
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock">Stock Positions</TabsTrigger>
          <TabsTrigger value="dispatch" className="gap-2">
            Dispatch Queue
            {positionsSummary.pendingInvoices > 0 && (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 justify-center px-1 text-[10px] tabular-nums"
              >
                {positionsSummary.pendingInvoices}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          {/*
            Nothing in this codebase deducts stock when an invoice is raised, so
            until dispatch posts its movements every issued invoice counts as in
            progress. Saying so up front stops the column reading as a bug.
          */}
          {positionsSummary.inProgress > 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-amber-900 dark:text-amber-200">
                <span className="font-medium">
                  {positionsSummary.inProgress.toLocaleString("en-IN")} units are
                  invoiced but not yet dispatched.
                </span>{" "}
                Raising an invoice does not move stock, so these still sit on the
                shelf. Confirm them in the{" "}
                <button
                  type="button"
                  onClick={() => setActiveTab("dispatch")}
                  className="underline underline-offset-2"
                >
                  dispatch queue
                </button>{" "}
                to bring physical stock down to the accounting position.
              </p>
            </div>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Stock positions</CardTitle>
                  <CardDescription>
                    Accounting, in-progress and physical stock per item
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search items..."
                      className="pl-8 w-[250px]"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Export stock positions to CSV"
                    onClick={handleExportPositions}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {positionsLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : visiblePositions.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-4">
                  <Package className="h-12 w-12 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    {searchTerm ? "No items match that search" : "No stock records found"}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Accounting</TableHead>
                      <TableHead className="text-right">In progress</TableHead>
                      <TableHead className="text-right">Physical</TableHead>
                      <TableHead className="w-[140px]">Split</TableHead>
                      <TableHead>Warehouses</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePositions.map((position) => {
                      const oversold = position.accounting < 0;
                      const low =
                        position.reorderLevel != null &&
                        position.accounting <= position.reorderLevel;

                      return (
                        <TableRow key={position.itemId}>
                          <TableCell>
                            <div className="font-medium">{position.itemName}</div>
                            <div className="text-xs text-muted-foreground">
                              {position.sku ? `${position.sku}` : ""}
                              {position.sku && position.category ? " · " : ""}
                              {position.category ?? ""}
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            <span
                              className={cn(
                                "font-medium tabular-nums",
                                oversold && "text-red-600"
                              )}
                            >
                              {position.accounting}
                            </span>
                            {oversold && (
                              <div className="text-[11px] text-red-600">oversold</div>
                            )}
                            {!oversold && low && (
                              <div className="text-[11px] text-yellow-600">
                                at reorder level
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            {position.inProgress > 0 ? (
                              <button
                                type="button"
                                onClick={() => setInProgressItem(position)}
                                className="group inline-flex items-center gap-1 rounded px-1 tabular-nums font-medium text-amber-600 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={`Show the ${position.openInvoices} invoices behind ${position.inProgress} units in progress for ${position.itemName}`}
                              >
                                {position.inProgress}
                                <ChevronRight className="h-3 w-3 opacity-60 transition-transform group-hover:translate-x-0.5" />
                              </button>
                            ) : (
                              <span className="tabular-nums text-muted-foreground">0</span>
                            )}
                            {position.openInvoices > 0 && (
                              <div className="text-[11px] text-muted-foreground">
                                {position.openInvoices} invoice
                                {position.openInvoices === 1 ? "" : "s"}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="text-right font-medium tabular-nums">
                            {position.physical}
                            <div className="text-[11px] font-normal text-muted-foreground">
                              {position.unit ?? ""}
                            </div>
                          </TableCell>

                          <TableCell>
                            <StockSplitBar
                              accounting={position.accounting}
                              inProgress={position.inProgress}
                              physical={position.physical}
                            />
                          </TableCell>

                          <TableCell>
                            {position.warehouses.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                no stock rows
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {position.warehouses.map((w) => (
                                  <Badge
                                    key={w.warehouseId}
                                    variant="outline"
                                    className="text-[10px] font-normal"
                                  >
                                    {w.warehouseName} {w.quantity}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>

                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Open actions menu"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled={position.inProgress === 0}
                                  onClick={() => setInProgressItem(position)}
                                >
                                  <Truck className="mr-2 h-4 w-4" />
                                  View in-progress invoices
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push(
                                      `/inventory/movements?itemId=${position.itemId}`
                                    )
                                  }
                                >
                                  <ArrowUpDown className="mr-2 h-4 w-4" />
                                  Stock movements
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
        </TabsContent>

        <TabsContent value="dispatch" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Dispatch queue</h3>
            <p className="text-sm text-muted-foreground">
              Sold and still to leave the warehouse, oldest first. Confirming a
              line records the goods as physically gone and brings physical stock
              down to the accounting position.
            </p>
          </div>
          <DispatchQueue
            invoices={dispatchInvoices}
            availability={availability}
            loading={positionsLoading}
            focusInvoiceId={focusInvoiceId}
            onConfirm={(selections) => {
              if (selections.length === 0) {
                toast.error("Nothing selected to dispatch");
                return;
              }
              setPendingSelections(selections);
            }}
          />
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stock Movements</CardTitle>
              <CardDescription>
                Track all stock ins, outs, and transfers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : movements.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <ArrowUpDown className="h-12 w-12 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No stock movements found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Warehouse</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>
                          {new Date(movement.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={movementColors[movement.type] || "bg-gray-100"}>
                            {movement.type === "IN" && (
                              <TrendingUp className="mr-1 h-3 w-3" />
                            )}
                            {movement.type === "OUT" && (
                              <TrendingDown className="mr-1 h-3 w-3" />
                            )}
                            {movement.type === "TRANSFER" && (
                              <ArrowUpDown className="mr-1 h-3 w-3" />
                            )}
                            {movement.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {movement.item?.name}
                        </TableCell>
                        <TableCell className="text-right">
                          {movement.type === "IN" ? "+" : movement.type === "OUT" ? "-" : ""}
                          {movement.quantity}
                        </TableCell>
                        <TableCell>
                          <span className="text-blue-600 cursor-pointer hover:underline">
                            {movement.referenceNo || "-"}
                          </span>
                        </TableCell>
                        <TableCell>{movement.warehouse?.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warehouses" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : warehouses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Warehouse className="h-12 w-12 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No warehouses found</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {warehouses.map((warehouse) => (
                <Card key={warehouse.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{warehouse.name}</CardTitle>
                      <Badge variant="outline">{warehouse.code || warehouse.city}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {warehouse.address && (
                      <p className="text-sm text-muted-foreground">{warehouse.address}</p>
                    )}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Status</div>
                        <div className="font-medium">
                          {warehouse.isActive ? "Active" : "Inactive"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">City</div>
                        <div className="font-medium">{warehouse.city || "-"}</div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setDetailsWarehouse(warehouse)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {detailsStock && (
        <RecordDetailsDialog
          open={!!detailsStock}
          onOpenChange={(open) => !open && setDetailsStock(null)}
          title={detailsStock.item?.name ?? "Stock"}
          description={
            detailsStock.item?.sku ? `SKU ${detailsStock.item.sku}` : undefined
          }
          status={{ label: getStockStatus(detailsStock).replace("_", " ") }}
          sections={[
            {
              title: "Location",
              fields: [
                { label: "Warehouse", value: detailsStock.warehouse?.name },
                { label: "Category", value: detailsStock.item?.category?.name },
              ],
            },
            {
              title: "Quantities",
              fields: [
                { label: "On Hand", value: detailsStock.quantity },
                { label: "Reserved", value: detailsStock.reservedQuantity ?? 0 },
                {
                  label: "Available",
                  value:
                    Number(detailsStock.quantity) -
                    Number(detailsStock.reservedQuantity ?? 0),
                },
                { label: "Minimum Level", value: detailsStock.minStockLevel },
                { label: "Maximum Level", value: detailsStock.maxStockLevel },
                { label: "Reorder Point", value: detailsStock.reorderPoint },
              ],
            },
          ]}
          actions={
            <Button
              variant="outline"
              onClick={() => {
                const stock = detailsStock;
                setDetailsStock(null);
                openTransferDialog(stock);
              }}
            >
              <ArrowUpDown className="mr-2 h-4 w-4" />
              Transfer
            </Button>
          }
        />
      )}

      {detailsWarehouse && (
        <RecordDetailsDialog
          open={!!detailsWarehouse}
          onOpenChange={(open) => !open && setDetailsWarehouse(null)}
          title={detailsWarehouse.name}
          description={detailsWarehouse.code ?? undefined}
          status={{
            label: detailsWarehouse.isActive ? "Active" : "Inactive",
            variant: detailsWarehouse.isActive ? "default" : "secondary",
          }}
          sections={[
            {
              title: "Location",
              fields: [
                { label: "Address", value: detailsWarehouse.address, full: true },
                { label: "City", value: detailsWarehouse.city },
                { label: "State", value: detailsWarehouse.state },
              ],
            },
            {
              title: "Contact",
              fields: [
                { label: "Contact Person", value: detailsWarehouse.contactPerson },
                { label: "Phone", value: detailsWarehouse.phone },
                {
                  label: "Default Warehouse",
                  value: detailsWarehouse.isDefault ? "Yes" : "No",
                },
                {
                  label: "Stock Records",
                  value:
                    detailsWarehouse._count?.stocks ??
                    stockItems.filter((s) => s.warehouseId === detailsWarehouse.id)
                      .length,
                },
              ],
            },
          ]}
        />
      )}

      <InProgressSheet
        position={inProgressItem}
        lines={linesForItem}
        loading={positionsLoading}
        onOpenChange={(open) => !open && setInProgressItem(null)}
        onGoToDispatch={goToDispatch}
      />

      <ConfirmDispatchDialog
        selections={pendingSelections}
        positions={positions}
        onOpenChange={(open) => !open && setPendingSelections(null)}
        onConfirm={handlePostDispatch}
        posting={dispatching}
      />

      <Dialog
        open={!!transferStock}
        onOpenChange={(open) => !open && setTransferStock(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock Transfer</DialogTitle>
            <DialogDescription>
              Move {transferStock?.item?.name} out of{" "}
              {transferStock?.warehouse?.name} into another warehouse.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>From</Label>
              <Input value={transferStock?.warehouse?.name ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>To *</Label>
              <Select
                value={transferForm.toWarehouseId}
                onValueChange={(value) =>
                  setTransferForm({ ...transferForm, toWarehouseId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((w) => w.id !== transferStock?.warehouseId)
                    .map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-qty">
                Quantity * (available {transferStock?.quantity ?? 0})
              </Label>
              <Input
                id="transfer-qty"
                type="number"
                min="0"
                step="any"
                value={transferForm.quantity}
                onChange={(e) =>
                  setTransferForm({ ...transferForm, quantity: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-notes">Notes</Label>
              <Input
                id="transfer-notes"
                placeholder="Optional reference or reason"
                value={transferForm.notes}
                onChange={(e) =>
                  setTransferForm({ ...transferForm, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTransferStock(null)}
              disabled={transferring}
            >
              Cancel
            </Button>
            <Button onClick={handleTransfer} disabled={transferring}>
              {transferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

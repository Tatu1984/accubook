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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
  RotateCcw,
  Eye,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrganization } from "@/hooks/use-organization";
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
  isActive: boolean;
}

const statusColors: Record<string, string> = {
  ADEQUATE: "bg-green-100 text-green-800",
  LOW: "bg-yellow-100 text-yellow-800",
  OUT_OF_STOCK: "bg-red-100 text-red-800",
  EXCESS: "bg-blue-100 text-blue-800",
};

const movementColors: Record<string, string> = {
  IN: "bg-green-100 text-green-800",
  OUT: "bg-red-100 text-red-800",
  TRANSFER: "bg-blue-100 text-blue-800",
  ADJUSTMENT: "bg-yellow-100 text-yellow-800",
};

export default function StockPage() {
  const { organizationId, isLoading: authLoading } = useOrganization();
  const [stockItems, setStockItems] = React.useState<StockItem[]>([]);
  const [movements, setMovements] = React.useState<StockMovement[]>([]);
  const [warehouses, setWarehouses] = React.useState<WarehouseData[]>([]);
  const [items, setItems] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

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
      const [stockRes, warehouseRes, itemsRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/stock`),
        fetch(`/api/organizations/${organizationId}/stock?warehouses=true`),
        fetch(`/api/organizations/${organizationId}/items?limit=500`),
      ]);

      if (stockRes.ok) {
        const data = await stockRes.json();
        setStockItems(data.data || data.stock || []);
        setMovements(data.movements || []);
      }

      if (warehouseRes.ok) {
        const data = await warehouseRes.json();
        setWarehouses(data.warehouses || []);
      }

      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setItems(data.data || data);
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

    setSaving(true);

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/stock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: formData.itemId,
            warehouseId: formData.warehouseId,
            type: formData.adjustmentType === "add" ? "IN" : "OUT",
            quantity: parseInt(formData.quantity),
            reason: formData.reason,
            notes: formData.notes,
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

  // Filter stock items
  const filteredItems = React.useMemo(() => {
    if (!searchTerm) return stockItems;
    const term = searchTerm.toLowerCase();
    return stockItems.filter(
      (s) =>
        s.item?.name?.toLowerCase().includes(term) ||
        s.item?.sku?.toLowerCase().includes(term) ||
        s.warehouse?.name?.toLowerCase().includes(term)
    );
  }, [stockItems, searchTerm]);

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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stockItems.length}</div>
            <p className="text-xs text-muted-foreground">Tracked items</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lowStock}</div>
            <p className="text-xs text-muted-foreground">Below reorder level</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.outOfStock}</div>
            <p className="text-xs text-muted-foreground">Need immediate attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warehouses</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.warehouseCount}</div>
            <p className="text-xs text-muted-foreground">Active locations</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Stock Levels</CardTitle>
                  <CardDescription>
                    Current inventory levels across all warehouses
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
                  <Button variant="outline" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <Package className="h-12 w-12 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No stock records found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Stock Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((stock) => {
                      const status = getStockStatus(stock);
                      const stockPercentage = stock.maxStockLevel
                        ? Math.min((stock.quantity / stock.maxStockLevel) * 100, 100)
                        : 50;

                      return (
                        <TableRow key={stock.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{stock.item?.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {stock.item?.sku}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{stock.warehouse?.name}</TableCell>
                          <TableCell className="text-right font-medium">
                            {stock.quantity?.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="w-32">
                              <Progress value={stockPercentage} className="h-2" />
                              <div className="text-xs text-muted-foreground mt-1">
                                Min: {stock.minStockLevel || 0} | Max:{" "}
                                {stock.maxStockLevel || "∞"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[status]}>
                              {status.replace("_", " ")}
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
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <ArrowUpDown className="mr-2 h-4 w-4" />
                                  Stock Transfer
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setFormData({
                                      ...formData,
                                      itemId: stock.itemId,
                                      warehouseId: stock.warehouseId,
                                    });
                                    setIsDialogOpen(true);
                                  }}
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Adjustment
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
                    <Button variant="outline" className="w-full">
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
    </div>
  );
}

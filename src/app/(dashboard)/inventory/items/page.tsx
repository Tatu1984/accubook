"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  ArrowUpDown,
  Download,
  Upload,
  Package,
  AlertTriangle,
  Barcode,
  Loader2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { Checkbox } from "@/frontend/components/ui/checkbox";
import { DataTable } from "@/frontend/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { Textarea } from "@/frontend/components/ui/textarea";
import { cn } from "@/shared/utils/common.util";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { RecordDetailsDialog } from "@/frontend/components/ui/record-details-dialog";
import { downloadCsv } from "@/frontend/utils/export-csv";
import { printDocument } from "@/frontend/utils/print-document";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Item {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: { id: string; name: string } | null;
  type: "GOODS" | "SERVICES";
  hsnCode: string | null;
  primaryUnit: { id: string; name: string; symbol: string };
  purchasePrice: number | null;
  sellingPrice: number | null;
  mrp: number | null;
  totalStock: number;
  reorderLevel: number | null;
  valuationMethod: string;
  isActive: boolean;
  trackBatch: boolean;
  trackSerial: boolean;
  trackExpiry: boolean;
}

interface Category {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  name: string;
  symbol: string;
}

interface TaxConfig {
  id: string;
  name: string;
  rate: number;
}

function formatCurrency(amount: number | null) {
  if (amount === null) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const emptyItemForm = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  type: "GOODS",
  categoryId: "",
  primaryUnitId: "",
  hsnCode: "",
  valuationMethod: "FIFO",
  purchasePrice: "",
  sellingPrice: "",
  mrp: "",
  reorderLevel: "",
  salesTaxId: "",
  trackBatch: false,
  trackSerial: false,
  trackExpiry: false,
};

export default function ItemsPage() {
  const router = useRouter();
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [items, setItems] = React.useState<Item[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [taxConfigs, setTaxConfigs] = React.useState<TaxConfig[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<string>("all");
  const [deleteItemId, setDeleteItemId] = React.useState<string | null>(null);
  const [editingItem, setEditingItem] = React.useState<Item | null>(null);
  const [detailsItem, setDetailsItem] = React.useState<Item | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = React.useState(emptyItemForm);

  const fetchItems = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/items`);
      if (!response.ok) throw new Error("Failed to fetch items");
      const data = await response.json();
      setItems(data.data || []);
    } catch (error) {
      console.error("Error fetching items:", error);
      toast.error("Failed to fetch items");
    }
  }, [organizationId]);

  const fetchCategories = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/item-categories`);
      if (!response.ok) throw new Error("Failed to fetch categories");
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, [organizationId]);

  const fetchUnits = React.useCallback(async () => {
    try {
      const response = await fetch("/api/units");
      if (!response.ok) throw new Error("Failed to fetch units");
      const data = await response.json();
      setUnits(data);
    } catch (error) {
      console.error("Error fetching units:", error);
    }
  }, []);

  const fetchTaxConfigs = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/tax-config`);
      if (!response.ok) throw new Error("Failed to fetch tax configs");
      const data = await response.json();
      setTaxConfigs(data.data || []);
    } catch (error) {
      console.error("Error fetching tax configs:", error);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      Promise.all([fetchItems(), fetchCategories(), fetchUnits(), fetchTaxConfigs()])
        .finally(() => setIsLoading(false));
    }
  }, [organizationId, fetchItems, fetchCategories, fetchUnits, fetchTaxConfigs]);

  const openCreateDialog = () => {
    setEditingItem(null);
    setFormData(emptyItemForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: Item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      sku: item.sku ?? "",
      barcode: item.barcode ?? "",
      description: "",
      type: item.type,
      categoryId: item.category?.id ?? "",
      primaryUnitId: item.primaryUnit?.id ?? "",
      hsnCode: item.hsnCode ?? "",
      valuationMethod: item.valuationMethod ?? "FIFO",
      purchasePrice: item.purchasePrice != null ? String(item.purchasePrice) : "",
      sellingPrice: item.sellingPrice != null ? String(item.sellingPrice) : "",
      mrp: item.mrp != null ? String(item.mrp) : "",
      reorderLevel: item.reorderLevel != null ? String(item.reorderLevel) : "",
      salesTaxId: "",
      trackBatch: item.trackBatch,
      trackSerial: item.trackSerial,
      trackExpiry: item.trackExpiry,
    });
    setIsDialogOpen(true);
  };

  const handleSaveItem = async () => {
    if (!organizationId) return;
    if (!formData.name || !formData.primaryUnitId) {
      toast.error("Name and unit are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingItem
        ? `/api/organizations/${organizationId}/items/${editingItem.id}`
        : `/api/organizations/${organizationId}/items`;

      const response = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
          sellingPrice: formData.sellingPrice ? parseFloat(formData.sellingPrice) : undefined,
          mrp: formData.mrp ? parseFloat(formData.mrp) : undefined,
          reorderLevel: formData.reorderLevel ? parseFloat(formData.reorderLevel) : undefined,
          categoryId: formData.categoryId || undefined,
          salesTaxId: formData.salesTaxId || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || `Failed to ${editingItem ? "update" : "create"} item`
        );
      }

      toast.success(editingItem ? "Item updated successfully" : "Item created successfully");
      setIsDialogOpen(false);
      setEditingItem(null);
      setFormData(emptyItemForm);
      fetchItems();
    } catch (error) {
      console.error("Error saving item:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save item");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    if (filteredItems.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `items-${new Date().toISOString().slice(0, 10)}`,
      filteredItems.map((item) => ({
        Name: item.name,
        SKU: item.sku ?? "",
        Barcode: item.barcode ?? "",
        Type: item.type,
        Category: item.category?.name ?? "",
        Unit: item.primaryUnit?.symbol ?? "",
        HSN: item.hsnCode ?? "",
        PurchasePrice: item.purchasePrice ?? "",
        SellingPrice: item.sellingPrice ?? "",
        MRP: item.mrp ?? "",
        StockOnHand: item.totalStock,
        ReorderLevel: item.reorderLevel ?? "",
        ValuationMethod: item.valuationMethod,
        Status: item.isActive ? "Active" : "Inactive",
      }))
    );
    toast.success(`Exported ${filteredItems.length} items`);
  };

  /**
   * CSV import. Expected header row (case-insensitive):
   * name, sku, barcode, type, unit, hsn, purchasePrice, sellingPrice, mrp, reorderLevel
   * `unit` matches a unit of measure by symbol or name.
   */
  const handleImportFile = async (file: File) => {
    if (!organizationId) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) {
        toast.error("The file has no data rows");
        return;
      }

      const parseLine = (line: string): string[] => {
        const cells: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (inQuotes) {
            if (char === '"' && line[i + 1] === '"') {
              current += '"';
              i++;
            } else if (char === '"') {
              inQuotes = false;
            } else {
              current += char;
            }
          } else if (char === '"') {
            inQuotes = true;
          } else if (char === ",") {
            cells.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        cells.push(current);
        return cells.map((c) => c.trim());
      };

      const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
      const col = (row: string[], ...names: string[]) => {
        for (const name of names) {
          const index = headers.indexOf(name);
          if (index !== -1 && row[index] !== undefined && row[index] !== "") {
            return row[index];
          }
        }
        return "";
      };

      const defaultUnit = units[0];
      let created = 0;
      const failures: string[] = [];

      for (const line of lines.slice(1)) {
        const row = parseLine(line);
        const name = col(row, "name", "item", "item name");
        if (!name) continue;

        const unitText = col(row, "unit", "uom", "unit of measure").toLowerCase();
        const unit =
          units.find(
            (u) =>
              u.symbol.toLowerCase() === unitText || u.name.toLowerCase() === unitText
          ) ?? defaultUnit;

        if (!unit) {
          failures.push(`${name}: no unit of measure available`);
          continue;
        }

        const categoryName = col(row, "category").toLowerCase();
        const category = categories.find(
          (c) => c.name.toLowerCase() === categoryName
        );
        const numeric = (value: string) => {
          const parsed = parseFloat(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        try {
          const response = await fetch(
            `/api/organizations/${organizationId}/items`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                sku: col(row, "sku") || undefined,
                barcode: col(row, "barcode") || undefined,
                type: col(row, "type").toUpperCase() === "SERVICES" ? "SERVICES" : "GOODS",
                primaryUnitId: unit.id,
                categoryId: category?.id,
                hsnCode: col(row, "hsn", "hsncode", "hsn code") || undefined,
                purchasePrice: numeric(col(row, "purchaseprice", "purchase price")),
                sellingPrice: numeric(col(row, "sellingprice", "selling price")),
                mrp: numeric(col(row, "mrp")),
                reorderLevel: numeric(col(row, "reorderlevel", "reorder level")),
              }),
            }
          );
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            failures.push(`${name}: ${error.error ?? response.statusText}`);
          } else {
            created++;
          }
        } catch {
          failures.push(`${name}: request failed`);
        }
      }

      if (created > 0) toast.success(`Imported ${created} items`);
      if (failures.length > 0) {
        toast.error(
          `${failures.length} rows failed. First: ${failures[0]}`,
          { duration: 8000 }
        );
      }
      if (created === 0 && failures.length === 0) {
        toast.error("No importable rows found — a 'name' column is required");
      }
      fetchItems();
    } catch (error) {
      console.error("Error importing items:", error);
      toast.error("Failed to read the import file");
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handlePrintBarcode = async (item: Item) => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/barcode?view=generate&itemId=${item.id}`
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to generate barcode");
      }
      const data = await response.json();
      printDocument({
        title: "Item Barcode",
        subtitle: item.name,
        fields: [
          { label: "Item", value: item.name },
          { label: "SKU", value: item.sku ?? "-" },
          { label: "Barcode", value: data.barcodeText },
          { label: "Format", value: data.format },
        ],
        images: [{ src: data.image, caption: data.barcodeText }],
      });
    } catch (error) {
      console.error("Error printing barcode:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate barcode"
      );
    }
  };

  const handleDeleteItem = async () => {
    if (!organizationId || !deleteItemId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/items/${deleteItemId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete item");
      toast.success("Item deleted successfully");
      setDeleteItemId(null);
      fetchItems();
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error("Failed to delete item");
    }
  };

  const filteredItems = React.useMemo(() => {
    if (selectedType === "all") return items;
    return items.filter((item) => item.type === selectedType);
  }, [selectedType, items]);

  const stats = React.useMemo(() => {
    const goods = items.filter((i) => i.type === "GOODS");
    return {
      total: items.length,
      goods: goods.length,
      services: items.filter((i) => i.type === "SERVICES").length,
      lowStock: goods.filter(
        (i) => i.reorderLevel && i.totalStock <= Number(i.reorderLevel)
      ).length,
      totalValue: goods.reduce(
        (sum, i) => sum + i.totalStock * (Number(i.purchasePrice) || 0),
        0
      ),
    };
  }, [items]);

  const columns: ColumnDef<Item>[] = [
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
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Item Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.getValue("name")}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.sku || "-"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => row.original.category?.name || "-",
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <Badge variant={type === "GOODS" ? "default" : "secondary"}>
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: "hsnCode",
      header: "HSN/SAC",
      cell: ({ row }) => row.getValue("hsnCode") || "-",
    },
    {
      accessorKey: "purchasePrice",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="justify-end w-full"
        >
          Purchase Price
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">
          {formatCurrency(row.getValue("purchasePrice"))}
        </div>
      ),
    },
    {
      accessorKey: "sellingPrice",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="justify-end w-full"
        >
          Selling Price
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">
          {formatCurrency(row.getValue("sellingPrice"))}
        </div>
      ),
    },
    {
      accessorKey: "totalStock",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="justify-end w-full"
        >
          Stock
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const stock = row.getValue("totalStock") as number;
        const reorderLevel = row.original.reorderLevel;
        const isLowStock =
          row.original.type === "GOODS" && reorderLevel && stock <= Number(reorderLevel);

        return (
          <div className="text-right">
            <span
              className={cn(
                "font-medium tabular-nums",
                isLowStock && "text-red-600"
              )}
            >
              {stock} {row.original.primaryUnit?.symbol}
            </span>
            {isLowStock && (
              <div className="flex items-center justify-end gap-1 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                Low Stock
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => {
        const isActive = row.getValue("isActive") as boolean;
        return (
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "Active" : "Inactive"}
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
            <DropdownMenuItem onClick={() => setDetailsItem(row.original)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                router.push(`/inventory/movements?itemId=${row.original.id}`)
              }
            >
              <Package className="mr-2 h-4 w-4" />
              Stock Movement
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handlePrintBarcode(row.original)}>
              <Barcode className="mr-2 h-4 w-4" />
              Print Barcode
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => setDeleteItemId(row.original.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
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
          <h1 className="text-2xl font-bold tracking-tight">Items</h1>
          <p className="text-muted-foreground">
            Manage your products and services inventory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />
          <Button
            variant="outline"
            disabled={isImporting}
            onClick={() => importInputRef.current?.click()}
          >
            {isImporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Import
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingItem(null);
                setFormData(emptyItemForm);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? "Edit Item" : "Create New Item"}
                </DialogTitle>
                <DialogDescription>
                  {editingItem
                    ? "Update this item's details"
                    : "Add a new product or service to your inventory"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-name">Item Name *</Label>
                    <Input
                      id="item-name"
                      placeholder="Enter item name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      placeholder="e.g., ELEC-LAPTOP-001"
                      value={formData.sku}
                      onChange={(e) =>
                        setFormData({ ...formData, sku: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Item Type</Label>
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
                        <SelectItem value="GOODS">Goods</SelectItem>
                        <SelectItem value="SERVICES">Services</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={formData.categoryId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, categoryId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unit of Measure *</Label>
                    <Select
                      value={formData.primaryUnitId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, primaryUnitId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.symbol})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hsn">HSN/SAC Code</Label>
                    <Input
                      id="hsn"
                      placeholder="e.g., 84713010"
                      value={formData.hsnCode}
                      onChange={(e) =>
                        setFormData({ ...formData, hsnCode: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="barcode">Barcode</Label>
                    <Input
                      id="barcode"
                      placeholder="e.g., 8901234567890"
                      value={formData.barcode}
                      onChange={(e) =>
                        setFormData({ ...formData, barcode: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valuation Method</Label>
                    <Select
                      value={formData.valuationMethod}
                      onValueChange={(value) =>
                        setFormData({ ...formData, valuationMethod: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIFO">FIFO</SelectItem>
                        <SelectItem value="LIFO">LIFO</SelectItem>
                        <SelectItem value="WEIGHTED_AVG">Weighted Average</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchase-price">Purchase Price</Label>
                    <Input
                      id="purchase-price"
                      type="number"
                      placeholder="0.00"
                      value={formData.purchasePrice}
                      onChange={(e) =>
                        setFormData({ ...formData, purchasePrice: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selling-price">Selling Price</Label>
                    <Input
                      id="selling-price"
                      type="number"
                      placeholder="0.00"
                      value={formData.sellingPrice}
                      onChange={(e) =>
                        setFormData({ ...formData, sellingPrice: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mrp">MRP</Label>
                    <Input
                      id="mrp"
                      type="number"
                      placeholder="0.00"
                      value={formData.mrp}
                      onChange={(e) =>
                        setFormData({ ...formData, mrp: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reorder-level">Reorder Level</Label>
                    <Input
                      id="reorder-level"
                      type="number"
                      placeholder="0"
                      value={formData.reorderLevel}
                      onChange={(e) =>
                        setFormData({ ...formData, reorderLevel: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tax Rate</Label>
                    <Select
                      value={formData.salesTaxId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, salesTaxId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select tax" />
                      </SelectTrigger>
                      <SelectContent>
                        {taxConfigs.map((tax) => (
                          <SelectItem key={tax.id} value={tax.id}>
                            {tax.name} ({tax.rate}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Enter item description"
                    rows={3}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="track-batch"
                      checked={formData.trackBatch}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, trackBatch: !!checked })
                      }
                    />
                    <Label htmlFor="track-batch" className="text-sm font-normal">
                      Track Batch/Lot
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="track-serial"
                      checked={formData.trackSerial}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, trackSerial: !!checked })
                      }
                    />
                    <Label htmlFor="track-serial" className="text-sm font-normal">
                      Track Serial Numbers
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="track-expiry"
                      checked={formData.trackExpiry}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, trackExpiry: !!checked })
                      }
                    />
                    <Label htmlFor="track-expiry" className="text-sm font-normal">
                      Track Expiry Date
                    </Label>
                  </div>
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
                <Button onClick={handleSaveItem} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingItem ? "Save Changes" : "Create Item"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Goods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.goods}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.services}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.lowStock}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Stock Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={selectedType} onValueChange={setSelectedType}>
        <TabsList>
          <TabsTrigger value="all">All Items</TabsTrigger>
          <TabsTrigger value="GOODS">Goods</TabsTrigger>
          <TabsTrigger value="SERVICES">Services</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Items Table */}
      <Card>
        <CardContent className="pt-6">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No items found</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first item
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredItems}
              searchKey="name"
              searchPlaceholder="Search items..."
            />
          )}
        </CardContent>
      </Card>

      {detailsItem && (
        <RecordDetailsDialog
          open={!!detailsItem}
          onOpenChange={(open) => !open && setDetailsItem(null)}
          title={detailsItem.name}
          description={detailsItem.sku ? `SKU ${detailsItem.sku}` : undefined}
          status={{
            label: detailsItem.isActive ? "Active" : "Inactive",
            variant: detailsItem.isActive ? "default" : "secondary",
          }}
          sections={[
            {
              title: "Identification",
              fields: [
                { label: "Type", value: detailsItem.type },
                { label: "Category", value: detailsItem.category?.name },
                { label: "SKU", value: detailsItem.sku },
                { label: "Barcode", value: detailsItem.barcode },
                { label: "HSN / SAC", value: detailsItem.hsnCode },
                {
                  label: "Unit",
                  value: detailsItem.primaryUnit
                    ? `${detailsItem.primaryUnit.name} (${detailsItem.primaryUnit.symbol})`
                    : null,
                },
              ],
            },
            {
              title: "Pricing",
              fields: [
                { label: "Purchase Price", value: formatCurrency(detailsItem.purchasePrice) },
                { label: "Selling Price", value: formatCurrency(detailsItem.sellingPrice) },
                { label: "MRP", value: formatCurrency(detailsItem.mrp) },
                { label: "Valuation Method", value: detailsItem.valuationMethod },
              ],
            },
            {
              title: "Stock",
              fields: [
                { label: "Stock on Hand", value: detailsItem.totalStock },
                { label: "Reorder Level", value: detailsItem.reorderLevel },
                { label: "Batch Tracking", value: detailsItem.trackBatch ? "Yes" : "No" },
                { label: "Serial Tracking", value: detailsItem.trackSerial ? "Yes" : "No" },
                { label: "Expiry Tracking", value: detailsItem.trackExpiry ? "Yes" : "No" },
              ],
            },
          ]}
          actions={
            <Button
              variant="outline"
              onClick={() => {
                const item = detailsItem;
                setDetailsItem(null);
                openEditDialog(item);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          }
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
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

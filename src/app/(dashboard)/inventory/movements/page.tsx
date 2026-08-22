"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  ArrowRightLeft,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { DataTable } from "@/frontend/components/ui/data-table";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { toast } from "sonner";

interface StockMovement {
  id: string;
  date: string;
  type: string;
  itemName: string;
  fromWarehouse: string;
  toWarehouse: string;
  quantity: number;
  reference: string;
}

interface MovementResponse {
  id: string;
  date: string;
  movementType: string;
  quantity: string | number;
  narration: string | null;
  referenceType: string | null;
  referenceId: string | null;
  item: { id: string; name: string; sku: string | null } | null;
  fromWarehouse: { id: string; name: string } | null;
  toWarehouse: { id: string; name: string } | null;
}

export default function StockMovementsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [movements, setMovements] = React.useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  // Read from `location` rather than `useSearchParams` so this page needs no
  // Suspense boundary. Items → "Stock Movement" links here with ?itemId=.
  const [itemFilter, setItemFilter] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setItemFilter(params.get("itemId"));
  }, []);

  const fetchMovements = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const query = new URLSearchParams({ view: "movements", limit: "200" });
      if (itemFilter) query.set("itemId", itemFilter);
      const response = await fetch(
        `/api/organizations/${organizationId}/stock?${query.toString()}`
      );
      if (!response.ok) throw new Error("Failed to fetch stock movements");
      const payload = await response.json();
      const rows: MovementResponse[] = payload.data ?? [];
      setMovements(
        rows.map((m) => ({
          id: m.id,
          date: m.date,
          type: m.movementType,
          itemName: m.item?.name ?? "-",
          fromWarehouse: m.fromWarehouse?.name ?? "-",
          toWarehouse: m.toWarehouse?.name ?? "-",
          quantity: Number(m.quantity),
          reference: m.referenceId ?? m.referenceType ?? "",
        }))
      );
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      toast.error("Failed to fetch stock movements");
    }
  }, [organizationId, itemFilter]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      fetchMovements().finally(() => setIsLoading(false));
    }
  }, [organizationId, fetchMovements]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const columns: ColumnDef<StockMovement>[] = [
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
      accessorKey: "fromWarehouse",
      header: "From",
    },
    {
      accessorKey: "toWarehouse",
      header: "To",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          {row.getValue("toWarehouse")}
        </div>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
      cell: ({ row }) => row.getValue("quantity"),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="secondary">{row.getValue("type")}</Badge>
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
          <h1 className="text-2xl font-bold tracking-tight">Stock Movements</h1>
          <p className="text-muted-foreground">
            Track every stock movement across your warehouses
          </p>
        </div>
        {itemFilter && (
          <Button
            variant="outline"
            onClick={() => {
              setItemFilter(null);
              window.history.replaceState(null, "", "/inventory/movements");
            }}
          >
            Clear item filter
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          {movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <ArrowRightLeft className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No stock movements found</h3>
              <p className="text-muted-foreground">
                Stock transfers will appear here when you move items between warehouses
              </p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={movements}
              searchKey="itemName"
              searchPlaceholder="Search by item..."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  ArrowRightLeft,
  Loader2,
  ArrowRight,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { useOrganization } from "@/hooks/use-organization";
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
  status: string;
}

export default function StockMovementsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [movements, setMovements] = React.useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchMovements = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/stock?type=transfer`
      );
      if (!response.ok) throw new Error("Failed to fetch stock movements");
      const data = await response.json();
      setMovements(data.data || data || []);
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      toast.error("Failed to fetch stock movements");
    }
  }, [organizationId]);

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
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return (
          <Badge variant={status === "COMPLETED" ? "default" : "secondary"}>
            {status}
          </Badge>
        );
      },
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
            Track stock transfers between warehouses
          </p>
        </div>
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

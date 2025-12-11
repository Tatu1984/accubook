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

interface StockAdjustment {
  id: string;
  date: string;
  type: string;
  itemName: string;
  warehouse: string;
  quantity: number;
  reason: string;
  reference: string;
  status: string;
}

export default function StockAdjustmentPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [adjustments, setAdjustments] = React.useState<StockAdjustment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchAdjustments = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/stock?type=adjustment`
      );
      if (!response.ok) throw new Error("Failed to fetch stock adjustments");
      const data = await response.json();
      setAdjustments(data.data || data || []);
    } catch (error) {
      console.error("Error fetching stock adjustments:", error);
      toast.error("Failed to fetch stock adjustments");
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      fetchAdjustments().finally(() => setIsLoading(false));
    }
  }, [organizationId, fetchAdjustments]);

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
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <Badge
            variant={type === "IN" ? "default" : "secondary"}
            className="flex items-center gap-1 w-fit"
          >
            {type === "IN" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
      cell: ({ row }) => {
        const qty = row.getValue("quantity") as number;
        const type = row.original.type;
        return (
          <span className={type === "IN" ? "text-green-600" : "text-red-600"}>
            {type === "IN" ? "+" : "-"}{qty}
          </span>
        );
      },
    },
    {
      accessorKey: "reason",
      header: "Reason",
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
          <h1 className="text-2xl font-bold tracking-tight">Stock Adjustment</h1>
          <p className="text-muted-foreground">
            Adjust stock levels for inventory corrections
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Adjustment
        </Button>
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
              <Button>
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
    </div>
  );
}

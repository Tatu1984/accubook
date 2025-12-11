"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  ArrowUpDown,
  CalendarOff,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
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

interface LeaveRequest {
  id: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  appliedOn: string;
}

export default function LeavesPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [leaves, setLeaves] = React.useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchLeaves = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/leaves`
      );
      if (!response.ok) throw new Error("Failed to fetch leaves");
      const data = await response.json();
      setLeaves(data.data || data || []);
    } catch (error) {
      console.error("Error fetching leaves:", error);
      // Don't show error - API might not exist yet
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      fetchLeaves().finally(() => setIsLoading(false));
    }
  }, [organizationId, fetchLeaves]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const columns: ColumnDef<LeaveRequest>[] = [
    {
      accessorKey: "employeeName",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Employee
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("employeeName")}</div>
      ),
    },
    {
      accessorKey: "leaveType",
      header: "Leave Type",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("leaveType")}</Badge>
      ),
    },
    {
      accessorKey: "startDate",
      header: "From",
      cell: ({ row }) => formatDate(row.getValue("startDate")),
    },
    {
      accessorKey: "endDate",
      header: "To",
      cell: ({ row }) => formatDate(row.getValue("endDate")),
    },
    {
      accessorKey: "days",
      header: "Days",
    },
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {row.getValue("reason") || "-"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        const variant =
          status === "APPROVED"
            ? "default"
            : status === "REJECTED"
            ? "destructive"
            : "secondary";
        const icon =
          status === "APPROVED" ? (
            <CheckCircle className="h-3 w-3 mr-1" />
          ) : status === "REJECTED" ? (
            <XCircle className="h-3 w-3 mr-1" />
          ) : (
            <Clock className="h-3 w-3 mr-1" />
          );
        return (
          <Badge variant={variant} className="flex items-center w-fit">
            {icon}
            {status}
          </Badge>
        );
      },
    },
  ];

  const stats = React.useMemo(() => {
    return {
      pending: leaves.filter((l) => l.status === "PENDING").length,
      approved: leaves.filter((l) => l.status === "APPROVED").length,
      rejected: leaves.filter((l) => l.status === "REJECTED").length,
    };
  }, [leaves]);

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
          <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
          <p className="text-muted-foreground">
            Track and manage employee leave requests
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Apply for Leave
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-600" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {leaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CalendarOff className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No leave requests found</h3>
              <p className="text-muted-foreground mb-4">
                Leave requests will appear here when employees apply
              </p>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Apply for Leave
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={leaves}
              searchKey="employeeName"
              searchPlaceholder="Search by employee..."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

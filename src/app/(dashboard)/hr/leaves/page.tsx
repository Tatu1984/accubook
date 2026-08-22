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
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { DataTable } from "@/frontend/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
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
import { useOrganization } from "@/frontend/hooks/use-organization";
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

  const [employees, setEmployees] = React.useState<
    { id: string; employeeCode: string; firstName: string; lastName?: string | null }[]
  >([]);
  const [leaveTypes, setLeaveTypes] = React.useState<
    { id: string; name: string; annualQuota: string | number }[]
  >([]);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    employeeId: "",
    leaveTypeId: "",
    fromDate: "",
    toDate: "",
    reason: "",
  });

  const fetchLeaves = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/leaves?limit=200`
      );
      if (!response.ok) throw new Error("Failed to fetch leaves");
      const payload = await response.json();

      /**
       * The endpoint returns `fromDate`/`toDate` and nested `employee` and
       * `leaveType` objects. The rows were previously fed to the table
       * unmapped, so every column read a property that does not exist and the
       * table rendered blank rows for real requests.
       */
      type Row = {
        id: string;
        fromDate: string;
        toDate: string;
        days?: number | string;
        reason?: string | null;
        status: string;
        createdAt?: string;
        employee?: { firstName?: string; lastName?: string | null } | null;
        leaveType?: { name?: string } | null;
      };
      setLeaves(
        ((payload.data ?? []) as Row[]).map((r) => {
          const from = new Date(r.fromDate);
          const to = new Date(r.toDate);
          return {
            id: r.id,
            employeeName:
              [r.employee?.firstName, r.employee?.lastName]
                .filter(Boolean)
                .join(" ") || "—",
            leaveType: r.leaveType?.name ?? "Leave",
            startDate: r.fromDate,
            endDate: r.toDate,
            days:
              Number(r.days) ||
              Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5) + 1),
            reason: r.reason ?? "",
            status: r.status,
            appliedOn: r.createdAt ?? r.fromDate,
          };
        })
      );
    } catch (error) {
      console.error("Error fetching leaves:", error);
      toast.error("Failed to load leave requests");
    }
  }, [organizationId]);

  const fetchFormOptions = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const [empRes, typeRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/employees?limit=500`),
        fetch(`/api/organizations/${organizationId}/leave-types`),
      ]);
      if (empRes.ok) setEmployees((await empRes.json()).data ?? []);
      if (typeRes.ok) setLeaveTypes((await typeRes.json()).data ?? []);
    } catch (error) {
      console.error("Error fetching leave form options:", error);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      Promise.all([fetchLeaves(), fetchFormOptions()]).finally(() =>
        setIsLoading(false)
      );
    }
  }, [organizationId, fetchLeaves, fetchFormOptions]);

  const handleApply = async () => {
    if (!organizationId) return;
    if (!form.employeeId) return toast.error("Select an employee");
    if (!form.leaveTypeId) return toast.error("Select a leave type");
    if (!form.fromDate || !form.toDate)
      return toast.error("Both start and end dates are required");
    if (new Date(form.toDate) < new Date(form.fromDate))
      return toast.error("The end date cannot be before the start date");

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/leaves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.employeeId,
          leaveTypeId: form.leaveTypeId,
          fromDate: form.fromDate,
          toDate: form.toDate,
          reason: form.reason || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to submit request");

      toast.success("Leave request submitted");
      setIsDialogOpen(false);
      setForm({ employeeId: "", leaveTypeId: "", fromDate: "", toDate: "", reason: "" });
      fetchLeaves();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit request"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecision = async (
    leave: LeaveRequest,
    status: "APPROVED" | "REJECTED"
  ) => {
    if (!organizationId) return;
    setBusyId(leave.id);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/leaves`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveId: leave.id, status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to update leave");
      toast.success(
        status === "APPROVED"
          ? `Leave for ${leave.employeeName} approved`
          : `Leave for ${leave.employeeName} rejected`
      );
      fetchLeaves();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update leave"
      );
    } finally {
      setBusyId(null);
    }
  };

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
    {
      id: "actions",
      cell: ({ row }) => {
        const leave = row.original;
        if (leave.status !== "PENDING") return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                className="text-green-600"
                disabled={busyId === leave.id}
                onClick={() => handleDecision(leave, "APPROVED")}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600"
                disabled={busyId === leave.id}
                onClick={() => handleDecision(leave, "REJECTED")}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        <Button onClick={() => setIsDialogOpen(true)}>
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
              <Button onClick={() => setIsDialogOpen(true)}>
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
            <DialogDescription>
              Record a leave request for an employee. It is created as PENDING
              and can be approved or rejected from this list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select
                value={form.employeeId}
                onValueChange={(value) => setForm({ ...form, employeeId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      No employees — add one in HR → Employees first
                    </div>
                  ) : (
                    employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {[employee.firstName, employee.lastName]
                          .filter(Boolean)
                          .join(" ")}{" "}
                        ({employee.employeeCode})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leave Type *</Label>
              <Select
                value={form.leaveTypeId}
                onValueChange={(value) => setForm({ ...form, leaveTypeId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      No leave types configured yet
                    </div>
                  ) : (
                    leaveTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name} ({Number(type.annualQuota)} days / year)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from-date">Start Date *</Label>
                <Input
                  id="from-date"
                  type="date"
                  value={form.fromDate}
                  onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-date">End Date *</Label>
                <Input
                  id="to-date"
                  type="date"
                  value={form.toDate}
                  onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                rows={3}
                placeholder="Enter reason for leave..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
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
            <Button onClick={handleApply} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

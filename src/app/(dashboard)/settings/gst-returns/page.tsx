"use client";

import * as React from "react";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  MoreHorizontal,
  Eye,
  ArrowUpDown,
  Download,
  Upload,
  FileText,
  CheckCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  Loader2,
  AlertCircle,
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
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { RecordDetailsDialog } from "@/frontend/components/ui/record-details-dialog";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { DataTable } from "@/frontend/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { cn } from "@/shared/utils/common.util";

interface GSTReturn {
  id: string;
  returnType: "GSTR1" | "GSTR3B" | "GSTR9";
  period: string;
  dueDate: string;
  filingDate?: string;
  totalTaxLiability?: number;
  totalItcClaimed?: number;
  netPayable?: number;
  arn?: string;
  status: "PENDING" | "FILED" | "REVISED";
}

/**
 * Filing history comes from the GSTReturn table.
 *
 * This list used to be a hardcoded set of Nov-2024 filings with invented
 * ARNs and tax liabilities, so the page reported returns as FILED that had
 * never been filed and showed a liability unrelated to the books.
 */

const statusConfig = {
  PENDING: { color: "bg-yellow-100 text-yellow-800", icon: Clock },
  FILED: { color: "bg-green-100 text-green-800", icon: CheckCircle },
  REVISED: { color: "bg-blue-100 text-blue-800", icon: RefreshCw },
};

const returnTypeConfig = {
  GSTR1: { color: "bg-blue-100 text-blue-800", description: "Outward Supplies" },
  GSTR3B: { color: "bg-purple-100 text-purple-800", description: "Summary Return" },
  GSTR9: { color: "bg-orange-100 text-orange-800", description: "Annual Return" },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isOverdue(dueDate: string, status: string): boolean {
  return status === "PENDING" && new Date(dueDate) < new Date();
}

interface ReturnActions {
  onView: (r: GSTReturn) => void;
  onDownload: (r: GSTReturn) => void;
  onPrepare: (r: GSTReturn) => void;
  onFile: (r: GSTReturn, revision: boolean) => void;
  busyId: string | null;
}

/** Built per render so the row menu can reach the page handlers. */
function buildColumns(actions: ReturnActions): ColumnDef<GSTReturn>[] {
  return [
  {
    accessorKey: "returnType",
    header: "Return Type",
    cell: ({ row }) => {
      const type = row.getValue("returnType") as keyof typeof returnTypeConfig;
      const config = returnTypeConfig[type];
      return (
        <div className="flex flex-col">
          <Badge variant="secondary" className={cn("text-xs w-fit", config.color)}>
            {type}
          </Badge>
          <span className="text-xs text-muted-foreground mt-1">
            {config.description}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "period",
    header: "Period",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("period")}</span>
    ),
  },
  {
    accessorKey: "dueDate",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Due Date
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const dueDate = row.getValue("dueDate") as string;
      const overdue = isOverdue(dueDate, row.original.status);
      return (
        <div className="flex items-center gap-2">
          <span className={cn(overdue && "text-red-600")}>
            {formatDate(dueDate)}
          </span>
          {overdue && <AlertTriangle className="h-4 w-4 text-red-600" />}
        </div>
      );
    },
  },
  {
    accessorKey: "netPayable",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="justify-end w-full"
      >
        Net Payable
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {row.original.netPayable ? formatCurrency(row.original.netPayable) : "-"}
      </div>
    ),
  },
  {
    accessorKey: "filingDate",
    header: "Filed On",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.filingDate ? formatDate(row.original.filingDate) : "-"}
      </span>
    ),
  },
  {
    accessorKey: "arn",
    header: "ARN",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground font-mono">
        {row.original.arn || "-"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as keyof typeof statusConfig;
      const config = statusConfig[status];
      const Icon = config.icon;
      return (
        <Badge variant="secondary" className={cn("text-xs gap-1", config.color)}>
          <Icon className="h-3 w-3" />
          {status}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const gstReturn = row.original;
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
            <DropdownMenuItem onClick={() => actions.onView(gstReturn)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onDownload(gstReturn)}>
              <Download className="mr-2 h-4 w-4" />
              Download JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {gstReturn.status === "PENDING" && (
              <>
                <DropdownMenuItem
                  disabled={actions.busyId === gstReturn.id}
                  onClick={() => actions.onPrepare(gstReturn)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Prepare Return
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-green-600"
                  onClick={() => actions.onFile(gstReturn, false)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  File Return
                </DropdownMenuItem>
              </>
            )}
            {gstReturn.status === "FILED" && (
              <DropdownMenuItem onClick={() => actions.onFile(gstReturn, true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                File Revision
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
  ];
}

export default function GSTReturnsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<string>("all");
  const [gstReturns, setGstReturns] = React.useState<GSTReturn[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadReturns = React.useCallback(async (signal?: AbortSignal) => {
    if (!organizationId) return;
    {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/organizations/${organizationId}/gst-returns?limit=200`, { signal });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load GST returns");
        const json = await res.json();
        setGstReturns(
          (json.data ?? []).map((r: Record<string, unknown>) => ({
            id: String(r.id),
            returnType: r.returnType as GSTReturn["returnType"],
            period: String(r.period),
            dueDate: String(r.dueDate),
            filingDate: r.filingDate ? String(r.filingDate) : undefined,
            totalTaxLiability: r.totalTaxLiability != null ? Number(r.totalTaxLiability) : undefined,
            totalItcClaimed: r.totalItcClaimed != null ? Number(r.totalItcClaimed) : undefined,
            netPayable: r.netPayable != null ? Number(r.netPayable) : undefined,
            arn: r.arn ? String(r.arn) : undefined,
            status: r.status as GSTReturn["status"],
          }))
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    loadReturns(controller.signal);
    return () => controller.abort();
  }, [organizationId, loadReturns]);

  const [detailsReturn, setDetailsReturn] = React.useState<GSTReturn | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [filingReturn, setFilingReturn] = React.useState<{
    row: GSTReturn;
    revision: boolean;
  } | null>(null);
  const [filingForm, setFilingForm] = React.useState({
    arn: "",
    filingDate: new Date().toISOString().slice(0, 10),
  });

  /**
   * A stored `period` is either "Apr-2024" (monthly) or "Q1-2024" (quarterly).
   * The portal and compute endpoints want a concrete date range.
   */
  const periodRange = React.useCallback((period: string) => {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const [head, yearText] = period.split("-");
    const year = Number(yearText);
    if (!Number.isFinite(year)) return null;

    if (head?.startsWith("Q")) {
      const quarter = Number(head.slice(1));
      if (!quarter || quarter < 1 || quarter > 4) return null;
      const startMonth = (quarter - 1) * 3;
      return {
        from: new Date(Date.UTC(year, startMonth, 1)),
        to: new Date(Date.UTC(year, startMonth + 3, 0)),
        year,
      };
    }

    const monthIndex = months.indexOf(head ?? "");
    if (monthIndex === -1) return null;
    return {
      from: new Date(Date.UTC(year, monthIndex, 1)),
      to: new Date(Date.UTC(year, monthIndex + 1, 0)),
      year,
    };
  }, []);

  const handleDownloadJson = async (row: GSTReturn) => {
    if (!organizationId) return;
    if (row.returnType === "GSTR9") {
      toast.error("Annual return JSON is generated from the GSTR-9 screen");
      return;
    }
    const range = periodRange(row.period);
    if (!range) {
      toast.error(`Could not read the period "${row.period}"`);
      return;
    }
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const endpoint = row.returnType === "GSTR1" ? "gstr1" : "gstr3b";
    setBusyId(row.id);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/gst-returns/${endpoint}/portal?from=${iso(range.from)}&to=${iso(range.to)}&download=true`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to build the portal JSON");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${row.returnType}_${row.period}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${row.returnType} JSON downloaded`);
    } catch (e) {
      toast.error((e as Error).message || "Failed to download JSON");
    } finally {
      setBusyId(null);
    }
  };

  const handlePrepare = async (row: GSTReturn) => {
    if (!organizationId) return;
    if (row.returnType === "GSTR9") {
      toast.error("Annual returns are prepared from the GSTR-9 screen");
      return;
    }
    const range = periodRange(row.period);
    if (!range) {
      toast.error(`Could not read the period "${row.period}"`);
      return;
    }
    setBusyId(row.id);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/gst-returns/compute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            returnType: row.returnType,
            period: row.period.split("-")[0],
            year: range.year,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to compute the return");

      // Persist the computed figures so the list stops showing blanks.
      const summary = body.summary ?? {};
      const patch: Record<string, unknown> = { returnId: row.id };
      if (row.returnType === "GSTR3B") {
        patch.totalTaxLiability = summary.totalOutwardTax ?? undefined;
        patch.totalItcClaimed = summary.totalITC ?? undefined;
        patch.netPayable = summary.netPayable ?? undefined;
      } else {
        patch.totalTaxLiability = body.data?.summary?.totalTax ?? undefined;
      }

      const patchRes = await fetch(
        `/api/organizations/${organizationId}/gst-returns`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error(err.error || "Computed, but could not save the figures");
      }

      toast.success(`${row.returnType} for ${row.period} prepared`);
      loadReturns();
    } catch (e) {
      toast.error((e as Error).message || "Failed to prepare the return");
    } finally {
      setBusyId(null);
    }
  };

  const openFilingDialog = (row: GSTReturn, revision: boolean) => {
    setFilingReturn({ row, revision });
    setFilingForm({
      arn: revision ? "" : row.arn ?? "",
      filingDate: new Date().toISOString().slice(0, 10),
    });
  };

  /**
   * Filing itself happens on the GSTN portal — this records the acknowledgement
   * (ARN and date) against the return so the register reflects reality.
   */
  const handleRecordFiling = async () => {
    if (!organizationId || !filingReturn) return;
    if (!filingForm.arn.trim()) {
      toast.error("The ARN from the portal acknowledgement is required");
      return;
    }
    setBusyId(filingReturn.row.id);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/gst-returns`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            returnId: filingReturn.row.id,
            status: filingReturn.revision ? "REVISED" : "FILED",
            arn: filingForm.arn.trim(),
            filingDate: filingForm.filingDate,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to record the filing");
      toast.success(
        filingReturn.revision ? "Revision recorded" : "Return marked as filed"
      );
      setFilingReturn(null);
      loadReturns();
    } catch (e) {
      toast.error((e as Error).message || "Failed to record the filing");
    } finally {
      setBusyId(null);
    }
  };

  const columns = React.useMemo(
    () =>
      buildColumns({
        onView: setDetailsReturn,
        onDownload: handleDownloadJson,
        onPrepare: handlePrepare,
        onFile: openFilingDialog,
        busyId,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId, organizationId, periodRange]
  );

  const filteredReturns = React.useMemo(() => {
    if (selectedType === "all") return gstReturns;
    return gstReturns.filter((r) => r.returnType === selectedType);
  }, [selectedType, gstReturns]);

  const stats = React.useMemo(() => {
    const pending = gstReturns.filter((r) => r.status === "PENDING");
    const overdue = pending.filter((r) => isOverdue(r.dueDate, r.status));
    return {
      total: gstReturns.length,
      pending: pending.length,
      filed: gstReturns.filter((r) => r.status === "FILED").length,
      overdue: overdue.length,
      totalPayable: pending.reduce((sum, r) => sum + (r.netPayable || 0), 0),
    };
  }, [gstReturns]);

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">GST Returns</h1>
          <p className="text-muted-foreground">
            Manage and file your GST returns
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Return
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add GST Return</DialogTitle>
              <DialogDescription>
                Add a new GST return period for filing
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="returnType">Return Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select return type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GSTR1">GSTR-1 (Outward Supplies)</SelectItem>
                    <SelectItem value="GSTR3B">GSTR-3B (Summary Return)</SelectItem>
                    <SelectItem value="GSTR9">GSTR-9 (Annual Return)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="period">Period</Label>
                <Input id="period" placeholder="e.g., Dec-2024 or FY 2024-25" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input id="dueDate" type="date" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>Add Return</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All periods</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stats.pending}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting filing</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
            <p className="text-xs text-muted-foreground">Past due date</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Filed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.filed}</div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tax Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.totalPayable)}
            </div>
            <p className="text-xs text-muted-foreground">Pending returns</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedType} onValueChange={setSelectedType}>
        <TabsList>
          <TabsTrigger value="all">All Returns</TabsTrigger>
          <TabsTrigger value="GSTR1">GSTR-1</TabsTrigger>
          <TabsTrigger value="GSTR3B">GSTR-3B</TabsTrigger>
          <TabsTrigger value="GSTR9">GSTR-9</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filteredReturns}
            searchKey="period"
            searchPlaceholder="Search by period..."
          />
        </CardContent>
      </Card>

      {detailsReturn && (
        <RecordDetailsDialog
          open={!!detailsReturn}
          onOpenChange={(open) => !open && setDetailsReturn(null)}
          title={`${detailsReturn.returnType} — ${detailsReturn.period}`}
          description={detailsReturn.arn ? `ARN ${detailsReturn.arn}` : undefined}
          status={{ label: detailsReturn.status }}
          sections={[
            {
              title: "Filing",
              fields: [
                { label: "Return Type", value: detailsReturn.returnType },
                { label: "Period", value: detailsReturn.period },
                {
                  label: "Due Date",
                  value: new Date(detailsReturn.dueDate).toLocaleDateString("en-IN"),
                },
                {
                  label: "Filed On",
                  value: detailsReturn.filingDate
                    ? new Date(detailsReturn.filingDate).toLocaleDateString("en-IN")
                    : null,
                },
                { label: "ARN", value: detailsReturn.arn },
              ],
            },
            {
              title: "Amounts",
              fields: [
                {
                  label: "Tax Liability",
                  value: detailsReturn.totalTaxLiability,
                },
                { label: "ITC Claimed", value: detailsReturn.totalItcClaimed },
                { label: "Net Payable", value: detailsReturn.netPayable },
              ],
            },
          ]}
          actions={
            <Button
              variant="outline"
              onClick={() => handleDownloadJson(detailsReturn)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download JSON
            </Button>
          }
        />
      )}

      <Dialog
        open={!!filingReturn}
        onOpenChange={(open) => !open && setFilingReturn(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {filingReturn?.revision ? "Record Revision" : "Record Filing"}
            </DialogTitle>
            <DialogDescription>
              {filingReturn?.row.returnType} for {filingReturn?.row.period}. The
              return is filed on the GSTN portal — enter the acknowledgement it
              returned so this register matches.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="arn">ARN *</Label>
              <Input
                id="arn"
                placeholder="AA270424000000X"
                value={filingForm.arn}
                onChange={(e) =>
                  setFilingForm({ ...filingForm, arn: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filing-date">Filing Date</Label>
              <Input
                id="filing-date"
                type="date"
                value={filingForm.filingDate}
                onChange={(e) =>
                  setFilingForm({ ...filingForm, filingDate: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFilingReturn(null)}
              disabled={!!busyId}
            >
              Cancel
            </Button>
            <Button onClick={handleRecordFiling} disabled={!!busyId}>
              {busyId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {filingReturn?.revision ? "Record Revision" : "Mark as Filed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

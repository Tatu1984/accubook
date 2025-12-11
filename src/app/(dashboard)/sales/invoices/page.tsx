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
  Send,
  Printer,
  Copy,
  CheckCircle,
  Clock,
  AlertCircle,
  Mail,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useOrganization } from "@/hooks/use-organization";
import { toast } from "sonner";

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  party: {
    id: string;
    name: string;
    gstNo?: string;
  };
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  amountDue: string;
  status: "DRAFT" | "SENT" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";
}

interface ApiResponse {
  data: Invoice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const statusConfig = {
  DRAFT: { color: "bg-gray-100 text-gray-800", icon: FileText },
  SENT: { color: "bg-blue-100 text-blue-800", icon: Send },
  PARTIAL: { color: "bg-yellow-100 text-yellow-800", icon: Clock },
  PAID: { color: "bg-green-100 text-green-800", icon: CheckCircle },
  OVERDUE: { color: "bg-red-100 text-red-800", icon: AlertCircle },
  CANCELLED: { color: "bg-gray-100 text-gray-800", icon: Trash2 },
};

function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num || 0);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export default function InvoicesPage() {
  const { organizationId, isLoading: authLoading } = useOrganization();
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = React.useState<string | null>(null);

  // Fetch invoices from API
  const fetchInvoices = React.useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/invoices?limit=100`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch invoices");
      }

      const result: ApiResponse = await response.json();
      setInvoices(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      fetchInvoices();
    }
  }, [organizationId, fetchInvoices]);

  // Delete invoice
  const handleDelete = async () => {
    if (!invoiceToDelete || !organizationId) return;

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/invoices/${invoiceToDelete}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to delete invoice");
      }

      toast.success("Invoice deleted successfully");
      fetchInvoices();
    } catch (err) {
      toast.error("Failed to delete invoice");
    } finally {
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
    }
  };

  // Update invoice status
  const handleStatusUpdate = async (invoiceId: string, newStatus: string) => {
    if (!organizationId) return;

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/invoices/${invoiceId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update invoice status");
      }

      toast.success(`Invoice ${newStatus.toLowerCase()}`);
      fetchInvoices();
    } catch (err) {
      toast.error("Failed to update invoice status");
    }
  };

  // Filter invoices by status
  const filteredInvoices = React.useMemo(() => {
    if (selectedStatus === "all") return invoices;
    return invoices.filter((inv) => inv.status === selectedStatus);
  }, [invoices, selectedStatus]);

  // Summary stats
  const stats = React.useMemo(() => {
    const activeInvoices = invoices.filter((i) => i.status !== "CANCELLED");
    return {
      total: invoices.length,
      totalAmount: activeInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0),
      totalReceived: activeInvoices.reduce((sum, i) => sum + parseFloat(i.amountPaid || "0"), 0),
      totalDue: activeInvoices.reduce((sum, i) => sum + parseFloat(i.amountDue || "0"), 0),
      overdue: activeInvoices.filter((i) => i.status === "OVERDUE").length,
      overdueAmount: activeInvoices
        .filter((i) => i.status === "OVERDUE")
        .reduce((sum, i) => sum + parseFloat(i.amountDue || "0"), 0),
    };
  }, [invoices]);

  // Column definitions
  const columns: ColumnDef<Invoice>[] = [
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
      accessorKey: "invoiceNumber",
      header: "Invoice No.",
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("invoiceNumber")}</span>
      ),
    },
    {
      accessorKey: "party",
      header: "Customer",
      cell: ({ row }) => {
        const party = row.original.party;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{party?.name || "-"}</span>
            {party?.gstNo && (
              <span className="text-xs text-muted-foreground">{party.gstNo}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "totalAmount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="justify-end w-full"
        >
          Total
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">
          {formatCurrency(row.getValue("totalAmount"))}
        </div>
      ),
    },
    {
      accessorKey: "amountDue",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="justify-end w-full"
        >
          Due
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const due = parseFloat(row.getValue("amountDue") || "0");
        const total = parseFloat(row.original.totalAmount || "0");
        const paid = parseFloat(row.original.amountPaid || "0");
        const paidPercent = total > 0 ? (paid / total) * 100 : 0;

        return (
          <div className="text-right space-y-1">
            <span
              className={cn(
                "font-medium tabular-nums",
                due > 0 && row.original.status === "OVERDUE" && "text-red-600"
              )}
            >
              {formatCurrency(due)}
            </span>
            {total > 0 && due > 0 && (
              <Progress value={paidPercent} className="h-1.5 w-20 ml-auto" />
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => {
        const dueDate = row.getValue("dueDate") as string;
        const status = row.original.status;
        const daysOverdue = getDaysOverdue(dueDate);

        return (
          <div className="flex flex-col">
            <span>{formatDate(dueDate)}</span>
            {status === "OVERDUE" && (
              <span className="text-xs text-red-600">{daysOverdue} days overdue</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as keyof typeof statusConfig;
        const config = statusConfig[status] || statusConfig.DRAFT;
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
        const invoice = row.original;
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
              <DropdownMenuItem asChild>
                <Link href={`/sales/invoices/${invoice.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {invoice.status === "DRAFT" && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/sales/invoices/${invoice.id}/edit`}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate(invoice.id, "SENT")}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Send Invoice
                  </DropdownMenuItem>
                </>
              )}
              {(invoice.status === "SENT" ||
                invoice.status === "PARTIAL" ||
                invoice.status === "OVERDUE") && (
                <>
                  <DropdownMenuItem>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Reminder
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/sales/receipts/new?invoiceId=${invoice.id}`}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Record Payment
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => {
                  setInvoiceToDelete(invoice.id);
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {invoice.status === "DRAFT" ? "Delete" : "Cancel Invoice"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

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
          <h1 className="text-2xl font-bold tracking-tight">Sales Invoices</h1>
          <p className="text-muted-foreground">
            Create and manage your sales invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button asChild>
            <Link href="/sales/invoices/new">
              <Plus className="mr-2 h-4 w-4" />
              New Invoice
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</div>
            <p className="text-xs text-muted-foreground">{stats.total} invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Amount Received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.totalReceived)}
            </div>
            <Progress
              value={stats.totalAmount > 0 ? (stats.totalReceived / stats.totalAmount) * 100 : 0}
              className="h-2 mt-2"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Amount Due</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(stats.totalDue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.overdueAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.overdue} invoices overdue
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalAmount > 0
                ? Math.round((stats.totalReceived / stats.totalAmount) * 100)
                : 0}
              %
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="DRAFT">Draft</TabsTrigger>
          <TabsTrigger value="SENT">Sent</TabsTrigger>
          <TabsTrigger value="PARTIAL">Partial</TabsTrigger>
          <TabsTrigger value="PAID">Paid</TabsTrigger>
          <TabsTrigger value="OVERDUE">Overdue</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Invoices Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <p className="text-muted-foreground">{error}</p>
              <Button onClick={fetchInvoices}>Retry</Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredInvoices}
              searchKey="invoiceNumber"
              searchPlaceholder="Search invoices..."
            />
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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

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
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Printer,
  Loader2,
  AlertCircle,
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
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useOrganization } from "@/hooks/use-organization";
import { toast } from "sonner";

// Types matching API response
interface VoucherEntry {
  id: string;
  ledgerId: string;
  debitAmount: string;
  creditAmount: string;
  narration?: string;
  ledger: {
    id: string;
    name: string;
  };
}

interface Voucher {
  id: string;
  voucherNumber: string;
  date: string;
  narration?: string;
  referenceNo?: string;
  totalDebit: string;
  totalCredit: string;
  status: "DRAFT" | "PENDING" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  voucherType: {
    id: string;
    name: string;
    code: string;
    nature: string;
  };
  entries: VoucherEntry[];
  createdBy?: {
    id: string;
    name: string;
  };
}

interface ApiResponse {
  data: Voucher[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const voucherTypeColors: Record<string, string> = {
  PAYMENT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  RECEIPT: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  JOURNAL: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  CONTRA: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  SALES: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  PURCHASE: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  DEBIT_NOTE: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  CREDIT_NOTE: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
};

const statusConfig = {
  DRAFT: { color: "bg-gray-100 text-gray-800", icon: Clock },
  PENDING: { color: "bg-yellow-100 text-yellow-800", icon: Clock },
  PENDING_APPROVAL: { color: "bg-yellow-100 text-yellow-800", icon: Clock },
  APPROVED: { color: "bg-green-100 text-green-800", icon: CheckCircle },
  REJECTED: { color: "bg-red-100 text-red-800", icon: XCircle },
  CANCELLED: { color: "bg-gray-100 text-gray-800", icon: XCircle },
};

function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function VouchersPage() {
  const { organizationId, isLoading: authLoading } = useOrganization();
  const [vouchers, setVouchers] = React.useState<Voucher[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedType, setSelectedType] = React.useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [voucherToDelete, setVoucherToDelete] = React.useState<string | null>(null);
  const [pagination, setPagination] = React.useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  // Fetch vouchers from API
  const fetchVouchers = React.useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      const response = await fetch(
        `/api/organizations/${organizationId}/vouchers?${params}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch vouchers");
      }

      const result: ApiResponse = await response.json();
      setVouchers(result.data);
      setPagination(result.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      toast.error("Failed to load vouchers");
    } finally {
      setLoading(false);
    }
  }, [organizationId, pagination.page, pagination.limit]);

  React.useEffect(() => {
    if (organizationId) {
      fetchVouchers();
    }
  }, [organizationId, fetchVouchers]);

  // Delete voucher
  const handleDelete = async () => {
    if (!voucherToDelete || !organizationId) return;

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/vouchers/${voucherToDelete}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to delete voucher");
      }

      toast.success("Voucher deleted successfully");
      fetchVouchers();
    } catch (err) {
      toast.error("Failed to delete voucher");
    } finally {
      setDeleteDialogOpen(false);
      setVoucherToDelete(null);
    }
  };

  // Update voucher status
  const handleStatusUpdate = async (voucherId: string, newStatus: string) => {
    if (!organizationId) return;

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/vouchers/${voucherId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update voucher status");
      }

      toast.success(`Voucher ${newStatus.toLowerCase()}`);
      fetchVouchers();
    } catch (err) {
      toast.error("Failed to update voucher status");
    }
  };

  // Filter vouchers by type
  const filteredVouchers = React.useMemo(() => {
    if (selectedType === "all") return vouchers;
    return vouchers.filter((v) => v.voucherType?.code === selectedType);
  }, [vouchers, selectedType]);

  // Summary stats
  const stats = React.useMemo(() => {
    return {
      total: vouchers.length,
      draft: vouchers.filter((v) => v.status === "DRAFT").length,
      pending: vouchers.filter((v) => v.status === "PENDING" || v.status === "PENDING_APPROVAL").length,
      approved: vouchers.filter((v) => v.status === "APPROVED").length,
      totalAmount: vouchers
        .filter((v) => v.status === "APPROVED")
        .reduce((sum, v) => sum + parseFloat(v.totalDebit || "0"), 0),
    };
  }, [vouchers]);

  // Column definitions
  const columns: ColumnDef<Voucher>[] = [
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
      accessorKey: "voucherNumber",
      header: "Voucher No.",
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("voucherNumber")}</span>
      ),
    },
    {
      accessorKey: "voucherType",
      header: "Type",
      cell: ({ row }) => {
        const type = row.original.voucherType;
        if (!type) return "-";
        return (
          <Badge
            variant="secondary"
            className={cn("text-xs", voucherTypeColors[type.code] || "bg-gray-100")}
          >
            {type.name}
          </Badge>
        );
      },
    },
    {
      accessorKey: "narration",
      header: "Narration",
      cell: ({ row }) => (
        <span className="max-w-[200px] truncate block">
          {row.getValue("narration") || "-"}
        </span>
      ),
    },
    {
      accessorKey: "totalDebit",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="justify-end w-full"
        >
          Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">
          {formatCurrency(row.getValue("totalDebit"))}
        </div>
      ),
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
            {status.replace(/_/g, " ")}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const voucher = row.original;
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
                <Link href={`/accounting/vouchers/${voucher.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {voucher.status === "DRAFT" && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/vouchers/${voucher.id}/edit`}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusUpdate(voucher.id, "PENDING_APPROVAL")}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Submit for Approval
                  </DropdownMenuItem>
                </>
              )}
              {(voucher.status === "PENDING" || voucher.status === "PENDING_APPROVAL") && (
                <>
                  <DropdownMenuItem
                    className="text-green-600"
                    onClick={() => handleStatusUpdate(voucher.id, "APPROVED")}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => handleStatusUpdate(voucher.id, "REJECTED")}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => {
                  setVoucherToDelete(voucher.id);
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
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
          <h1 className="text-2xl font-bold tracking-tight">Vouchers</h1>
          <p className="text-muted-foreground">
            Manage all your accounting vouchers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Voucher
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/accounting/vouchers/new?type=PAYMENT">
                  Payment Voucher
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accounting/vouchers/new?type=RECEIPT">
                  Receipt Voucher
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accounting/vouchers/new?type=JOURNAL">
                  Journal Voucher
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accounting/vouchers/new?type=CONTRA">
                  Contra Voucher
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/accounting/vouchers/new?type=SALES">
                  Sales Voucher
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accounting/vouchers/new?type=PURCHASE">
                  Purchase Voucher
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Vouchers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={selectedType} onValueChange={setSelectedType}>
        <TabsList>
          <TabsTrigger value="all">All Vouchers</TabsTrigger>
          <TabsTrigger value="PAYMENT">Payment</TabsTrigger>
          <TabsTrigger value="RECEIPT">Receipt</TabsTrigger>
          <TabsTrigger value="JOURNAL">Journal</TabsTrigger>
          <TabsTrigger value="CONTRA">Contra</TabsTrigger>
          <TabsTrigger value="SALES">Sales</TabsTrigger>
          <TabsTrigger value="PURCHASE">Purchase</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Vouchers Table */}
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
              <Button onClick={fetchVouchers}>Retry</Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredVouchers}
              searchKey="voucherNumber"
              searchPlaceholder="Search vouchers..."
            />
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this voucher? This action cannot be undone.
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

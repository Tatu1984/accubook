"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle, Pencil } from "lucide-react";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
import { cn } from "@/shared/utils/common.util";

// --- Types matching GET /api/organizations/[orgId]/vouchers/[voucherId] ---
interface VoucherEntry {
  id: string;
  debitAmount: string;
  creditAmount: string;
  narration?: string | null;
  ledger: {
    id: string;
    name: string;
    group?: { name: string; nature: string } | null;
  };
}

interface VoucherDetail {
  id: string;
  voucherNumber: string;
  date: string;
  narration?: string | null;
  referenceNo?: string | null;
  totalDebit: string;
  totalCredit: string;
  status: keyof typeof statusConfig;
  isPosted: boolean;
  createdAt: string;
  postedAt?: string | null;
  voucherType: { id: string; name: string; code: string; nature: string };
  fiscalYear?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
  entries: VoucherEntry[];
  createdBy?: { id: string; name: string | null; email: string } | null;
  approvedBy?: { id: string; name: string | null; email: string } | null;
}

// Shared with the vouchers list page — kept identical so the two views read
// the same way. (If these ever need to be truly shared, lift to a helper.)
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

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "bg-gray-100 text-gray-800" },
  PENDING: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  PENDING_APPROVAL: { label: "Pending Approval", color: "bg-yellow-100 text-yellow-800" },
  APPROVED: { label: "Approved", color: "bg-green-100 text-green-800" },
  REJECTED: { label: "Rejected", color: "bg-red-100 text-red-800" },
  CANCELLED: { label: "Cancelled", color: "bg-gray-100 text-gray-800" },
};

function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(num) ? num : 0);
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function VoucherDetailPage() {
  const params = useParams();
  const voucherId = params.voucherId as string;
  const { organizationId, isLoading: authLoading } = useOrganization();

  const [voucher, setVoucher] = React.useState<VoucherDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!organizationId || !voucherId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/vouchers/${voucherId}`
        );
        if (res.status === 404) throw new Error("This voucher no longer exists.");
        if (!res.ok) throw new Error("Failed to load voucher");
        const data = (await res.json()) as VoucherDetail;
        if (!cancelled) setVoucher(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load voucher");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, voucherId]);

  const backLink = (
    <Button variant="ghost" size="sm" asChild>
      <Link href="/accounting/vouchers">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Vouchers
      </Link>
    </Button>
  );

  if (authLoading || loading) {
    return (
      <div className="p-6">
        {backLink}
        <div className="mt-10 flex items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading voucher…
        </div>
      </div>
    );
  }

  if (error || !voucher) {
    return (
      <div className="p-6">
        {backLink}
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="font-medium">{error ?? "Voucher not found"}</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/accounting/vouchers">Back to Vouchers</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const typeCode = voucher.voucherType?.code ?? "";
  const status = statusConfig[voucher.status] ?? statusConfig.DRAFT;
  const balanced =
    parseFloat(voucher.totalDebit) === parseFloat(voucher.totalCredit);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          {backLink}
          <h1 className="mt-2 text-2xl font-bold">
            {voucher.voucherNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {voucher.voucherType?.name} voucher
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn(voucherTypeColors[typeCode] ?? "bg-gray-100 text-gray-800")}>
            {voucher.voucherType?.name ?? typeCode}
          </Badge>
          <Badge className={status.color}>{status.label}</Badge>
          {/* Edit is only meaningful before posting — the PATCH API refuses
              content edits on a posted voucher. */}
          {!voucher.isPosted ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/accounting/vouchers/${voucher.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Header details */}
      <Card>
        <CardHeader>
          <CardTitle>Voucher Details</CardTitle>
          <CardDescription>Header information for this entry</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Voucher No." value={voucher.voucherNumber} />
          <Detail label="Date" value={formatDate(voucher.date)} />
          <Detail label="Type" value={voucher.voucherType?.name ?? "—"} />
          <Detail label="Fiscal Year" value={voucher.fiscalYear?.name ?? "—"} />
          <Detail label="Branch" value={voucher.branch?.name ?? "—"} />
          <Detail label="Reference No." value={voucher.referenceNo || "—"} />
          <Detail label="Posted" value={voucher.isPosted ? `Yes (${formatDate(voucher.postedAt)})` : "No"} />
          <Detail label="Created By" value={voucher.createdBy?.name || voucher.createdBy?.email || "—"} />
          <Detail label="Approved By" value={voucher.approvedBy?.name || voucher.approvedBy?.email || "—"} />
          <div className="sm:col-span-2 lg:col-span-3">
            <Detail label="Narration" value={voucher.narration || "—"} />
          </div>
        </CardContent>
      </Card>

      {/* Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Voucher Entries</CardTitle>
          <CardDescription>Debit and credit lines</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ledger Account</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {voucher.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-medium">{e.ledger?.name ?? "—"}</div>
                      {e.ledger?.group?.name ? (
                        <div className="text-xs text-muted-foreground">
                          {e.ledger.group.name}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.narration || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {parseFloat(e.debitAmount) > 0 ? formatCurrency(e.debitAmount) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {parseFloat(e.creditAmount) > 0 ? formatCurrency(e.creditAmount) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(voucher.totalDebit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(voucher.totalCredit)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {!balanced ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Debit and credit totals do not match.
            </p>
          ) : null}
        </CardContent>
      </Card>

    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Textarea } from "@/frontend/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";

// --- Types matching GET /api/organizations/[orgId]/vouchers/[voucherId] ---
interface VoucherEntry {
  id: string;
  debitAmount: string;
  creditAmount: string;
  narration?: string | null;
  ledger: { id: string; name: string };
}

interface VoucherDetail {
  id: string;
  voucherNumber: string;
  date: string;
  narration?: string | null;
  referenceNo?: string | null;
  totalDebit: string;
  totalCredit: string;
  status: string;
  isPosted: boolean;
  voucherType: { id: string; name: string; code: string };
  entries: VoucherEntry[];
}

function formatCurrency(amount: number | string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(num) ? num : 0);
}

/**
 * Voucher edit.
 *
 * The PATCH /vouchers/[voucherId] API only accepts `narration` and `date`
 * (plus `status`, handled elsewhere via the approve/cancel actions), and it
 * refuses content edits on a *posted* voucher — the books must be restated by
 * moving it back to DRAFT first. The voucher's debit/credit *entries* are NOT
 * editable through the API, so we show them read-only here rather than pretend
 * they can be changed. This keeps the UI honest with what the backend allows.
 */
export default function EditVoucherPage() {
  const params = useParams();
  const router = useRouter();
  const voucherId = params.voucherId as string;
  const { organizationId, isLoading: authLoading } = useOrganization();

  const [voucher, setVoucher] = React.useState<VoucherDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Editable fields (only what the API accepts).
  const [date, setDate] = React.useState("");
  const [narration, setNarration] = React.useState("");

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
        if (cancelled) return;
        setVoucher(data);
        setDate(data.date ? data.date.split("T")[0] : "");
        setNarration(data.narration ?? "");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucher) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/vouchers/${voucherId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, narration }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update voucher");
      }
      toast.success("Voucher updated");
      router.push(`/accounting/vouchers/${voucherId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update voucher");
    } finally {
      setSaving(false);
    }
  };

  const backLink = (
    <Button variant="ghost" size="sm" asChild>
      <Link href={`/accounting/vouchers/${voucherId}`}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
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

  // Posted vouchers can't be edited via PATCH — surface that clearly instead
  // of letting the user type into fields the API will reject.
  if (voucher.isPosted) {
    return (
      <div className="p-6">
        {backLink}
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <p className="font-medium">
              {voucher.voucherNumber} is posted and can&apos;t be edited.
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Move it back to Draft first (from the voucher actions) to restate
              the books, then edit.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/accounting/vouchers/${voucherId}`}>View Voucher</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        {backLink}
        <h1 className="mt-2 text-2xl font-bold">Edit {voucher.voucherNumber}</h1>
        <p className="text-sm text-muted-foreground">
          {voucher.voucherType?.name} voucher · {voucher.status}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Voucher Details</CardTitle>
            <CardDescription>
              Date and narration are editable. Ledger entries can&apos;t be
              changed after creation — create a new voucher to correct amounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Reference No.</Label>
                <Input value={voucher.referenceNo ?? ""} disabled readOnly />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="narration">Narration</Label>
              <Textarea
                id="narration"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                rows={2}
                placeholder="Description or notes for this voucher"
              />
            </div>
          </CardContent>
        </Card>

        {/* Read-only entries — the API doesn't support editing these. */}
        <Card>
          <CardHeader>
            <CardTitle>Voucher Entries</CardTitle>
            <CardDescription>Read-only</CardDescription>
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
                      <TableCell className="font-medium">{e.ledger?.name ?? "—"}</TableCell>
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
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href={`/accounting/vouchers/${voucherId}`}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Inbox,
  Sparkles,
  IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { cn } from "@/shared/utils/common.util";

interface ExtractionRow {
  id: string;
  source: string;
  sourceRef: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: string;
  docType: string;
  direction: string | null;
  provider: string | null;
  model: string | null;
  costMicroUsd: number | null;
  error: string | null;
  postedEntityType: string | null;
  postedEntityId: string | null;
  createdAt: string;
  extracted: Record<string, unknown> | null;
  reviewed: Record<string, unknown> | null;
}

interface EngineStatus {
  mode: string;
  paidAvailable: boolean;
  model: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  PROCESSING: "bg-blue-100 text-blue-800",
  NEEDS_REVIEW: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  REJECTED: "bg-slate-100 text-slate-700",
  FAILED: "bg-red-100 text-red-800",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  PURCHASE_BILL: "Purchase bill",
  SALES_INVOICE: "Sales invoice",
  PAYMENT_VOUCHER: "Payment voucher",
  RECEIPT: "Receipt",
  UNKNOWN: "Unclassified",
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function readField(row: ExtractionRow, key: string): string | null {
  const source = (row.reviewed ?? row.extracted) as Record<string, unknown> | null;
  const value = source?.[key];
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

/**
 * Everything that has come in as a picture.
 *
 * The queue is the point: documents arrive faster than anyone posts them, and
 * the job of this screen is to make "what still needs a human" obvious and one
 * click away. Cost sits on the page rather than in a settings corner because
 * extraction is charged by the page and someone has to see what it is running to.
 */
export default function DocumentInboxPage() {
  const router = useRouter();
  const { organizationId, isLoading: authLoading } = useOrganization();
  const [rows, setRows] = React.useState<ExtractionRow[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [engine, setEngine] = React.useState<EngineStatus | null>(null);
  const [usage, setUsage] = React.useState<{
    last30Days: { documents: number; costInr: number; avgCostInrPerDocument: number };
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [tab, setTab] = React.useState("NEEDS_REVIEW");
  const fileInput = React.useRef<HTMLInputElement>(null);

  const fetchRows = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const query = tab === "ALL" ? "" : `?status=${tab}`;
      const [listRes, usageRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/documents/extractions${query}`),
        fetch(`/api/organizations/${organizationId}/documents/extractions?view=usage`),
      ]);
      if (listRes.ok) {
        const body = await listRes.json();
        setRows(body.data ?? []);
        setCounts(body.counts ?? {});
        setEngine(body.engine ?? null);
      }
      if (usageRes.ok) setUsage(await usageRes.json());
    } catch {
      toast.error("Failed to load the document inbox");
    } finally {
      setLoading(false);
    }
  }, [organizationId, tab]);

  React.useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const upload = async (files: FileList | File[]) => {
    if (!organizationId) return;
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploading(true);
    let lastId: string | null = null;
    try {
      for (const file of list) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch(
          `/api/organizations/${organizationId}/documents/extractions`,
          { method: "POST", body: form }
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast.error(body.error || `${file.name} could not be read`);
          continue;
        }
        lastId = body.id;
        toast.success(
          body.error
            ? `${file.name} stored — it needs to be filled in by hand`
            : `${file.name} read and ready to check`
        );
      }
      await fetchRows();
      // One document at a time means going straight to checking it.
      if (list.length === 1 && lastId) router.push(`/documents/${lastId}`);
    } finally {
      setUploading(false);
    }
  };

  const needsReview = counts.NEEDS_REVIEW ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Photograph, scan or drop a bill here. It is read for you; you check it against
            the original and post it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {engine && (
            <Badge variant="outline" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {engine.paidAvailable && engine.mode !== "free"
                ? `Reading with ${engine.model}`
                : "Free reading (PDFs and photos)"}
            </Badge>
          )}
          <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload documents
          </Button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) upload(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files) upload(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
      >
        <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-60" />
        <p className="font-medium">Drop bills, invoices or vouchers here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF or photo, up to 20 MB each. A phone picture of a handwritten challan is fine.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Waiting to be checked</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{needsReview}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Posted from a document</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{counts.CONFIRMED ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Extraction cost, last 30 days</CardDescription>
            <CardTitle className="flex items-baseline gap-2 text-3xl tabular-nums">
              <IndianRupee className="h-5 w-5" />
              {(usage?.last30Days.costInr ?? 0).toFixed(2)}
            </CardTitle>
            {usage && usage.last30Days.documents > 0 && (
              <p className="text-xs text-muted-foreground">
                {inr.format(usage.last30Days.avgCostInrPerDocument)} per document across{" "}
                {usage.last30Days.documents}
              </p>
            )}
          </CardHeader>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="NEEDS_REVIEW">
            To check{needsReview > 0 ? ` (${needsReview})` : ""}
          </TabsTrigger>
          <TabsTrigger value="CONFIRMED">Posted</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading || authLoading ? (
            <div className="flex h-56 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="mb-3 h-10 w-10 text-muted-foreground opacity-50" />
              <p className="font-medium">Nothing here</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Drop a vendor bill above and it will appear here, read and waiting to be
                checked.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Number / date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Read by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const total = readField(row, "totalAmount");
                  return (
                    <TableRow key={row.id} className="cursor-pointer">
                      <TableCell onClick={() => router.push(`/documents/${row.id}`)}>
                        <div className="flex items-center gap-2">
                          {row.mimeType === "application/pdf" ? (
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {DOC_TYPE_LABELS[row.docType] ?? row.docType}
                              {row.direction ? ` · ${row.direction.toLowerCase()}` : ""}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell onClick={() => router.push(`/documents/${row.id}`)}>
                        {readField(row, "partyName") ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={() => router.push(`/documents/${row.id}`)}>
                        <p>{readField(row, "documentNumber") ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {readField(row, "documentDate") ?? ""}
                        </p>
                      </TableCell>
                      <TableCell
                        className="text-right font-mono"
                        onClick={() => router.push(`/documents/${row.id}`)}
                      >
                        {total ? inr.format(Number(total)) : "—"}
                      </TableCell>
                      <TableCell onClick={() => router.push(`/documents/${row.id}`)}>
                        <div className="text-xs">
                          <p>{row.provider ?? "—"}</p>
                          {row.costMicroUsd ? (
                            <p className="text-muted-foreground">
                              ${(row.costMicroUsd / 1_000_000).toFixed(4)}
                            </p>
                          ) : (
                            <p className="text-muted-foreground">free</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={() => router.push(`/documents/${row.id}`)}>
                        <Badge
                          variant="secondary"
                          className={cn("gap-1", STATUS_STYLES[row.status])}
                        >
                          {row.status === "CONFIRMED" && <CheckCircle2 className="h-3 w-3" />}
                          {row.error && row.status !== "CONFIRMED" && (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {row.status.replace("_", " ").toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.postedEntityType === "Bill" && row.postedEntityId ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href="/purchases/bills">View bill</Link>
                          </Button>
                        ) : row.postedEntityType === "Invoice" && row.postedEntityId ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/sales/invoices/${row.postedEntityId}`}>
                              View invoice
                            </Link>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/documents/${row.id}`}>Check</Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

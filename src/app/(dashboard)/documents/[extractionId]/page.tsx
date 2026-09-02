"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Trash2,
  Plus,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import { Textarea } from "@/frontend/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { DocumentViewer } from "@/frontend/components/features/documents/document-viewer";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { cn } from "@/shared/utils/common.util";

interface ExtractedLine {
  description?: string | null;
  hsnCode?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  discountPercent?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  amount?: number | null;
}

interface ExtractedDocument {
  docType: string;
  direction?: string | null;
  partyName?: string | null;
  partyGstin?: string | null;
  partyPan?: string | null;
  partyAddress?: string | null;
  partyState?: string | null;
  partyPhone?: string | null;
  partyEmail?: string | null;
  documentNumber?: string | null;
  documentDate?: string | null;
  dueDate?: string | null;
  poNumber?: string | null;
  placeOfSupply?: string | null;
  reverseCharge?: boolean | null;
  currency?: string | null;
  subtotal?: number | null;
  discountAmount?: number | null;
  cgstAmount?: number | null;
  sgstAmount?: number | null;
  igstAmount?: number | null;
  cessAmount?: number | null;
  roundOff?: number | null;
  totalAmount?: number | null;
  amountInWords?: string | null;
  paymentMode?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  lines: ExtractedLine[];
}

interface Extraction {
  id: string;
  fileName: string;
  mimeType: string;
  status: string;
  docType: string;
  direction: string | null;
  provider: string | null;
  model: string | null;
  costMicroUsd: number | null;
  durationMs: number | null;
  error: string | null;
  extracted: ExtractedDocument | null;
  reviewed: ExtractedDocument | null;
  confidence: Record<string, number> | null;
  postedEntityType: string | null;
  postedEntityId: string | null;
}

interface PartyOption {
  id: string;
  name: string;
  gstNo: string | null;
  type: string;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const emptyDocument = (): ExtractedDocument => ({ docType: "UNKNOWN", lines: [] });

/** Anything the extractor was unsure of gets a mark, so the eye goes there first. */
const LOW_CONFIDENCE = 0.8;

function num(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Check the reading against the paper, then post it.
 *
 * The original on the left and the form on the right is the entire design: the
 * machine proposes, a person checks each figure against the picture, and only
 * then does anything reach the books. Fields the extractor was unsure of are
 * marked so the checking has an order to it rather than being a re-read of
 * everything.
 *
 * Corrections save as you go. A reviewer interrupted halfway through a stack
 * of bills should lose nothing, and the saved version is kept apart from the
 * machine's original reading so the two remain comparable.
 */
export default function DocumentReviewPage() {
  const router = useRouter();
  const params = useParams<{ extractionId: string }>();
  const { organizationId, isLoading: authLoading } = useOrganization();

  const [row, setRow] = React.useState<Extraction | null>(null);
  const [doc, setDoc] = React.useState<ExtractedDocument>(emptyDocument());
  const [parties, setParties] = React.useState<PartyOption[]>([]);
  const [partyId, setPartyId] = React.useState<string>("new");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [posting, setPosting] = React.useState(false);
  const [rereading, setRereading] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const base = `/api/organizations/${organizationId}/documents/extractions/${params.extractionId}`;

  const load = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const response = await fetch(base);
      if (!response.ok) throw new Error("not found");
      const body: Extraction = await response.json();
      setRow(body);
      setDoc(body.reviewed ?? body.extracted ?? emptyDocument());
      setDirty(false);
    } catch {
      toast.error("That document could not be opened");
      router.push("/documents");
    } finally {
      setLoading(false);
    }
  }, [organizationId, base, router]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Party list for the picker. Loaded once — the match happens by name or
  // GSTIN below, and a document from a new supplier is the common case.
  React.useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const response = await fetch(`/api/organizations/${organizationId}/parties?limit=500`);
      if (!response.ok) return;
      const body = await response.json();
      setParties(Array.isArray(body) ? body : (body.data ?? []));
    })();
  }, [organizationId]);

  // Pre-select the party the document names, so the common case needs no click.
  React.useEffect(() => {
    if (!parties.length || partyId !== "new") return;
    const gstin = doc.partyGstin?.trim().toUpperCase();
    const name = doc.partyName?.trim().toLowerCase();
    const match =
      (gstin && parties.find((p) => p.gstNo?.toUpperCase() === gstin)) ||
      (name && parties.find((p) => p.name.trim().toLowerCase() === name));
    if (match) setPartyId(match.id);
  }, [parties, doc.partyGstin, doc.partyName, partyId]);

  const update = <K extends keyof ExtractedDocument>(key: K, value: ExtractedDocument[K]) => {
    setDoc((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const updateLine = (index: number, patch: Partial<ExtractedLine>) => {
    setDoc((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
    setDirty(true);
  };

  const save = React.useCallback(async () => {
    if (!organizationId || !row || row.status === "CONFIRMED") return;
    setSaving(true);
    try {
      const response = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewed: doc,
          docType: doc.docType,
          direction: doc.direction ?? null,
        }),
      });
      if (!response.ok) throw new Error();
      setDirty(false);
    } catch {
      toast.error("Those corrections could not be saved");
    } finally {
      setSaving(false);
    }
  }, [organizationId, row, base, doc]);

  // Autosave: a stack of bills is checked in one sitting and nobody should
  // have to remember to press save between them.
  React.useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [dirty, save]);

  const computed = React.useMemo(() => {
    const lineTotal = doc.lines.reduce((sum, line) => {
      const amount =
        line.amount ?? (line.quantity ?? 0) * (line.unitPrice ?? 0);
      return sum + amount + (line.taxAmount ?? 0);
    }, 0);
    const taxes =
      (doc.cgstAmount ?? 0) + (doc.sgstAmount ?? 0) + (doc.igstAmount ?? 0) + (doc.cessAmount ?? 0);
    const header = (doc.subtotal ?? 0) - (doc.discountAmount ?? 0) + taxes + (doc.roundOff ?? 0);
    return {
      lineTotal: Number(lineTotal.toFixed(2)),
      headerTotal: Number(header.toFixed(2)),
      stated: doc.totalAmount ?? null,
      taxes,
    };
  }, [doc]);

  const mismatch =
    computed.stated != null && Math.abs(computed.stated - computed.headerTotal) > 1
      ? Number((computed.stated - computed.headerTotal).toFixed(2))
      : null;

  const confidence = row?.confidence ?? {};
  const shaky = (field: string) =>
    typeof confidence[field] === "number" && confidence[field] < LOW_CONFIDENCE;

  const confirm = async () => {
    if (!organizationId) return;
    setPosting(true);
    try {
      const response = await fetch(`${base}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: doc,
          partyId: partyId === "new" ? undefined : partyId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Failed to post this document");

      setConfirmOpen(false);
      toast.success(
        `${body.entityType === "Bill" ? "Bill" : "Invoice"} ${body.number} created as a draft${
          body.partyCreated ? ` and ${doc.partyName} added as a party` : ""
        }`
      );
      router.push(
        body.entityType === "Bill" ? "/purchases/bills" : `/sales/invoices/${body.entityId}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to post this document");
    } finally {
      setPosting(false);
    }
  };

  const reread = async () => {
    if (!organizationId) return;
    setRereading(true);
    try {
      const response = await fetch(`${base}/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: "groq" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not read it again");
      setRow(body);
      setDoc(body.extracted ?? emptyDocument());
      setDirty(false);
      toast.success("Read again — check the fields against the original");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read it again");
    } finally {
      setRereading(false);
    }
  };

  const reject = async () => {
    if (!organizationId) return;
    setRejecting(true);
    try {
      const response = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      if (!response.ok) {
        toast.error("Could not reject this document");
        return;
      }
      setRejectOpen(false);
      toast.success("Rejected — the file stays on record");
      router.push("/documents");
    } finally {
      setRejecting(false);
    }
  };

  if (loading || authLoading || !row) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const posted = row.status === "CONFIRMED";
  const fileSrc = `${base}/file`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/documents">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Inbox
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{row.fileName}</h1>
            <p className="text-xs text-muted-foreground">
              Read by {row.provider ?? "nobody yet"}
              {row.model ? ` (${row.model})` : ""}
              {row.costMicroUsd ? ` · $${(row.costMicroUsd / 1_000_000).toFixed(4)}` : " · free"}
              {row.durationMs ? ` · ${(row.durationMs / 1000).toFixed(1)}s` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saving && (
            <span className="flex items-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Saving
            </span>
          )}
          {!posted && dirty && !saving && (
            <Button variant="ghost" size="sm" onClick={save}>
              <Save className="mr-2 h-4 w-4" />
              Save now
            </Button>
          )}
          {!posted && (
            <>
              <Button variant="outline" size="sm" onClick={reread} disabled={rereading}>
                {rereading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Read again
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button size="sm" onClick={() => setConfirmOpen(true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm &amp; post
              </Button>
            </>
          )}
          {posted && (
            <Badge className="gap-1 bg-green-100 text-green-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Posted as {row.postedEntityType}
            </Badge>
          )}
        </div>
      </div>

      {row.error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{row.error}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: what actually arrived. */}
        <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-9rem)]">
          <DocumentViewer
            src={fileSrc}
            mimeType={row.mimeType}
            fileName={row.fileName}
            className="h-[70vh] lg:h-full"
          />
        </div>

        {/* Right: what we will record. */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Document</CardTitle>
              <CardDescription>
                Check each field against the original. Marked fields are the ones the
                extractor was least sure of.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Type">
                <Select
                  value={doc.docType}
                  onValueChange={(value) => {
                    update("docType", value);
                    update(
                      "direction",
                      value === "PURCHASE_BILL"
                        ? "INCOMING"
                        : value === "SALES_INVOICE"
                          ? "OUTGOING"
                          : (doc.direction ?? null)
                    );
                  }}
                  disabled={posted}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PURCHASE_BILL">Purchase bill (incoming)</SelectItem>
                    <SelectItem value="SALES_INVOICE">Sales invoice (outgoing)</SelectItem>
                    <SelectItem value="PAYMENT_VOUCHER">Payment voucher</SelectItem>
                    <SelectItem value="RECEIPT">Receipt</SelectItem>
                    <SelectItem value="UNKNOWN">Not sure yet</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Document no." flagged={shaky("documentNumber")}>
                <Input
                  value={doc.documentNumber ?? ""}
                  disabled={posted}
                  onChange={(e) => update("documentNumber", e.target.value || null)}
                />
              </Field>
              <Field label="Date" flagged={shaky("documentDate")}>
                <Input
                  type="date"
                  value={doc.documentDate ?? ""}
                  disabled={posted}
                  onChange={(e) => update("documentDate", e.target.value || null)}
                />
              </Field>
              <Field label="Due date">
                <Input
                  type="date"
                  value={doc.dueDate ?? ""}
                  disabled={posted}
                  onChange={(e) => update("dueDate", e.target.value || null)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {doc.docType === "SALES_INVOICE" ? "Customer" : "Vendor"}
              </CardTitle>
              <CardDescription>
                Matched against your parties by GSTIN, then by name. Leave it on “Add from this
                document” to create one.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Party on record</Label>
                <Select value={partyId} onValueChange={setPartyId} disabled={posted}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">
                      Add “{doc.partyName || "this party"}” from this document
                    </SelectItem>
                    {parties.map((party) => (
                      <SelectItem key={party.id} value={party.id}>
                        {party.name}
                        {party.gstNo ? ` · ${party.gstNo}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label="Name" flagged={shaky("partyName")}>
                <Input
                  value={doc.partyName ?? ""}
                  disabled={posted}
                  onChange={(e) => update("partyName", e.target.value || null)}
                />
              </Field>
              <Field label="GSTIN" flagged={shaky("partyGstin")}>
                <Input
                  value={doc.partyGstin ?? ""}
                  disabled={posted}
                  className="font-mono uppercase"
                  onChange={(e) => update("partyGstin", e.target.value.toUpperCase() || null)}
                />
              </Field>
              <Field label="State">
                <Input
                  value={doc.partyState ?? ""}
                  disabled={posted}
                  onChange={(e) => update("partyState", e.target.value || null)}
                />
              </Field>
              <Field label="Place of supply">
                <Input
                  value={doc.placeOfSupply ?? ""}
                  disabled={posted}
                  onChange={(e) => update("placeOfSupply", e.target.value || null)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Lines</CardTitle>
                <CardDescription>
                  {doc.lines.length} line{doc.lines.length === 1 ? "" : "s"} read from the
                  document
                </CardDescription>
              </div>
              {!posted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDoc((prev) => ({ ...prev, lines: [...prev.lines, {}] }));
                    setDirty(true);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add line
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {doc.lines.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No lines were read. Add them, or leave it — the document will post as a
                  single line for the total.
                </p>
              )}
              {doc.lines.map((line, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      placeholder="Description"
                      className="flex-1"
                      value={line.description ?? ""}
                      disabled={posted}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                    />
                    {!posted && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label="Remove line"
                        onClick={() => {
                          setDoc((prev) => ({
                            ...prev,
                            lines: prev.lines.filter((_, i) => i !== index),
                          }));
                          setDirty(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <LineField
                      label="Qty"
                      value={line.quantity}
                      disabled={posted}
                      onChange={(v) => updateLine(index, { quantity: v })}
                    />
                    <LineField
                      label="Rate"
                      value={line.unitPrice}
                      disabled={posted}
                      onChange={(v) => updateLine(index, { unitPrice: v })}
                    />
                    <LineField
                      label="Taxable"
                      value={line.amount}
                      disabled={posted}
                      onChange={(v) => updateLine(index, { amount: v })}
                    />
                    <LineField
                      label="GST %"
                      value={line.taxRate}
                      disabled={posted}
                      onChange={(v) => updateLine(index, { taxRate: v })}
                    />
                    <LineField
                      label="Tax ₹"
                      value={line.taxAmount}
                      disabled={posted}
                      onChange={(v) => updateLine(index, { taxAmount: v })}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Totals</CardTitle>
              <CardDescription>
                The figures as the document states them — not recomputed, so the posted
                record matches the paper.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Taxable value">
                <NumberInput
                  value={doc.subtotal}
                  disabled={posted}
                  onChange={(v) => update("subtotal", v)}
                />
              </Field>
              <Field label="Discount">
                <NumberInput
                  value={doc.discountAmount}
                  disabled={posted}
                  onChange={(v) => update("discountAmount", v)}
                />
              </Field>
              <Field label="CGST">
                <NumberInput
                  value={doc.cgstAmount}
                  disabled={posted}
                  onChange={(v) => update("cgstAmount", v)}
                />
              </Field>
              <Field label="SGST">
                <NumberInput
                  value={doc.sgstAmount}
                  disabled={posted}
                  onChange={(v) => update("sgstAmount", v)}
                />
              </Field>
              <Field label="IGST">
                <NumberInput
                  value={doc.igstAmount}
                  disabled={posted}
                  onChange={(v) => update("igstAmount", v)}
                />
              </Field>
              <Field label="Round off">
                <NumberInput
                  value={doc.roundOff}
                  disabled={posted}
                  onChange={(v) => update("roundOff", v)}
                />
              </Field>
              <Field label="Invoice total" flagged={shaky("totalAmount")}>
                <NumberInput
                  value={doc.totalAmount}
                  disabled={posted}
                  onChange={(v) => update("totalAmount", v)}
                />
              </Field>
              <div className="flex items-end">
                <div className="w-full rounded-md bg-muted/50 p-2 text-xs">
                  <p className="text-muted-foreground">Fields add up to</p>
                  <p className="font-mono text-sm">{inr.format(computed.headerTotal)}</p>
                </div>
              </div>

              {mismatch !== null && (
                <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    The stated total is {inr.format(Math.abs(mismatch))}{" "}
                    {mismatch > 0 ? "more" : "less"} than taxable value + tax. Check the tax
                    figures against the original — a gap this size is usually a misread digit,
                    not a round-off.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={3}
                placeholder="Anything worth recording about this document"
                value={doc.notes ?? ""}
                disabled={posted}
                onChange={(e) => update("notes", e.target.value || null)}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => !posting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Post as a {doc.docType === "SALES_INVOICE" ? "sales invoice" : "purchase bill"}
            </DialogTitle>
            <DialogDescription>
              This creates a draft {doc.docType === "SALES_INVOICE" ? "invoice" : "bill"} for{" "}
              {doc.partyName || "the party"} of {inr.format(doc.totalAmount ?? computed.headerTotal)}.
              Nothing reaches the ledger until it is approved in the normal way.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <Row label="Party">
              {partyId === "new"
                ? `${doc.partyName || "—"} (new)`
                : (parties.find((p) => p.id === partyId)?.name ?? "—")}
            </Row>
            <Row label="Document no.">{doc.documentNumber || "—"}</Row>
            <Row label="Date">{doc.documentDate || "—"}</Row>
            <Row label="Lines">{doc.lines.length || 1}</Row>
            <Row label="Total">{inr.format(doc.totalAmount ?? computed.headerTotal)}</Row>
          </div>

          {mismatch !== null && (
            <p className="text-xs text-amber-700">
              The totals do not tie out by {inr.format(Math.abs(mismatch))} — post only if that
              is what the paper says.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={posting}>
              Keep checking
            </Button>
            <Button onClick={confirm} disabled={posting}>
              {posting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Posting…
                </>
              ) : (
                "Confirm and post"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={(open) => !rejecting && setRejectOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this document?</DialogTitle>
            <DialogDescription>
              Nothing gets posted from it. The file and its reading stay on record — this only
              takes it out of the queue waiting to be checked.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Keep checking
            </Button>
            <Button variant="destructive" onClick={reject} disabled={rejecting}>
              {rejecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting…
                </>
              ) : (
                "Reject document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  flagged,
  children,
}: {
  label: string;
  flagged?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className={cn("text-xs", flagged ? "text-amber-700" : "text-muted-foreground")}>
        {label}
        {flagged && <span className="ml-1" title="The extractor was unsure of this">•</span>}
      </Label>
      <div className={cn("mt-1", flagged && "rounded-md ring-2 ring-amber-300")}>{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  disabled,
  onChange,
}: {
  value: number | null | undefined;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <Input
      inputMode="decimal"
      className="font-mono"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(num(e.target.value))}
    />
  );
}

function LineField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        inputMode="decimal"
        className="mt-0.5 h-8 font-mono text-sm"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(num(e.target.value))}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

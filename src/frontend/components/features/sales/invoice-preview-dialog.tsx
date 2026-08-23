"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Printer, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import {
  InvoiceDocument,
  type InvoiceDetail,
  type InvoiceOrg,
} from "./invoice-document";

interface InvoicePreviewDialogProps {
  /** Invoice to show; null closes the dialog. */
  invoiceId: string | null;
  organizationId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Extra buttons for the header row — e.g. the warehouse's "mark complete". */
  actions?: React.ReactNode;
}

/**
 * The invoice itself, over whatever screen you were on.
 *
 * Used where an invoice is referenced but is not the subject of the page — the
 * stock page's in-progress panel and dispatch queue, where you need to see what
 * was sold without losing the pick list you were working through. Printing
 * hands off to the invoice route, whose print stylesheet already lays the
 * document out for A4.
 */
export function InvoicePreviewDialog({
  invoiceId,
  organizationId,
  onOpenChange,
  actions,
}: InvoicePreviewDialogProps) {
  const [invoice, setInvoice] = React.useState<InvoiceDetail | null>(null);
  const [org, setOrg] = React.useState<InvoiceOrg | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!invoiceId || !organizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setInvoice(null);
      try {
        const [invR, orgR] = await Promise.all([
          fetch(`/api/organizations/${organizationId}/invoices/${invoiceId}`, {
            cache: "no-store",
          }),
          fetch(`/api/organizations/${organizationId}`, { cache: "no-store" }),
        ]);
        const invBody = await invR.json();
        const orgBody = await orgR.json();
        if (cancelled) return;
        if (!invR.ok) throw new Error(invBody.error ?? "Failed to load invoice");
        if (!orgR.ok) throw new Error(orgBody.error ?? "Failed to load organization");
        setInvoice(invBody);
        setOrg(orgBody);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, organizationId]);

  return (
    <Dialog open={!!invoiceId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="pr-8">
            {invoice ? `Invoice ${invoice.invoiceNumber}` : "Invoice"}
          </DialogTitle>
          <DialogDescription>
            {invoice
              ? `${invoice.party.name} · ${invoice.status}`
              : "Loading the invoice behind these units…"}
          </DialogDescription>
          {invoiceId && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!invoice}
                onClick={() =>
                  window.open(
                    `/sales/invoices/${invoiceId}?print=1`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/sales/invoices/${invoiceId}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open full invoice
                </Link>
              </Button>
              {actions}
            </div>
          )}
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto bg-muted/30 p-4">
          {loading && (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {!loading && !error && invoice && org && (
            <InvoiceDocument invoice={invoice} org={org} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

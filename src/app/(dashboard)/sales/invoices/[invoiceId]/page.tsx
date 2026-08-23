"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { useOrganization } from "@/frontend/hooks/use-organization";
import {
  InvoiceDocument,
  type InvoiceDetail,
  type InvoiceOrg,
} from "@/frontend/components/features/sales/invoice-document";

/**
 * Invoice detail + printable view. Customer-facing: tax invoice
 * layout with org-as-supplier header, party-as-bill-to/ship-to,
 * line items with HSN + GST breakdown, totals + amount-in-words,
 * payments-received list, signature block.
 *
 * Print stylesheet hides the dashboard chrome so the page prints
 * clean to A4. For LUT/composition variants the totals block
 * adapts.
 */
export default function InvoiceDetailPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const params = useParams<{ invoiceId: string }>();
  const search = useSearchParams();
  const autoPrint = search.get("print") === "1";
  const [inv, setInv] = React.useState<InvoiceDetail | null>(null);
  const [org, setOrg] = React.useState<InvoiceOrg | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!organizationId || !params.invoiceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [invR, orgR] = await Promise.all([
          fetch(
            `/api/organizations/${organizationId}/invoices/${params.invoiceId}`,
            { cache: "no-store" }
          ),
          fetch(`/api/organizations/${organizationId}`, { cache: "no-store" }),
        ]);
        const invBody = await invR.json();
        const orgBody = await orgR.json();
        if (cancelled) return;
        if (!invR.ok) throw new Error(invBody.error ?? "Failed");
        if (!orgR.ok) throw new Error(orgBody.error ?? "Failed");
        setInv(invBody);
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
  }, [organizationId, params.invoiceId]);

  React.useEffect(() => {
    if (!autoPrint || loading || !inv) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoPrint, loading, inv]);

  if (orgLoading || loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (error || !inv || !org) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        {error ?? "Invoice not found"}
      </div>
    );
  }

  return (
    <div className="invoice-page mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/sales/invoices">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to invoices
          </Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <InvoiceDocument invoice={inv} org={org} />

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white; }
          .invoice-page { max-width: none; padding: 0; }
          .invoice-page .invoice-body { border: none; box-shadow: none; padding: 0; }
          [data-sidebar],
          [data-mobile-trigger],
          .print\\:hidden,
          header,
          nav,
          aside { display: none !important; }
        }
      `}</style>
    </div>
  );
}

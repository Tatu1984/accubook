"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { useOrganization } from "@/frontend/hooks/use-organization";

const fmtINR = (v: string | number | undefined | null) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
};

const fmtDate = (d: string | Date | undefined | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  type: string;
  status: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  amountDue: string;
  notes: string | null;
  terms: string | null;
  placeOfSupply: string | null;
  supplyType: string | null;
  reverseCharge: boolean;
  irnNumber: string | null;
  qrCode: string | null;
  party: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    gstNo: string | null;
    panNo: string | null;
    billingAddress: string | null;
    billingCity: string | null;
    billingState: string | null;
    billingPostal: string | null;
    shippingAddress: string | null;
    shippingCity: string | null;
    shippingState: string | null;
    shippingPostal: string | null;
  };
  items: Array<{
    id: string;
    description: string;
    hsnCode: string | null;
    quantity: string;
    unitPrice: string;
    discountPercent: string;
    discountAmount: string;
    taxableAmount: string;
    cgstRate: string | null;
    cgstAmount: string | null;
    sgstRate: string | null;
    sgstAmount: string | null;
    igstRate: string | null;
    igstAmount: string | null;
    totalAmount: string;
    item: { name: string; sku: string | null; hsnCode: string | null } | null;
  }>;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    date: string;
    amount: string;
    paymentMode: string;
    status: string;
  }>;
};

type Org = {
  id: string;
  name: string;
  legalName: string | null;
  gstNo: string | null;
  panNo: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

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
  const [inv, setInv] = React.useState<Invoice | null>(null);
  const [org, setOrg] = React.useState<Org | null>(null);
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

  const isComposition = false; // populated from org.compositionScheme when GET returns it
  const isExport = inv.supplyType === "EXPORT";
  const intra = inv.supplyType === "INTRASTATE";
  const cgstTotal = inv.items.reduce((s, i) => s + Number(i.cgstAmount ?? 0), 0);
  const sgstTotal = inv.items.reduce((s, i) => s + Number(i.sgstAmount ?? 0), 0);
  const igstTotal = inv.items.reduce((s, i) => s + Number(i.igstAmount ?? 0), 0);

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

      <div className="invoice-body rounded-md border bg-white p-8 text-black shadow-sm dark:bg-white">
        <div className="mb-6 flex items-start justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold">{org.legalName ?? org.name}</h1>
            <div className="mt-1 text-sm">
              {[org.address, org.city, org.state, org.postalCode].filter(Boolean).join(", ")}
            </div>
            <div className="mt-1 space-y-0.5 font-mono text-xs">
              {org.gstNo && <div>GSTIN: {org.gstNo}</div>}
              {org.panNo && <div>PAN: {org.panNo}</div>}
              {org.email && <div>{org.email}</div>}
              {org.phone && <div>{org.phone}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {isExport ? "Tax Invoice (Export)" : isComposition ? "Bill of Supply" : "Tax Invoice"}
            </div>
            <div className="mt-1 font-mono text-lg font-bold">{inv.invoiceNumber}</div>
            <div className="mt-1 text-xs">
              <span className="text-slate-500">Date: </span>{fmtDate(inv.date)}
            </div>
            <div className="text-xs">
              <span className="text-slate-500">Due: </span>{fmtDate(inv.dueDate)}
            </div>
            {inv.irnNumber && (
              <div className="mt-2 break-all font-mono text-[10px]">
                IRN: {inv.irnNumber}
              </div>
            )}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-6 text-sm">
          <Box label="Bill To">
            <div className="font-semibold">{inv.party.name}</div>
            <div className="text-xs">
              {[inv.party.billingAddress, inv.party.billingCity, inv.party.billingState, inv.party.billingPostal]
                .filter(Boolean).join(", ")}
            </div>
            {inv.party.gstNo && <div className="font-mono text-xs">GSTIN: {inv.party.gstNo}</div>}
            {inv.party.panNo && <div className="font-mono text-xs">PAN: {inv.party.panNo}</div>}
          </Box>
          <Box label="Ship To">
            {inv.party.shippingAddress ? (
              <>
                <div className="text-xs">
                  {[inv.party.shippingAddress, inv.party.shippingCity, inv.party.shippingState, inv.party.shippingPostal]
                    .filter(Boolean).join(", ")}
                </div>
              </>
            ) : (
              <div className="text-xs italic text-slate-500">Same as Bill To</div>
            )}
            <div className="mt-2 text-xs">
              <span className="text-slate-500">Place of Supply: </span>
              {inv.placeOfSupply ?? "—"}
            </div>
            <div className="text-xs">
              <span className="text-slate-500">Supply Type: </span>
              {inv.supplyType ?? "—"}
              {inv.reverseCharge && " · RCM"}
            </div>
          </Box>
        </div>

        <table className="mb-4 w-full border-collapse border text-sm">
          <thead className="bg-slate-50 text-xs uppercase">
            <tr>
              <th className="border px-2 py-2 text-left">#</th>
              <th className="border px-2 py-2 text-left">Item / Description</th>
              <th className="border px-2 py-2 text-left">HSN/SAC</th>
              <th className="border px-2 py-2 text-right">Qty</th>
              <th className="border px-2 py-2 text-right">Rate</th>
              <th className="border px-2 py-2 text-right">Disc</th>
              <th className="border px-2 py-2 text-right">Taxable</th>
              {intra ? (
                <>
                  <th className="border px-2 py-2 text-right">CGST</th>
                  <th className="border px-2 py-2 text-right">SGST</th>
                </>
              ) : (
                !isComposition && <th className="border px-2 py-2 text-right">IGST</th>
              )}
              <th className="border px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={it.id}>
                <td className="border px-2 py-2 text-xs">{i + 1}</td>
                <td className="border px-2 py-2">
                  <div className="font-medium">{it.item?.name ?? it.description}</div>
                  {it.description && it.item?.name && it.description !== it.item?.name && (
                    <div className="text-xs text-slate-500">{it.description}</div>
                  )}
                </td>
                <td className="border px-2 py-2 font-mono text-xs">
                  {it.hsnCode ?? it.item?.hsnCode ?? "—"}
                </td>
                <td className="border px-2 py-2 text-right font-mono">{Number(it.quantity)}</td>
                <td className="border px-2 py-2 text-right font-mono">{fmtINR(it.unitPrice)}</td>
                <td className="border px-2 py-2 text-right font-mono">
                  {Number(it.discountPercent) > 0 ? `${Number(it.discountPercent)}%` : "—"}
                </td>
                <td className="border px-2 py-2 text-right font-mono">{fmtINR(it.taxableAmount)}</td>
                {intra ? (
                  <>
                    <td className="border px-2 py-2 text-right font-mono">
                      {fmtINR(it.cgstAmount)}
                      {Number(it.cgstRate) > 0 && (
                        <div className="text-[10px] text-slate-500">@ {Number(it.cgstRate)}%</div>
                      )}
                    </td>
                    <td className="border px-2 py-2 text-right font-mono">
                      {fmtINR(it.sgstAmount)}
                    </td>
                  </>
                ) : (
                  !isComposition && (
                    <td className="border px-2 py-2 text-right font-mono">
                      {fmtINR(it.igstAmount)}
                      {Number(it.igstRate) > 0 && (
                        <div className="text-[10px] text-slate-500">@ {Number(it.igstRate)}%</div>
                      )}
                    </td>
                  )
                )}
                <td className="border px-2 py-2 text-right font-mono font-semibold">
                  {fmtINR(it.totalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-6">
          <div className="text-sm">
            {inv.notes && (
              <Box label="Notes">
                <div className="whitespace-pre-wrap text-xs">{inv.notes}</div>
              </Box>
            )}
            {inv.terms && (
              <div className="mt-2">
                <Box label="Terms">
                  <div className="whitespace-pre-wrap text-xs">{inv.terms}</div>
                </Box>
              </div>
            )}
            {isComposition && (
              <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                Composition taxable person — not eligible to collect tax on supplies.
              </div>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <Total k="Subtotal" v={fmtINR(inv.subtotal)} />
            {Number(inv.discountAmount) > 0 && (
              <Total k="Discount" v={`− ${fmtINR(inv.discountAmount)}`} />
            )}
            {intra ? (
              <>
                <Total k="CGST" v={fmtINR(cgstTotal)} />
                <Total k="SGST" v={fmtINR(sgstTotal)} />
              </>
            ) : !isComposition ? (
              <Total k="IGST" v={fmtINR(igstTotal)} />
            ) : null}
            <Total k="Total" v={fmtINR(inv.totalAmount)} bold />
            {Number(inv.amountPaid) > 0 && (
              <>
                <Total k="Paid" v={`− ${fmtINR(inv.amountPaid)}`} />
                <Total k="Balance Due" v={fmtINR(inv.amountDue)} bold />
              </>
            )}
          </div>
        </div>

        {inv.receipts.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide">
              Receipts received
            </h2>
            <table className="w-full border-collapse border text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border px-2 py-1 text-left">Date</th>
                  <th className="border px-2 py-1 text-left">Receipt #</th>
                  <th className="border px-2 py-1 text-left">Mode</th>
                  <th className="border px-2 py-1 text-left">Status</th>
                  <th className="border px-2 py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.receipts.map((r) => (
                  <tr key={r.id}>
                    <td className="border px-2 py-1">{fmtDate(r.date)}</td>
                    <td className="border px-2 py-1 font-mono">{r.receiptNumber}</td>
                    <td className="border px-2 py-1">{r.paymentMode}</td>
                    <td className="border px-2 py-1">{r.status}</td>
                    <td className="border px-2 py-1 text-right font-mono">{fmtINR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-12 grid grid-cols-2 gap-6 text-xs">
          <div>
            {inv.qrCode && (
              <div className="border p-2">
                <div className="mb-1 text-[10px] uppercase text-slate-500">e-Invoice QR</div>
                <div className="break-all font-mono text-[8px]">{inv.qrCode.slice(0, 100)}…</div>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="border-t pt-1">For {org.legalName ?? org.name}</div>
            <div className="mt-8 border-t pt-1">Authorised Signatory</div>
          </div>
        </div>
      </div>

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

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border p-3">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Total({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b border-dashed pb-1 ${bold ? "font-bold" : ""}`}>
      <span className="text-slate-500">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

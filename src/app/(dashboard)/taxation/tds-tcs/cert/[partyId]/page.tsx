"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
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

type Form16AParty = {
  partyId: string;
  partyName: string;
  partyPan: string | null;
  sections: Array<{
    section: string;
    count: number;
    base: string;
    tax: string;
    effectiveRate: string | null;
  }>;
  totals: { count: number; base: string; tax: string };
};

type Form16AResp = {
  fiscalYear: string;
  quarter: number;
  parties: Form16AParty[];
};

type OrgResp = {
  id: string;
  name: string;
  legalName: string | null;
  gstNo: string | null;
  panNo: string | null;
  tanNo: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

const QUARTER_LABEL: Record<number, string> = {
  1: "Q1 (Apr–Jun)",
  2: "Q2 (Jul–Sep)",
  3: "Q3 (Oct–Dec)",
  4: "Q4 (Jan–Mar)",
};

/**
 * Printable per-party quarterly TDS / TCS certificate.
 *
 * Form 16A (TDS) — issued to every deductee for every quarter; the
 * deductee uses it to claim the credit on their ITR. Form 27D (TCS)
 * is the seller-side equivalent. Layout below mirrors the structure
 * of the official forms — Part I (deductor + deductee identification)
 * + Part II (section-wise summary). The official forms also reference
 * a TRACES challan acknowledgement number which lives outside this
 * system; the section that would carry it is left blank.
 *
 * URL: /taxation/tds-tcs/cert/[partyId]?fy=2025-26&q=1&kind=tds|tcs
 */
export default function CertificatePage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const params = useParams<{ partyId: string }>();
  const sp = useSearchParams();
  const fy = sp.get("fy") ?? "";
  const quarter = Number(sp.get("q") ?? "0") as 0 | 1 | 2 | 3 | 4;
  const kind = (sp.get("kind") ?? "tds") as "tds" | "tcs";

  const [data, setData] = React.useState<Form16AParty | null>(null);
  const [org, setOrg] = React.useState<OrgResp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!organizationId || !fy || !quarter) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const path = kind === "tds" ? "tds-deductions" : "tcs-collections";
        const view = kind === "tds" ? "form16a" : "form27d";
        const [aggR, orgR] = await Promise.all([
          fetch(
            `/api/organizations/${organizationId}/${path}?view=${view}&fy=${fy}&quarter=${quarter}&partyId=${params.partyId}`,
            { cache: "no-store" }
          ),
          fetch(`/api/organizations/${organizationId}`, { cache: "no-store" }),
        ]);
        const aggBody = (await aggR.json()) as Form16AResp;
        const orgBody = (await orgR.json()) as OrgResp;
        if (cancelled) return;
        if (!aggR.ok)
          throw new Error((aggBody as unknown as { error?: string })?.error ?? "Failed");
        if (!orgR.ok)
          throw new Error((orgBody as unknown as { error?: string })?.error ?? "Failed");
        setData(aggBody.parties[0] ?? null);
        setOrg(orgBody);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [organizationId, fy, quarter, params.partyId, kind]);

  if (orgLoading || loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!data || !org) {
    return (
      <div className="text-muted-foreground">
        No certificate data for this party / period combination.
      </div>
    );
  }

  const formNumber = kind === "tds" ? "Form 16A" : "Form 27D";
  const formSubtitle =
    kind === "tds"
      ? "Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source"
      : "Certificate under section 206C of the Income-tax Act, 1961 for tax collected at source";

  return (
    <div className="cert-page mx-auto max-w-4xl space-y-4">
      {/* Toolbar — hidden in print */}
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/taxation/tds-tcs?fy=${fy}&q=${quarter}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Cert body */}
      <div className="cert-body rounded-md border bg-white p-8 text-black shadow-sm dark:bg-white">
        <div className="mb-6 border-b pb-4 text-center">
          <h1 className="text-2xl font-bold">{formNumber}</h1>
          <p className="mt-1 text-xs uppercase tracking-wide">{formSubtitle}</p>
        </div>

        {/* Header — deductor / deductee */}
        <div className="grid grid-cols-2 gap-6 text-sm">
          <Box label={kind === "tds" ? "Deductor (Payer)" : "Collector (Seller)"}>
            <Line k="Name" v={org.legalName ?? org.name} />
            <Line k="Address" v={[org.address, org.city, org.state, org.postalCode].filter(Boolean).join(", ") || "—"} />
            <Line k="PAN" v={org.panNo ?? "—"} mono />
            <Line k="TAN" v={org.tanNo ?? "—"} mono />
            <Line k="GSTIN" v={org.gstNo ?? "—"} mono />
          </Box>
          <Box label={kind === "tds" ? "Deductee (Payee)" : "Collectee (Buyer)"}>
            <Line k="Name" v={data.partyName} />
            <Line k="PAN" v={data.partyPan ?? "(not furnished — penal rate may apply)"} mono />
            <Line k="Period" v={`${QUARTER_LABEL[quarter]} of FY ${fy}`} />
          </Box>
        </div>

        {/* Section-wise summary */}
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">
            Summary of {kind === "tds" ? "tax deducted" : "tax collected"} (section-wise)
          </h2>
          <table className="w-full border-collapse border text-sm">
            <thead className="bg-slate-50 text-xs uppercase">
              <tr>
                <th className="border px-3 py-2 text-left">Section</th>
                <th className="border px-3 py-2 text-right">Transactions</th>
                <th className="border px-3 py-2 text-right">Base amount</th>
                <th className="border px-3 py-2 text-right">Effective rate</th>
                <th className="border px-3 py-2 text-right">{kind === "tds" ? "Tax deducted" : "Tax collected"}</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s) => (
                <tr key={s.section}>
                  <td className="border px-3 py-2 font-mono">{s.section}</td>
                  <td className="border px-3 py-2 text-right">{s.count}</td>
                  <td className="border px-3 py-2 text-right font-mono">{fmtINR(s.base)}</td>
                  <td className="border px-3 py-2 text-right font-mono">
                    {s.effectiveRate ? `${Number(s.effectiveRate).toFixed(2)}%` : "—"}
                  </td>
                  <td className="border px-3 py-2 text-right font-mono">{fmtINR(s.tax)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="border px-3 py-2">Total</td>
                <td className="border px-3 py-2 text-right">{data.totals.count}</td>
                <td className="border px-3 py-2 text-right font-mono">{fmtINR(data.totals.base)}</td>
                <td className="border px-3 py-2"></td>
                <td className="border px-3 py-2 text-right font-mono">{fmtINR(data.totals.tax)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Verification block — official forms include this. The
            challan ack # comes from TRACES filing, which lives
            outside this system; left blank for the user to fill in. */}
        <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
          <Box label="Challan reference (manual)">
            <Line k="ITNS-281 challan #" v="________________________" />
            <Line k="BSR code" v="________________________" />
            <Line k="Deposit date" v="________________________" />
          </Box>
          <Box label="Verification">
            <p className="text-xs leading-snug">
              I, the person responsible for paying / collecting the above tax,
              certify that the information above agrees with the books of account
              of the {kind === "tds" ? "deductor" : "collector"}.
            </p>
            <div className="mt-6 border-t pt-2 text-center text-xs">
              Authorised signatory
            </div>
          </Box>
        </div>

        <div className="mt-8 text-xs text-slate-500">
          Generated by accubook · FY {fy} · {QUARTER_LABEL[quarter]} ·{" "}
          {new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
      </div>

      {/* Print stylesheet — hide app chrome, lay the cert on a single
          page where possible. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white; }
          /* Hide everything except this cert. */
          .cert-page { max-width: none; padding: 0; }
          .cert-page .cert-body { border: none; box-shadow: none; padding: 0; }
          /* Hide the dashboard chrome. */
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
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Line({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-slate-500">{k}:</span>
      <span className={mono ? "font-mono" : ""}>{v}</span>
    </div>
  );
}

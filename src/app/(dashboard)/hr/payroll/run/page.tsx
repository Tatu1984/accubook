"use client";

import * as React from "react";
import { Loader2, Send, Banknote, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Label } from "@/frontend/components/ui/label";
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

const monthLabels = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type BankAccount = {
  id: string;
  name: string;
  bankName?: string | null;
};

type PostMonthResult = {
  voucherId: string;
  voucherNumber: string;
  month: number;
  year: number;
  payslipCount: number;
  totalDebit: string;
  totalCredit: string;
  lines: Array<{ ledger: string; debit: string; credit: string }>;
  totals: {
    gross: string;
    netSalary: string;
    pfEmployee: string;
    pfEmployer: string;
    esiEmployee: string;
    esiEmployer: string;
    professionalTax: string;
    tds: string;
    lop: string;
  };
};

type PayMonthResult = {
  voucherId: string;
  voucherNumber: string;
  month: number;
  year: number;
  payslipCount: number;
  totalNetSalary: string;
  bankAccountId: string | null;
};

export default function PayrollRunPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const now = new Date();
  // Default to last completed month — payroll is usually run after the
  // calendar month closes, not during it.
  const lastMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const [month, setMonth] = React.useState(lastMonth.getUTCMonth() + 1);
  const [year, setYear] = React.useState(lastMonth.getUTCFullYear());

  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = React.useState<string>("");

  const [postLoading, setPostLoading] = React.useState(false);
  const [payLoading, setPayLoading] = React.useState(false);
  const [postResult, setPostResult] = React.useState<PostMonthResult | null>(null);
  const [payResult, setPayResult] = React.useState<PayMonthResult | null>(null);
  const [postError, setPostError] = React.useState<string | null>(null);
  const [payError, setPayError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!organizationId) return;
    fetch(`/api/organizations/${organizationId}/bank-accounts`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        const list = Array.isArray(body)
          ? body
          : Array.isArray(body?.data)
          ? body.data
          : [];
        setBankAccounts(list);
      })
      .catch(() => setBankAccounts([]));
  }, [organizationId]);

  if (orgLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!organizationId) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  async function postToGl() {
    setPostLoading(true);
    setPostError(null);
    setPostResult(null);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/payroll/post-month`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Post-month failed");
      setPostResult(body as PostMonthResult);
    } catch (e) {
      setPostError((e as Error).message);
    } finally {
      setPostLoading(false);
    }
  }

  async function payOut() {
    setPayLoading(true);
    setPayError(null);
    setPayResult(null);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/payroll/pay-month`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          year,
          bankAccountId: bankAccountId || undefined,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Pay-month failed");
      setPayResult(body as PayMonthResult);
    } catch (e) {
      setPayError((e as Error).message);
    } finally {
      setPayLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payroll Run</h1>
        <p className="text-muted-foreground">
          Step 1: Post salary expense to GL. Step 2: Pay net salary from a bank account.
          Both steps are gated on payslips already existing for the period (generate them
          first from the main Payroll page).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="month" className="text-xs">Month</Label>
              <select
                id="month"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {monthLabels.map((label, i) => (
                  <option key={i} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="year" className="text-xs">Year</Label>
              <input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Step 1: Post to GL */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" />
              Step 1 — Post to GL
            </CardTitle>
            <CardDescription>
              Books the salary JV: Dr Salaries & Wages / Cr Salaries Payable + statutory
              dues. All eligible payslips (DRAFT or APPROVED) move to PROCESSED.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={postToGl} disabled={postLoading} className="w-full">
              {postLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Posting…
                </>
              ) : (
                "Post to GL"
              )}
            </Button>
            {postError && <ErrorBanner message={postError} />}
            {postResult && <PostResultDisplay result={postResult} />}
          </CardContent>
        </Card>

        {/* Step 2: Pay out */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-4 w-4" />
              Step 2 — Pay net salary
            </CardTitle>
            <CardDescription>
              Books Dr Salaries Payable / Cr Bank for the total net salary; bank balance
              decrements; payslips move to PAID. Refuses partial-paid periods.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="bank" className="text-xs">Bank account</Label>
              <select
                id="bank"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">— Cash in Hand —</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.bankName ? ` (${b.bankName})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={payOut} disabled={payLoading} className="w-full">
              {payLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Paying…
                </>
              ) : (
                "Pay net salary"
              )}
            </Button>
            {payError && <ErrorBanner message={payError} />}
            {payResult && <PayResultDisplay result={payResult} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PostResultDisplay({ result }: { result: PostMonthResult }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-900/20">
      <div className="mb-2 flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4" />
        <span className="font-medium">
          Posted — voucher {result.voucherNumber}
        </span>
      </div>
      <div className="space-y-1 text-xs text-emerald-900 dark:text-emerald-200">
        <div>Payslips processed: {result.payslipCount}</div>
        <div>Gross: {fmtINR(result.totals.gross)}</div>
        <div>Net (→ Salaries Payable): {fmtINR(result.totals.netSalary)}</div>
        <div>PF (employee+employer): {fmtINR(Number(result.totals.pfEmployee) + Number(result.totals.pfEmployer))}</div>
        <div>ESI (employee+employer): {fmtINR(Number(result.totals.esiEmployee) + Number(result.totals.esiEmployer))}</div>
        <div>Professional tax: {fmtINR(result.totals.professionalTax)}</div>
        <div>TDS withheld: {fmtINR(result.totals.tds)}</div>
        {Number(result.totals.lop) > 0 && (
          <div>LOP (deducted from wage expense): {fmtINR(result.totals.lop)}</div>
        )}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-emerald-900 dark:text-emerald-200">
          JV lines ({result.lines.length})
        </summary>
        <ul className="mt-1 space-y-0.5 pl-4">
          {result.lines.map((l, i) => (
            <li key={i} className="font-mono">
              {l.ledger}: Dr {fmtINR(l.debit)} / Cr {fmtINR(l.credit)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function PayResultDisplay({ result }: { result: PayMonthResult }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-900/20">
      <div className="mb-2 flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4" />
        <span className="font-medium">
          Paid — voucher {result.voucherNumber}
        </span>
      </div>
      <div className="space-y-1 text-xs text-emerald-900 dark:text-emerald-200">
        <div>Payslips paid: {result.payslipCount}</div>
        <div>Total disbursed: {fmtINR(result.totalNetSalary)}</div>
        <div>From: {result.bankAccountId ? "bank account" : "cash in hand"}</div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  );
}

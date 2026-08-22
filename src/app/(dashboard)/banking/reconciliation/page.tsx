"use client";

import * as React from "react";
import { useState } from "react";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { downloadCsv } from "@/frontend/utils/export-csv";
import { toast } from "sonner";
import { cn } from "@/shared/utils/common.util";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
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
  DialogTrigger,
} from "@/frontend/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { Label } from "@/frontend/components/ui/label";
import { Badge } from "@/frontend/components/ui/badge";
import { Checkbox } from "@/frontend/components/ui/checkbox";
import { Progress } from "@/frontend/components/ui/progress";
import {
  Upload,
  Search,
  RefreshCcw,
  CheckCircle,
  AlertCircle,
  Link2,
  Unlink,
  Download,
  FileSpreadsheet,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";





/**
 * Bank reconciliation against the selected account.
 *
 * Both columns were hardcoded — invented statement lines (BT001
 * "NEFT-ABC TECH-PAYMENT") against invented book entries — with tiles
 * reading ₹12,50,000 and ₹12,48,500. Someone reconciling a real account
 * was matching one fiction against another.
 */
interface BankTxn {
  id: string;
  date: string;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number;
  matched: boolean;
  matchedWith?: string;
}

interface BookTxn {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  matched: boolean;
  voucherType: string;
}

interface BankAccountOption {
  id: string;
  name: string;
  currentBalance: number;
}

export default function ReconciliationPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [accounts, setAccounts] = React.useState<BankAccountOption[]>([]);
  const [accountId, setAccountId] = React.useState<string>("");
  const [bankTransactions, setBankTransactions] = React.useState<BankTxn[]>([]);
  const [bookTransactions, setBookTransactions] = React.useState<BookTxn[]>([]);
  const [bookBalance, setBookBalance] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!organizationId) return;
    (async () => {
      try {
        const r = await fetch(`/api/organizations/${organizationId}/bank-accounts`);
        if (!r.ok) throw new Error("Failed to load bank accounts");
        const rows = await r.json();
        const list = (Array.isArray(rows) ? rows : rows.data ?? []) as Array<Record<string, unknown>>;
        const opts = list.map((a) => ({
          id: String(a.id), name: String(a.name), currentBalance: Number(a.currentBalance ?? 0),
        }));
        setAccounts(opts);
        setAccountId((cur) => cur || opts[0]?.id || "");
        if (opts.length === 0) setLoading(false);
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
  }, [organizationId]);

  const loadReconciliation = React.useCallback(async (signal?: AbortSignal) => {
    if (!organizationId || !accountId) return;
    {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/organizations/${organizationId}/bank-reconciliation?bankAccountId=${accountId}&view=unreconciled`,
          { signal }
        );
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load reconciliation");
        const json = await r.json();
        type BT = { id: string; date: string; description: string | null; referenceNo: string | null; debitAmount: number; creditAmount: number; balance: number };
        type BE = { id: string; voucherNumber: string; date: string; narration?: string | null; debitAmount?: number; creditAmount?: number; voucherType?: string };
        setBankTransactions(((json.bankTransactions ?? []) as BT[]).map((t) => ({
          id: t.id, date: t.date, description: t.description, reference: t.referenceNo,
          debit: t.debitAmount, credit: t.creditAmount, balance: t.balance, matched: false,
        })));
        setBookTransactions(((json.bookEntries ?? []) as BE[]).map((b) => ({
          id: b.id, date: b.date, description: b.narration ?? b.voucherNumber,
          debit: Number(b.debitAmount ?? 0), credit: Number(b.creditAmount ?? 0),
          matched: false, voucherType: b.voucherType ?? "Voucher",
        })));
        setBookBalance(Number(json.bankAccount?.currentBalance ?? 0));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
  }, [organizationId, accountId]);

  React.useEffect(() => {
    if (!organizationId || !accountId) return;
    const controller = new AbortController();
    loadReconciliation(controller.signal);
    return () => controller.abort();
  }, [organizationId, accountId, loadReconciliation]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedBankTxns, setSelectedBankTxns] = useState<string[]>([]);
  const [selectedBookTxns, setSelectedBookTxns] = useState<string[]>([]);

  const monthStart = new Date();
  monthStart.setDate(1);
  const [fromDate, setFromDate] = useState(monthStart.toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [autoMatching, setAutoMatching] = useState(false);
  const [matching, setMatching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importBank, setImportBank] = useState("GENERIC");
  const [importAccountId, setImportAccountId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  /** Rows are filtered to the chosen window; the endpoint returns everything unreconciled. */
  const inRange = React.useCallback(
    (dateStr: string) => {
      const when = new Date(dateStr);
      if (fromDate && when < new Date(`${fromDate}T00:00:00`)) return false;
      if (toDate && when > new Date(`${toDate}T23:59:59`)) return false;
      return true;
    },
    [fromDate, toDate]
  );

  const visibleBankTxns = React.useMemo(
    () => bankTransactions.filter((t) => inRange(t.date)),
    [bankTransactions, inRange]
  );
  const visibleBookTxns = React.useMemo(
    () => bookTransactions.filter((t) => inRange(t.date)),
    [bookTransactions, inRange]
  );

  const handleAutoMatch = async () => {
    if (!organizationId || !accountId) {
      toast.error("Select a bank account first");
      return;
    }
    setAutoMatching(true);
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/banking/reconcile?bankAccountId=${accountId}&from=${fromDate}&to=${toDate}`,
        { method: "POST" }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Auto match failed");
      const matched = body.matched ?? body.result?.matched ?? 0;
      toast.success(
        matched > 0
          ? `Auto-matched ${matched} transaction(s)`
          : "No confident matches were found"
      );
      loadReconciliation();
    } catch (e) {
      toast.error((e as Error).message || "Auto match failed");
    } finally {
      setAutoMatching(false);
    }
  };

  const handleMatchSelected = async () => {
    if (!organizationId) return;
    if (selectedBankTxns.length !== 1 || selectedBookTxns.length !== 1) {
      toast.error("Select exactly one bank line and one book entry to match");
      return;
    }
    setMatching(true);
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/bank-reconciliation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "match",
            bankTransactionId: selectedBankTxns[0],
            voucherId: selectedBookTxns[0],
          }),
        }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to match");
      toast.success("Transaction matched");
      setSelectedBankTxns([]);
      setSelectedBookTxns([]);
      loadReconciliation();
    } catch (e) {
      toast.error((e as Error).message || "Failed to match");
    } finally {
      setMatching(false);
    }
  };

  const handleImportStatement = async () => {
    if (!organizationId) return;
    const targetAccount = importAccountId || accountId;
    if (!targetAccount) {
      toast.error("Select the bank account to import into");
      return;
    }
    if (!importFile) {
      toast.error("Choose a statement CSV to import");
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("bankAccountId", targetAccount);
      formData.append("bank", importBank);

      const r = await fetch(
        `/api/organizations/${organizationId}/banking/import-statement`,
        { method: "POST", body: formData }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Import failed");
      toast.success(
        `Imported ${body.imported ?? body.created ?? 0} transaction(s)` +
          (body.skipped ? `, ${body.skipped} already present` : "")
      );
      setIsDialogOpen(false);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = "";
      if (targetAccount === accountId) loadReconciliation();
      else setAccountId(targetAccount);
    } catch (e) {
      toast.error((e as Error).message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleExportBookEntries = () => {
    if (visibleBookTxns.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `book-entries-${new Date().toISOString().slice(0, 10)}`,
      visibleBookTxns.map((t) => ({
        Date: new Date(t.date).toLocaleDateString("en-IN"),
        Description: t.description,
        Type: t.voucherType,
        Debit: t.debit,
        Credit: t.credit,
      }))
    );
    toast.success(`Exported ${visibleBookTxns.length} book entries`);
  };

  const matchedCount = bankTransactions.filter((t) => t.matched).length;
  const totalCount = bankTransactions.length;
  // No statement lines left to match is a fully reconciled account, not 0%.
  const matchPercentage = totalCount === 0 ? 100 : (matchedCount / totalCount) * 100;
  const statementBalance = bankTransactions[0]?.balance ?? bookBalance;
  const difference = statementBalance - bookBalance;
  const inr = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">
          No bank accounts yet. Add one under Banking → Accounts to reconcile it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bank Reconciliation</h1>
          <p className="text-muted-foreground">
            Match bank statements with book entries
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Import Statement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Bank Statement</DialogTitle>
                <DialogDescription>
                  Upload a bank statement file to import transactions
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Bank Account *</Label>
                  <Select
                    value={importAccountId || accountId}
                    onValueChange={setImportAccountId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Statement Layout *</Label>
                  <Select value={importBank} onValueChange={setImportBank}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HDFC">HDFC CSV</SelectItem>
                      <SelectItem value="ICICI">ICICI CSV</SelectItem>
                      <SelectItem value="SBI">SBI CSV</SelectItem>
                      <SelectItem value="AXIS">Axis CSV</SelectItem>
                      <SelectItem value="GENERIC">Generic CSV</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    CSV only. Re-importing the same statement adds no duplicates.
                  </p>
                </div>
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {importFile ? importFile.name : "Choose your statement CSV"}
                  </p>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => importInputRef.current?.click()}
                  >
                    Choose File
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleImportStatement} disabled={importing}>
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Import
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={handleAutoMatch} disabled={autoMatching || !accountId}>
            {autoMatching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Auto Match
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bank Balance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inr(statementBalance)}</div>
            <p className="text-xs text-muted-foreground">Latest statement line</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Book Balance</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inr(bookBalance)}</div>
            <p className="text-xs text-muted-foreground">As per books</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Difference</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", difference !== 0 && "text-yellow-600")}>
              {inr(difference)}
            </div>
            <p className="text-xs text-muted-foreground">
              {bankTransactions.length} statement lines unreconciled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Match Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{matchPercentage.toFixed(0)}%</div>
            <Progress value={matchPercentage} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Bank Account Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reconciliation Period</CardTitle>
              <CardDescription>Select bank account and period to reconcile</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-sm text-muted-foreground">Bank Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      No bank accounts — add one in Banking → Accounts
                    </div>
                  ) : (
                    accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">From Date</Label>
              <Input
                type="date"
                className="w-[150px]"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">To Date</Label>
              <Input
                type="date"
                className="w-[150px]"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="pt-6">
              <Button
                variant="outline"
                disabled={loading || !accountId}
                onClick={() => loadReconciliation()}
              >
                <Search className="mr-2 h-4 w-4" />
                Load Transactions
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reconciliation Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Bank Statement */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Bank Statement</CardTitle>
                <CardDescription>Transactions from bank</CardDescription>
              </div>
              <Badge variant="outline">
                {matchedCount}/{totalCount} Matched
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBankTxns.map((txn) => (
                  <TableRow
                    key={txn.id}
                    className={txn.matched ? "bg-green-50" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedBankTxns.includes(txn.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedBankTxns([...selectedBankTxns, txn.id]);
                          } else {
                            setSelectedBankTxns(
                              selectedBankTxns.filter((id) => id !== txn.id)
                            );
                          }
                        }}
                        disabled={txn.matched}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(txn.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{txn.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {txn.reference}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {txn.debit > 0 ? `₹${txn.debit.toLocaleString()}` : ""}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {txn.credit > 0 ? `₹${txn.credit.toLocaleString()}` : ""}
                    </TableCell>
                    <TableCell>
                      {txn.matched ? (
                        <Link2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Unlink className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Book Entries */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Book Entries</CardTitle>
                <CardDescription>Transactions from accounting</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportBookEntries}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBookTxns.map((txn) => (
                  <TableRow
                    key={txn.id}
                    className={txn.matched ? "bg-green-50" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedBookTxns.includes(txn.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedBookTxns([...selectedBookTxns, txn.id]);
                          } else {
                            setSelectedBookTxns(
                              selectedBookTxns.filter((id) => id !== txn.id)
                            );
                          }
                        }}
                        disabled={txn.matched}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(txn.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{txn.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {txn.id} • {txn.voucherType}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {txn.debit > 0 ? `₹${txn.debit.toLocaleString()}` : ""}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {txn.credit > 0 ? `₹${txn.credit.toLocaleString()}` : ""}
                    </TableCell>
                    <TableCell>
                      {txn.matched ? (
                        <Link2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Unlink className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Action Bar */}
      {(selectedBankTxns.length > 0 || selectedBookTxns.length > 0) && (
        <Card className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-auto">
          <CardContent className="py-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                Selected: {selectedBankTxns.length} bank, {selectedBookTxns.length} book
              </span>
              <Button
                disabled={
                  matching ||
                  selectedBankTxns.length !== 1 ||
                  selectedBookTxns.length !== 1
                }
                onClick={handleMatchSelected}
              >
                {matching ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                )}
                Match Selected
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedBankTxns([]);
                  setSelectedBookTxns([]);
                }}
              >
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

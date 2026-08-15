"use client";

import * as React from "react";
import { useState } from "react";
import { useOrganization } from "@/frontend/hooks/use-organization";
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

  React.useEffect(() => {
    if (!organizationId || !accountId) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/organizations/${organizationId}/bank-reconciliation?bankAccountId=${accountId}&view=unreconciled`,
          { signal: controller.signal }
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
    })();
    return () => controller.abort();
  }, [organizationId, accountId]);

  const [selectedBank, setSelectedBank] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedBankTxns, setSelectedBankTxns] = useState<string[]>([]);
  const [selectedBookTxns, setSelectedBookTxns] = useState<string[]>([]);

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
                  <Label>Bank Account</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hdfc">HDFC Bank - Current (****5678)</SelectItem>
                      <SelectItem value="icici">ICICI Bank - Savings (****9012)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Statement Format</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                      <SelectItem value="ofx">OFX/QFX</SelectItem>
                      <SelectItem value="pdf">PDF (Auto-extract)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Drag and drop your statement file here, or click to browse
                  </p>
                  <Button variant="outline" className="mt-4">
                    Choose File
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>Import</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button>
            <RefreshCcw className="mr-2 h-4 w-4" />
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
              <Select value={selectedBank} onValueChange={setSelectedBank}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hdfc">HDFC Bank - Current Account (****5678)</SelectItem>
                  <SelectItem value="icici">ICICI Bank - Savings Account (****9012)</SelectItem>
                  <SelectItem value="sbi">SBI - Current Account (****3456)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">From Date</Label>
              <Input type="date" defaultValue="2024-03-01" className="w-[150px]" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">To Date</Label>
              <Input type="date" defaultValue="2024-03-15" className="w-[150px]" />
            </div>
            <div className="pt-6">
              <Button variant="outline">
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
                {bankTransactions.map((txn) => (
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
              <Button variant="outline" size="sm">
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
                {bookTransactions.map((txn) => (
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
                disabled={selectedBankTxns.length === 0 || selectedBookTxns.length === 0}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
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

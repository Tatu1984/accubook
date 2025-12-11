"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
} from "lucide-react";

const bankTransactions = [
  {
    id: "BT001",
    date: "2024-03-15",
    description: "NEFT-ABC TECH-PAYMENT",
    reference: "NEFT123456",
    debit: 0,
    credit: 125000,
    balance: 1250000,
    matched: true,
    matchedWith: "REC-2024-045",
  },
  {
    id: "BT002",
    date: "2024-03-14",
    description: "IMPS-VENDOR PAYMENT",
    reference: "IMPS789012",
    debit: 85000,
    credit: 0,
    balance: 1125000,
    matched: true,
    matchedWith: "PAY-2024-032",
  },
  {
    id: "BT003",
    date: "2024-03-14",
    description: "NEFT-CUSTOMER CREDIT",
    reference: "NEFT345678",
    debit: 0,
    credit: 250000,
    balance: 1210000,
    matched: false,
    matchedWith: null,
  },
  {
    id: "BT004",
    date: "2024-03-13",
    description: "CHQ DEP-456789",
    reference: "CHQ456789",
    debit: 0,
    credit: 75000,
    balance: 960000,
    matched: false,
    matchedWith: null,
  },
  {
    id: "BT005",
    date: "2024-03-13",
    description: "SALARY-MARCH 2024",
    reference: "SAL032024",
    debit: 285000,
    credit: 0,
    balance: 885000,
    matched: true,
    matchedWith: "PAY-2024-031",
  },
  {
    id: "BT006",
    date: "2024-03-12",
    description: "BANK CHARGES",
    reference: "CHRG001",
    debit: 1500,
    credit: 0,
    balance: 1170000,
    matched: false,
    matchedWith: null,
  },
];

const bookTransactions = [
  {
    id: "REC-2024-045",
    date: "2024-03-15",
    description: "Receipt from ABC Technologies",
    debit: 0,
    credit: 125000,
    matched: true,
    voucherType: "Receipt",
  },
  {
    id: "PAY-2024-032",
    date: "2024-03-14",
    description: "Payment to Steel Suppliers",
    debit: 85000,
    credit: 0,
    matched: true,
    voucherType: "Payment",
  },
  {
    id: "REC-2024-046",
    date: "2024-03-14",
    description: "Receipt from Global Traders",
    debit: 0,
    credit: 250000,
    matched: false,
    voucherType: "Receipt",
  },
  {
    id: "PAY-2024-031",
    date: "2024-03-13",
    description: "March Salary Payment",
    debit: 285000,
    credit: 0,
    matched: true,
    voucherType: "Payment",
  },
  {
    id: "REC-2024-044",
    date: "2024-03-12",
    description: "Receipt from XYZ Industries",
    debit: 0,
    credit: 75000,
    matched: false,
    voucherType: "Receipt",
  },
];

export default function ReconciliationPage() {
  const [selectedBank, setSelectedBank] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedBankTxns, setSelectedBankTxns] = useState<string[]>([]);
  const [selectedBookTxns, setSelectedBookTxns] = useState<string[]>([]);

  const matchedCount = bankTransactions.filter((t) => t.matched).length;
  const totalCount = bankTransactions.length;
  const matchPercentage = (matchedCount / totalCount) * 100;

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
            <div className="text-2xl font-bold">₹12,50,000</div>
            <p className="text-xs text-muted-foreground">As per bank statement</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Book Balance</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹12,48,500</div>
            <p className="text-xs text-muted-foreground">As per books</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Difference</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">₹1,500</div>
            <p className="text-xs text-muted-foreground">Unreconciled amount</p>
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

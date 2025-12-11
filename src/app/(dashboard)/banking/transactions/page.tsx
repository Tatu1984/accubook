"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  CreditCard,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { useOrganization } from "@/hooks/use-organization";
import { toast } from "sonner";

interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  currentBalance: number;
}

interface TransactionData {
  id: string;
  type: "RECEIPT" | "PAYMENT";
  date: string;
  amount: number;
  partyName: string;
  reference: string;
  paymentMode: string;
  status: string;
  bankAccountId?: string;
  bankAccount?: {
    name: string;
    bankName: string;
  };
}

export default function BankTransactionsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [transactions, setTransactions] = React.useState<TransactionData[]>([]);
  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedAccount, setSelectedAccount] = React.useState<string>("all");
  const [transactionType, setTransactionType] = React.useState<string>("all");

  const fetchBankAccounts = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/bank-accounts`
      );
      if (!response.ok) throw new Error("Failed to fetch bank accounts");
      const data = await response.json();
      setBankAccounts(data);
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
    }
  }, [organizationId]);

  const fetchTransactions = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      // Fetch both receipts and payments
      const [receiptsRes, paymentsRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/receipts`),
        fetch(`/api/organizations/${organizationId}/payments`),
      ]);

      const receiptsData = receiptsRes.ok ? await receiptsRes.json() : [];
      const paymentsData = paymentsRes.ok ? await paymentsRes.json() : [];

      // Transform and combine
      const receiptTransactions = (receiptsData.data || receiptsData || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        type: "RECEIPT" as const,
        date: r.date,
        amount: r.amount,
        partyName: (r.party as Record<string, unknown>)?.name || "Unknown",
        reference: r.receiptNumber || r.transactionRef || "",
        paymentMode: r.paymentMode,
        status: r.status,
        bankAccount: r.bankAccount,
        bankAccountId: r.bankAccountId,
      }));

      const paymentTransactions = (paymentsData.data || paymentsData || []).map((p: Record<string, unknown>) => ({
        id: p.id,
        type: "PAYMENT" as const,
        date: p.date,
        amount: p.amount,
        partyName: (p.party as Record<string, unknown>)?.name || "Unknown",
        reference: p.paymentNumber || p.transactionRef || "",
        paymentMode: p.paymentMode,
        status: p.status,
        bankAccount: p.bankAccount,
        bankAccountId: p.bankAccountId,
      }));

      const allTransactions = [...receiptTransactions, ...paymentTransactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(allTransactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to fetch transactions");
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      Promise.all([fetchBankAccounts(), fetchTransactions()]).finally(() =>
        setIsLoading(false)
      );
    }
  }, [organizationId, fetchBankAccounts, fetchTransactions]);

  const filteredTransactions = React.useMemo(() => {
    let filtered = transactions;

    if (selectedAccount !== "all") {
      filtered = filtered.filter((t) => t.bankAccountId === selectedAccount);
    }

    if (transactionType !== "all") {
      filtered = filtered.filter((t) => t.type === transactionType);
    }

    return filtered;
  }, [transactions, selectedAccount, transactionType]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const columns: ColumnDef<TransactionData>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => formatDate(row.getValue("date")),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <Badge
            variant={type === "RECEIPT" ? "default" : "secondary"}
            className="flex items-center gap-1 w-fit"
          >
            {type === "RECEIPT" ? (
              <ArrowDownLeft className="h-3 w-3" />
            ) : (
              <ArrowUpRight className="h-3 w-3" />
            )}
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: "partyName",
      header: "Party",
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.getValue("reference") || "-"}</span>
      ),
    },
    {
      accessorKey: "paymentMode",
      header: "Mode",
      cell: ({ row }) => {
        const mode = row.getValue("paymentMode") as string;
        return <Badge variant="outline">{mode?.replace("_", " ") || "-"}</Badge>;
      },
    },
    {
      accessorKey: "bankAccount",
      header: "Bank Account",
      cell: ({ row }) => {
        const account = row.original.bankAccount;
        return account ? `${account.name} (${account.bankName})` : "-";
      },
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="w-full justify-end"
        >
          Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const amount = row.getValue("amount") as number;
        const type = row.original.type;
        return (
          <div
            className={`text-right font-medium ${
              type === "RECEIPT" ? "text-green-600" : "text-red-600"
            }`}
          >
            {type === "RECEIPT" ? "+" : "-"}{formatCurrency(amount)}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        const variant =
          status === "COMPLETED"
            ? "default"
            : status === "PENDING"
            ? "secondary"
            : "destructive";
        return <Badge variant={variant}>{status}</Badge>;
      },
    },
  ];

  const stats = React.useMemo(() => {
    const receipts = filteredTransactions.filter((t) => t.type === "RECEIPT");
    const payments = filteredTransactions.filter((t) => t.type === "PAYMENT");
    const totalReceipts = receipts.reduce((sum, t) => sum + t.amount, 0);
    const totalPayments = payments.reduce((sum, t) => sum + t.amount, 0);
    return {
      totalTransactions: filteredTransactions.length,
      totalReceipts,
      totalPayments,
      netFlow: totalReceipts - totalPayments,
    };
  }, [filteredTransactions]);

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bank Transactions</h1>
          <p className="text-muted-foreground">
            View all receipts and payments across bank accounts
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedAccount}
              onValueChange={setSelectedAccount}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={transactionType}
              onValueChange={setTransactionType}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="RECEIPT">Receipts</SelectItem>
                <SelectItem value="PAYMENT">Payments</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTransactions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.totalReceipts)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.totalPayments)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Cash Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                stats.netFlow >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(stats.netFlow)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No transactions found</h3>
              <p className="text-muted-foreground">
                Transactions will appear here when you create receipts or payments
              </p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredTransactions}
              searchKey="partyName"
              searchPlaceholder="Search by party name..."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

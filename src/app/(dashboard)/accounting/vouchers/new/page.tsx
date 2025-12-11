"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";

interface VoucherType {
  id: string;
  name: string;
  code: string;
  nature: string;
}

interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
}

interface Ledger {
  id: string;
  name: string;
  code?: string;
  group?: {
    name: string;
    nature: string;
  };
}

interface VoucherEntry {
  id: string;
  ledgerId: string;
  ledgerName: string;
  debitAmount: number;
  creditAmount: number;
  narration: string;
}

function NewVoucherPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeCode = searchParams.get("type") || "JOURNAL";

  const { organizationId, isLoading: authLoading } = useOrganization();

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [voucherTypes, setVoucherTypes] = React.useState<VoucherType[]>([]);
  const [fiscalYears, setFiscalYears] = React.useState<FiscalYear[]>([]);
  const [ledgers, setLedgers] = React.useState<Ledger[]>([]);

  const [selectedVoucherTypeId, setSelectedVoucherTypeId] = React.useState("");
  const [selectedFiscalYearId, setSelectedFiscalYearId] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [referenceNo, setReferenceNo] = React.useState("");
  const [narration, setNarration] = React.useState("");

  const [entries, setEntries] = React.useState<VoucherEntry[]>([
    { id: "1", ledgerId: "", ledgerName: "", debitAmount: 0, creditAmount: 0, narration: "" },
    { id: "2", ledgerId: "", ledgerName: "", debitAmount: 0, creditAmount: 0, narration: "" },
  ]);

  // Fetch initial data
  React.useEffect(() => {
    if (!organizationId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [typesRes, yearsRes, ledgersRes] = await Promise.all([
          fetch(`/api/organizations/${organizationId}/voucher-types`),
          fetch(`/api/organizations/${organizationId}/fiscal-years`),
          fetch(`/api/organizations/${organizationId}/ledgers`),
        ]);

        if (typesRes.ok) {
          const types = await typesRes.json();
          setVoucherTypes(types);
          // Set default voucher type based on URL param
          const defaultType = types.find((t: VoucherType) => t.code === typeCode);
          if (defaultType) {
            setSelectedVoucherTypeId(defaultType.id);
          } else if (types.length > 0) {
            setSelectedVoucherTypeId(types[0].id);
          }
        }

        if (yearsRes.ok) {
          const years = await yearsRes.json();
          setFiscalYears(years);
          // Set current fiscal year (first non-closed one)
          const currentYear = years.find((y: FiscalYear) => !y.isClosed);
          if (currentYear) {
            setSelectedFiscalYearId(currentYear.id);
          } else if (years.length > 0) {
            setSelectedFiscalYearId(years[0].id);
          }
        }

        if (ledgersRes.ok) {
          const ledgersData = await ledgersRes.json();
          setLedgers(ledgersData.data || ledgersData);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load form data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [organizationId, typeCode]);

  // Calculate totals
  const totalDebit = entries.reduce((sum, e) => sum + (e.debitAmount || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (e.creditAmount || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  // Add entry row
  const addEntry = () => {
    setEntries([
      ...entries,
      {
        id: Date.now().toString(),
        ledgerId: "",
        ledgerName: "",
        debitAmount: 0,
        creditAmount: 0,
        narration: "",
      },
    ]);
  };

  // Remove entry row
  const removeEntry = (id: string) => {
    if (entries.length <= 2) {
      toast.error("Minimum 2 entries required");
      return;
    }
    setEntries(entries.filter((e) => e.id !== id));
  };

  // Update entry
  const updateEntry = (id: string, field: keyof VoucherEntry, value: string | number) => {
    setEntries(
      entries.map((e) => {
        if (e.id !== id) return e;

        if (field === "ledgerId") {
          const ledger = ledgers.find((l) => l.id === value);
          return {
            ...e,
            ledgerId: value as string,
            ledgerName: ledger?.name || "",
          };
        }

        // If entering debit, clear credit and vice versa
        if (field === "debitAmount" && (value as number) > 0) {
          return { ...e, debitAmount: value as number, creditAmount: 0 };
        }
        if (field === "creditAmount" && (value as number) > 0) {
          return { ...e, creditAmount: value as number, debitAmount: 0 };
        }

        return { ...e, [field]: value };
      })
    );
  };

  // Submit voucher
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedVoucherTypeId) {
      toast.error("Please select a voucher type");
      return;
    }

    if (!selectedFiscalYearId) {
      toast.error("Please select a fiscal year");
      return;
    }

    const validEntries = entries.filter(
      (e) => e.ledgerId && (e.debitAmount > 0 || e.creditAmount > 0)
    );

    if (validEntries.length < 2) {
      toast.error("At least 2 valid entries are required");
      return;
    }

    if (!isBalanced) {
      toast.error("Total debit must equal total credit");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/vouchers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voucherTypeId: selectedVoucherTypeId,
            fiscalYearId: selectedFiscalYearId,
            date,
            referenceNo: referenceNo || undefined,
            narration: narration || undefined,
            entries: validEntries.map((e) => ({
              ledgerId: e.ledgerId,
              debitAmount: e.debitAmount,
              creditAmount: e.creditAmount,
              narration: e.narration || undefined,
            })),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create voucher");
      }

      toast.success("Voucher created successfully");
      router.push("/accounting/vouchers");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create voucher");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No organization selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/accounting/vouchers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Voucher</h1>
          <p className="text-muted-foreground">
            Create a new accounting voucher entry
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6">
          {/* Header Section */}
          <Card>
            <CardHeader>
              <CardTitle>Voucher Details</CardTitle>
              <CardDescription>Basic information about the voucher</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="voucherType">Voucher Type *</Label>
                  <Select
                    value={selectedVoucherTypeId}
                    onValueChange={setSelectedVoucherTypeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {voucherTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fiscalYear">Fiscal Year *</Label>
                  <Select
                    value={selectedFiscalYearId}
                    onValueChange={setSelectedFiscalYearId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {fiscalYears.map((year) => (
                        <SelectItem
                          key={year.id}
                          value={year.id}
                          disabled={year.isClosed}
                        >
                          {year.name} {year.isClosed ? "(Closed)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referenceNo">Reference No.</Label>
                  <Input
                    id="referenceNo"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="Optional reference"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label htmlFor="narration">Narration</Label>
                <Textarea
                  id="narration"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="Enter description or notes for this voucher"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Entries Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Voucher Entries</CardTitle>
                  <CardDescription>
                    Add debit and credit entries (must balance)
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" onClick={addEntry}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Row
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Ledger Account *</TableHead>
                      <TableHead className="w-[150px] text-right">Debit</TableHead>
                      <TableHead className="w-[150px] text-right">Credit</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Select
                            value={entry.ledgerId}
                            onValueChange={(value) =>
                              updateEntry(entry.id, "ledgerId", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select ledger" />
                            </SelectTrigger>
                            <SelectContent>
                              {ledgers.map((ledger) => (
                                <SelectItem key={ledger.id} value={ledger.id}>
                                  {ledger.name}
                                  {ledger.code && ` (${ledger.code})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={entry.debitAmount || ""}
                            onChange={(e) =>
                              updateEntry(
                                entry.id,
                                "debitAmount",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="text-right"
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={entry.creditAmount || ""}
                            onChange={(e) =>
                              updateEntry(
                                entry.id,
                                "creditAmount",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="text-right"
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={entry.narration}
                            onChange={(e) =>
                              updateEntry(entry.id, "narration", e.target.value)
                            }
                            placeholder="Line item description"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeEntry(entry.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {totalDebit.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {totalCredit.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell colSpan={2}>
                        {!isBalanced && totalDebit > 0 && totalCredit > 0 && (
                          <span className="text-red-600 text-sm">
                            Difference:{" "}
                            {Math.abs(totalDebit - totalCredit).toLocaleString(
                              "en-IN",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}
                          </span>
                        )}
                        {isBalanced && totalDebit > 0 && (
                          <span className="text-green-600 text-sm">Balanced</span>
                        )}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/accounting/vouchers">Cancel</Link>
            </Button>
            <Button type="submit" disabled={saving || !isBalanced}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Create Voucher"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function NewVoucherPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[200px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <NewVoucherPageContent />
    </Suspense>
  );
}

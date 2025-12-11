"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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

interface Party {
  id: string;
  name: string;
  gstNo?: string;
  billingAddress?: string;
  shippingAddress?: string;
}

interface Item {
  id: string;
  name: string;
  code?: string;
  sellingPrice?: string;
  unit?: string;
  taxConfigId?: string;
}

interface TaxConfig {
  id: string;
  name: string;
  rate: string;
}

interface InvoiceItem {
  id: string;
  itemId: string;
  itemName: string;
  description: string;
  quantity: number;
  rate: number;
  taxId: string;
  taxRate: number;
  amount: number;
  taxAmount: number;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const { organizationId, isLoading: authLoading } = useOrganization();

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [parties, setParties] = React.useState<Party[]>([]);
  const [items, setItems] = React.useState<Item[]>([]);
  const [taxes, setTaxes] = React.useState<TaxConfig[]>([]);

  const [selectedPartyId, setSelectedPartyId] = React.useState("");
  const [selectedParty, setSelectedParty] = React.useState<Party | null>(null);
  const [date, setDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = React.useState(
    new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [referenceNo, setReferenceNo] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [terms, setTerms] = React.useState("");

  const [invoiceItems, setInvoiceItems] = React.useState<InvoiceItem[]>([
    {
      id: "1",
      itemId: "",
      itemName: "",
      description: "",
      quantity: 1,
      rate: 0,
      taxId: "",
      taxRate: 0,
      amount: 0,
      taxAmount: 0,
    },
  ]);

  // Fetch initial data
  React.useEffect(() => {
    if (!organizationId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [partiesRes, itemsRes, taxesRes] = await Promise.all([
          fetch(`/api/organizations/${organizationId}/parties?type=customer&limit=500`),
          fetch(`/api/organizations/${organizationId}/items?limit=500`),
          fetch(`/api/organizations/${organizationId}/tax-config`),
        ]);

        if (partiesRes.ok) {
          const data = await partiesRes.json();
          setParties(data.data || data);
        }

        if (itemsRes.ok) {
          const data = await itemsRes.json();
          setItems(data.data || data);
        }

        if (taxesRes.ok) {
          const data = await taxesRes.json();
          setTaxes(data.data || data);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load form data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [organizationId]);

  // Update selected party details
  React.useEffect(() => {
    if (selectedPartyId) {
      const party = parties.find((p) => p.id === selectedPartyId);
      setSelectedParty(party || null);
    } else {
      setSelectedParty(null);
    }
  }, [selectedPartyId, parties]);

  // Calculate totals
  const subtotal = invoiceItems.reduce((sum, item) => sum + item.amount, 0);
  const totalTax = invoiceItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const totalAmount = subtotal + totalTax;

  // Add item row
  const addItem = () => {
    setInvoiceItems([
      ...invoiceItems,
      {
        id: Date.now().toString(),
        itemId: "",
        itemName: "",
        description: "",
        quantity: 1,
        rate: 0,
        taxId: "",
        taxRate: 0,
        amount: 0,
        taxAmount: 0,
      },
    ]);
  };

  // Remove item row
  const removeItem = (id: string) => {
    if (invoiceItems.length <= 1) {
      toast.error("At least one item is required");
      return;
    }
    setInvoiceItems(invoiceItems.filter((item) => item.id !== id));
  };

  // Update item
  const updateItem = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setInvoiceItems(
      invoiceItems.map((item) => {
        if (item.id !== id) return item;

        const updatedItem = { ...item, [field]: value };

        // If item is selected, populate details
        if (field === "itemId" && value) {
          const selectedItem = items.find((i) => i.id === value);
          if (selectedItem) {
            updatedItem.itemName = selectedItem.name;
            updatedItem.rate = parseFloat(selectedItem.sellingPrice || "0");
            if (selectedItem.taxConfigId) {
              const tax = taxes.find((t) => t.id === selectedItem.taxConfigId);
              if (tax) {
                updatedItem.taxId = tax.id;
                updatedItem.taxRate = parseFloat(tax.rate);
              }
            }
          }
        }

        // If tax is selected, update tax rate
        if (field === "taxId" && value) {
          const tax = taxes.find((t) => t.id === value);
          if (tax) {
            updatedItem.taxRate = parseFloat(tax.rate);
          }
        }

        // Recalculate amounts
        const quantity = field === "quantity" ? (value as number) : updatedItem.quantity;
        const rate = field === "rate" ? (value as number) : updatedItem.rate;
        const taxRate = updatedItem.taxRate;

        updatedItem.amount = quantity * rate;
        updatedItem.taxAmount = (updatedItem.amount * taxRate) / 100;

        return updatedItem;
      })
    );
  };

  // Submit invoice
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPartyId) {
      toast.error("Please select a customer");
      return;
    }

    const validItems = invoiceItems.filter((item) => item.itemId && item.quantity > 0);

    if (validItems.length === 0) {
      toast.error("At least one item is required");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/invoices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partyId: selectedPartyId,
            date,
            dueDate,
            referenceNo: referenceNo || undefined,
            billingAddress: selectedParty?.billingAddress,
            shippingAddress: selectedParty?.shippingAddress,
            notes: notes || undefined,
            terms: terms || undefined,
            items: validItems.map((item) => ({
              itemId: item.itemId,
              description: item.description || item.itemName,
              quantity: item.quantity,
              unitPrice: item.rate,
              taxId: item.taxId || undefined,
              taxAmount: item.taxAmount,
            })),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create invoice");
      }

      toast.success("Invoice created successfully");
      router.push("/sales/invoices");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create invoice");
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
          <Link href="/sales/invoices">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Invoice</h1>
          <p className="text-muted-foreground">Create a new sales invoice</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6">
          {/* Customer & Details Section */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
              <CardDescription>Customer and invoice information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="party">Customer *</Label>
                  <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((party) => (
                        <SelectItem key={party.id} value={party.id}>
                          {party.name}
                          {party.gstNo && ` (${party.gstNo})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Invoice Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date *</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referenceNo">Reference No.</Label>
                  <Input
                    id="referenceNo"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="PO number, etc."
                  />
                </div>
              </div>

              {selectedParty && (
                <div className="grid gap-4 md:grid-cols-2 mt-4 pt-4 border-t">
                  <div>
                    <Label className="text-muted-foreground text-xs">Billing Address</Label>
                    <p className="text-sm mt-1">{selectedParty.billingAddress || "Not provided"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">GSTIN</Label>
                    <p className="text-sm mt-1">{selectedParty.gstNo || "Not provided"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invoice Items</CardTitle>
                  <CardDescription>Add products or services to the invoice</CardDescription>
                </div>
                <Button type="button" variant="outline" onClick={addItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Item *</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[80px] text-right">Qty</TableHead>
                      <TableHead className="w-[100px] text-right">Rate</TableHead>
                      <TableHead className="w-[120px]">Tax</TableHead>
                      <TableHead className="w-[100px] text-right">Amount</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Select
                            value={item.itemId}
                            onValueChange={(value) => updateItem(item.id, "itemId", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              {items.map((i) => (
                                <SelectItem key={i.id} value={i.id}>
                                  {i.name}
                                  {i.code && ` (${i.code})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.description}
                            onChange={(e) => updateItem(item.id, "description", e.target.value)}
                            placeholder="Description"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(item.id, "quantity", parseInt(e.target.value) || 1)
                            }
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.rate || ""}
                            onChange={(e) =>
                              updateItem(item.id, "rate", parseFloat(e.target.value) || 0)
                            }
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.taxId || "none"}
                            onValueChange={(value) => updateItem(item.id, "taxId", value === "none" ? "" : value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Tax" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Tax</SelectItem>
                              {taxes.map((tax) => (
                                <SelectItem key={tax.id} value={tax.id}>
                                  {tax.name} ({tax.rate}%)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {item.amount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(item.id)}
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
                      <TableCell colSpan={5} className="text-right font-medium">
                        Subtotal
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {subtotal.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-medium">
                        Tax
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {totalTax.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-semibold text-lg">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-semibold text-lg tabular-nums">
                        {totalAmount.toLocaleString("en-IN", {
                          style: "currency",
                          currency: "INR",
                        })}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Notes Section */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes to customer (will appear on invoice)"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="terms">Terms & Conditions</Label>
                  <Textarea
                    id="terms"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Payment terms, warranties, etc."
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/sales/invoices">Cancel</Link>
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Create Invoice"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

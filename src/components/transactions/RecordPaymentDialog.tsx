"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { toast } from "sonner";

interface Party {
  id: string;
  name: string;
  email: string | null;
}

interface BankAccount {
  id: string;
  name: string;
  bankName: string;
}

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
}: RecordPaymentDialogProps) {
  const { organizationId } = useOrganization();
  const [parties, setParties] = React.useState<Party[]>([]);
  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const [formData, setFormData] = React.useState({
    partyId: "",
    date: new Date().toISOString().split("T")[0],
    amount: 0,
    paymentMode: "CASH" as "CASH" | "BANK_TRANSFER" | "CHEQUE" | "NEFT" | "RTGS" | "UPI",
    bankAccountId: "",
    transactionRef: "",
    notes: "",
  });

  const fetchData = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [partiesRes, bankRes] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/parties?type=VENDOR`),
        fetch(`/api/organizations/${organizationId}/bank-accounts`),
      ]);
      if (partiesRes.ok) {
        const data = await partiesRes.json();
        setParties(data.data || []);
      }
      if (bankRes.ok) {
        const data = await bankRes.json();
        setBankAccounts(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create payment");
      }

      toast.success("Payment created successfully");
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    } catch (error) {
      console.error("Error creating payment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create payment");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      partyId: "",
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      paymentMode: "CASH",
      bankAccountId: "",
      transactionRef: "",
      notes: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment made to a vendor
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Vendor *</Label>
              <Select
                value={formData.partyId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, partyId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((party) => (
                    <SelectItem key={party.id} value={party.id}>
                      {party.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input
                  type="number"
                  value={formData.amount || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  min={0.01}
                  step={0.01}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payment Mode *</Label>
              <Select
                value={formData.paymentMode}
                onValueChange={(value) => setFormData(prev => ({ ...prev, paymentMode: value as typeof formData.paymentMode }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="NEFT">NEFT</SelectItem>
                  <SelectItem value="RTGS">RTGS</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.paymentMode !== "CASH" && (
              <>
                <div className="space-y-2">
                  <Label>Bank Account</Label>
                  <Select
                    value={formData.bankAccountId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, bankAccountId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} - {account.bankName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Transaction Reference</Label>
                  <Input
                    value={formData.transactionRef}
                    onChange={(e) => setFormData(prev => ({ ...prev, transactionRef: e.target.value }))}
                    placeholder="Transaction ID / Cheque No."
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !formData.partyId || !formData.amount}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

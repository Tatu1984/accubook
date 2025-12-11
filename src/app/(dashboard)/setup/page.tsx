"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Loader2, ArrowRight } from "lucide-react";

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
}

export default function SetupPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [currencies, setCurrencies] = React.useState<Currency[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [step, setStep] = React.useState(1);

  const [formData, setFormData] = React.useState({
    name: "",
    legalName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "IN",
    postalCode: "",
    gstNo: "",
    panNo: "",
    baseCurrencyId: "",
    fiscalYearStart: 4,
    // Branch info
    branchName: "Head Office",
    branchCode: "HO",
  });

  React.useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const response = await fetch("/api/currencies");
        if (response.ok) {
          const data = await response.json();
          setCurrencies(data);
          // Set default currency to INR if available
          const inr = data.find((c: Currency) => c.code === "INR");
          if (inr) {
            setFormData((prev) => ({ ...prev, baseCurrencyId: inr.id }));
          }
        }
      } catch (error) {
        console.error("Error fetching currencies:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrencies();
  }, []);

  // Note: We allow users with existing organizations to create new ones
  // So we don't redirect if they already have an organization

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.baseCurrencyId) {
      toast.error("Organization name and currency are required");
      return;
    }

    setSaving(true);

    try {
      // Create organization
      const orgResponse = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          legalName: formData.legalName || formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          country: formData.country,
          postalCode: formData.postalCode || undefined,
          gstNo: formData.gstNo || undefined,
          panNo: formData.panNo || undefined,
          baseCurrencyId: formData.baseCurrencyId,
          fiscalYearStart: formData.fiscalYearStart,
        }),
      });

      if (!orgResponse.ok) {
        const error = await orgResponse.json();
        throw new Error(error.error || "Failed to create organization");
      }

      const organization = await orgResponse.json();

      // Create head office branch
      const branchResponse = await fetch(
        `/api/organizations/${organization.id}/branches`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.branchName,
            code: formData.branchCode,
            address: formData.address || undefined,
            city: formData.city || undefined,
            state: formData.state || undefined,
            country: formData.country,
            postalCode: formData.postalCode || undefined,
            isHeadOffice: true,
          }),
        }
      );

      if (!branchResponse.ok) {
        console.error("Failed to create branch");
      }

      const branch = branchResponse.ok ? await branchResponse.json() : null;

      // Update session with new organization
      await update({
        organizationId: organization.id,
        organizationName: organization.name,
        branchId: branch?.id || null,
        branchName: branch?.name || null,
      });

      toast.success("Organization created successfully!");
      router.push("/dashboard");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create organization"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-4">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Set Up Your Organization</CardTitle>
          <CardDescription>
            Create your organization to start using AccuBooks
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {step === 1 && (
              <>
                <div className="space-y-4">
                  <h3 className="font-medium">Basic Information</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Organization Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="Acme Corporation"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="legalName">Legal Name</Label>
                      <Input
                        id="legalName"
                        value={formData.legalName}
                        onChange={(e) =>
                          setFormData({ ...formData, legalName: e.target.value })
                        }
                        placeholder="Acme Corporation Pvt Ltd"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="contact@acme.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        placeholder="+91 22 1234 5678"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="currency">Base Currency *</Label>
                      <Select
                        value={formData.baseCurrencyId}
                        onValueChange={(value) =>
                          setFormData({ ...formData, baseCurrencyId: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {currencies.map((currency) => (
                            <SelectItem key={currency.id} value={currency.id}>
                              {currency.symbol} {currency.name} ({currency.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fiscalYear">Fiscal Year Starts</Label>
                      <Select
                        value={formData.fiscalYearStart.toString()}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            fiscalYearStart: parseInt(value),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">January</SelectItem>
                          <SelectItem value="4">April</SelectItem>
                          <SelectItem value="7">July</SelectItem>
                          <SelectItem value="10">October</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={() => setStep(2)}>
                    Next
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-4">
                  <h3 className="font-medium">Address & Tax Details</h3>

                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                      placeholder="123, Business Park"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) =>
                          setFormData({ ...formData, city: e.target.value })
                        }
                        placeholder="Mumbai"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) =>
                          setFormData({ ...formData, state: e.target.value })
                        }
                        placeholder="Maharashtra"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">Postal Code</Label>
                      <Input
                        id="postalCode"
                        value={formData.postalCode}
                        onChange={(e) =>
                          setFormData({ ...formData, postalCode: e.target.value })
                        }
                        placeholder="400001"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="gstNo">GST Number</Label>
                      <Input
                        id="gstNo"
                        value={formData.gstNo}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            gstNo: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="27AADCA1234A1ZA"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="panNo">PAN Number</Label>
                      <Input
                        id="panNo"
                        value={formData.panNo}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            panNo: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="AADCA1234A"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                  <Button type="button" onClick={() => setStep(3)}>
                    Next
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-4">
                  <h3 className="font-medium">Head Office Branch</h3>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ll create your first branch (Head Office) automatically.
                    You can add more branches later.
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="branchName">Branch Name</Label>
                      <Input
                        id="branchName"
                        value={formData.branchName}
                        onChange={(e) =>
                          setFormData({ ...formData, branchName: e.target.value })
                        }
                        placeholder="Head Office"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="branchCode">Branch Code</Label>
                      <Input
                        id="branchCode"
                        value={formData.branchCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            branchCode: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="HO"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(2)}
                  >
                    Back
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? "Creating..." : "Create Organization"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </form>

        <CardFooter className="justify-center border-t pt-6">
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 w-8 rounded-full ${
                  s === step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

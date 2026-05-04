"use client";

import * as React from "react";
import Link from "next/link";
import {
  Loader2,
  Save,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { useOrganization } from "@/frontend/hooks/use-organization";

type Org = {
  id: string;
  name: string;
  legalName: string | null;
  registrationNo: string | null;
  taxId: string | null;
  gstNo: string | null;
  panNo: string | null;
  tanNo: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postalCode: string | null;
};

/**
 * Organization profile editor.
 *
 * Until recently this page was a placeholder of hardcoded `defaultValue`
 * inputs ("Acme Corporation Pvt Ltd") with a "Save Changes" button that
 * did nothing. Replaced with a real load-and-save form against
 * `PATCH /api/organizations/[orgId]`. Tax-related flags (composition
 * scheme, India-specific) live on `/settings/india-tax`; logo upload +
 * branding are still pending and linked at the bottom.
 */
export default function OrganizationSettingsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [org, setOrg] = React.useState<Org | null>(null);

  const reload = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/organizations/${organizationId}`, {
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed to load");
      setOrg(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function save(form: FormData) {
    if (!organizationId) return;
    setSaving(true);
    setError(null);
    setSavedAt(null);
    const trimmed = (k: string) => {
      const v = form.get(k);
      if (typeof v !== "string") return undefined;
      return v.trim() || null;
    };
    try {
      const payload = {
        name: trimmed("name") ?? org?.name ?? "",
        legalName: trimmed("legalName"),
        registrationNo: trimmed("registrationNo"),
        taxId: trimmed("taxId"),
        gstNo: trimmed("gstNo"),
        panNo: trimmed("panNo"),
        tanNo: trimmed("tanNo"),
        website: trimmed("website"),
        email: trimmed("email"),
        phone: trimmed("phone"),
        address: trimmed("address"),
        city: trimmed("city"),
        state: trimmed("state"),
        country: trimmed("country") ?? "IN",
        postalCode: trimmed("postalCode"),
      };
      const r = await fetch(`/api/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Save failed");
      setSavedAt(new Date().toLocaleTimeString());
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (orgLoading || (loading && !org)) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization</h1>
        <p className="text-muted-foreground">
          Profile, tax IDs, and contact info. Saved via PATCH{" "}
          <code className="text-xs">/api/organizations/[orgId]</code>.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(new FormData(e.currentTarget));
        }}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic information</CardTitle>
            <CardDescription>Display name + legal entity details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field
              name="name"
              label="Display name *"
              required
              defaultValue={org?.name ?? ""}
            />
            <Field
              name="legalName"
              label="Legal name"
              defaultValue={org?.legalName ?? ""}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                name="registrationNo"
                label="Registration #"
                defaultValue={org?.registrationNo ?? ""}
              />
              <Field
                name="taxId"
                label="Tax ID"
                defaultValue={org?.taxId ?? ""}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tax IDs</CardTitle>
            <CardDescription>
              Used on every invoice / bill and surfaced on returns.
              India-specific flags (composition scheme, supplier state) live
              on a separate page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field
                name="gstNo"
                label="GSTIN"
                defaultValue={org?.gstNo ?? ""}
                mono
                upper
                maxLength={15}
                placeholder="27AAAAA0000A1Z5"
              />
              <Field
                name="panNo"
                label="PAN"
                defaultValue={org?.panNo ?? ""}
                mono
                upper
                maxLength={10}
              />
              <Field
                name="tanNo"
                label="TAN"
                defaultValue={org?.tanNo ?? ""}
                mono
                upper
                maxLength={10}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field
                name="email"
                label="Email"
                type="email"
                defaultValue={org?.email ?? ""}
              />
              <Field
                name="phone"
                label="Phone"
                defaultValue={org?.phone ?? ""}
              />
            </div>
            <Field
              name="website"
              label="Website"
              defaultValue={org?.website ?? ""}
              placeholder="https://example.com"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registered address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field
              name="address"
              label="Street address"
              defaultValue={org?.address ?? ""}
            />
            <div className="grid grid-cols-3 gap-3">
              <Field
                name="city"
                label="City"
                defaultValue={org?.city ?? ""}
              />
              <Field
                name="state"
                label="State (2-letter for India)"
                defaultValue={org?.state ?? ""}
                upper
                maxLength={3}
              />
              <Field
                name="postalCode"
                label="Postal code"
                defaultValue={org?.postalCode ?? ""}
              />
            </div>
            <Field
              name="country"
              label="Country (ISO 3166-1 alpha-2)"
              defaultValue={org?.country ?? "IN"}
              upper
              maxLength={2}
            />
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {savedAt && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Saved at {savedAt}.</span>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save changes
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Related</CardTitle>
          <CardDescription>
            India-specific tax flags + module configuration are split out so
            they can evolve independently.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href="/settings/india-tax">
            <Button variant="outline" className="w-full justify-between">
              India Tax — composition scheme, supplier state
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/settings/taxes">
            <Button variant="outline" className="w-full justify-between">
              Tax rates (CGST / SGST / IGST / cess)
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/settings/users">
            <Button variant="outline" className="w-full justify-between">
              Users &amp; Roles
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
  type = "text",
  placeholder,
  mono,
  upper,
  maxLength,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  mono?: boolean;
  upper?: boolean;
  maxLength?: number;
}) {
  return (
    <div>
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        type={type}
        placeholder={placeholder}
        maxLength={maxLength}
        className={[
          mono ? "font-mono" : "",
          upper ? "uppercase" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useOrganization } from "@/frontend/hooks/use-organization";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { Switch } from "@/frontend/components/ui/switch";
import {
  Plus,
  Search,
  Receipt,
  MoreHorizontal,
  Edit,
  Trash2,
  FileText,
  Percent,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";

/**
 * A tax rate as the API stores it. CGST/SGST/IGST are not columns — the
 * split is derived from the combined rate at the point of invoicing
 * (see computeLineGst), so it is derived here too rather than stored
 * twice and allowed to drift.
 */
interface TaxConfig {
  id: string;
  name: string;
  code: string;
  taxType: string;
  rate: string | number;
  description?: string | null;
  isActive: boolean;
}

const TAX_TYPES = ["GST", "IGST", "CGST", "SGST", "VAT", "TDS", "TCS", "CESS"] as const;

/** How an intra-state supply at this rate splits, for display only. */
function splitOf(tax: TaxConfig) {
  const rate = Number(tax.rate);
  if (tax.taxType === "GST") return { cgst: rate / 2, sgst: rate / 2, igst: rate };
  if (tax.taxType === "IGST") return { cgst: null, sgst: null, igst: rate };
  if (tax.taxType === "CGST") return { cgst: rate, sgst: null, igst: null };
  if (tax.taxType === "SGST") return { cgst: null, sgst: rate, igst: null };
  return { cgst: null, sgst: null, igst: null };
}

/**
 * A short reference list of common codes, not the organization's own data
 * and not the full HSN/SAC schedule. `/api/hsn-search` is the live lookup.
 */
const hsnCodes = [
  {
    code: "8471",
    description: "Automatic data processing machines and units",
    gstRate: 18,
    category: "Electronics",
  },
  {
    code: "7308",
    description: "Structures and parts of structures of iron or steel",
    gstRate: 18,
    category: "Metals",
  },
  {
    code: "3926",
    description: "Articles of plastics and articles of other materials",
    gstRate: 18,
    category: "Plastics",
  },
  {
    code: "8544",
    description: "Insulated wire, cable and other insulated electric conductors",
    gstRate: 18,
    category: "Electrical",
  },
  {
    code: "9403",
    description: "Furniture and parts thereof",
    gstRate: 18,
    category: "Furniture",
  },
];

const sacCodes = [
  {
    code: "998311",
    description: "Management consulting and management services",
    gstRate: 18,
    category: "Professional Services",
  },
  {
    code: "998312",
    description: "Business consulting services",
    gstRate: 18,
    category: "Professional Services",
  },
  {
    code: "998313",
    description: "Information technology consulting and support services",
    gstRate: 18,
    category: "IT Services",
  },
  {
    code: "998314",
    description: "IT design and development services",
    gstRate: 18,
    category: "IT Services",
  },
];

const EMPTY_FORM = { name: "", code: "", taxType: "GST", rate: "", description: "", isActive: true };

export default function TaxesPage() {
  const { organizationId } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [taxRates, setTaxRates] = useState<TaxConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** The row being edited, or null when the dialog is creating a new rate. */
  const [editing, setEditing] = useState<TaxConfig | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  /**
   * This page used to render a hardcoded list of seven invented rates and
   * a Save button that only closed the dialog, so the real tax masters
   * were neither shown nor editable. The API behind it was complete all
   * along.
   */
  const load = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/tax-config?limit=200`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load tax rates");
      const json = await res.json();
      setTaxRates(json.data ?? json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tax rates");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setIsDialogOpen(true); };
  const openEdit = (tax: TaxConfig) => {
    setEditing(tax);
    setForm({
      name: tax.name, code: tax.code, taxType: tax.taxType,
      rate: String(tax.rate), description: tax.description ?? "", isActive: tax.isActive,
    });
    setIsDialogOpen(true);
  };

  const save = async () => {
    if (!organizationId) return;
    if (!form.name.trim() || !form.code.trim()) return toast.error("Name and code are required");
    const rate = Number(form.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return toast.error("Rate must be between 0 and 100");

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), code: form.code.trim(), taxType: form.taxType,
        rate, description: form.description.trim() || undefined, isActive: form.isActive,
      };
      // PATCH takes the id in the body as `taxId`; the rest is a partial update.
      const res = await fetch(`/api/organizations/${organizationId}/tax-config`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { taxId: editing.id, ...payload } : payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save tax rate");
      toast.success(editing ? "Tax rate updated" : "Tax rate created");
      setIsDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save tax rate");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tax: TaxConfig) => {
    if (!organizationId) return;
    if (!confirm(`Delete "${tax.name}"? Rates already used on documents are deactivated rather than removed.`)) return;
    try {
      const res = await fetch(`/api/organizations/${organizationId}/tax-config?taxId=${tax.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to delete tax rate");
      const body = await res.json().catch(() => ({}));
      toast.success(body.softDeleted ? "Tax rate is in use — deactivated instead" : "Tax rate deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete tax rate");
    }
  };

  const visibleRates = taxRates.filter((t) => {
    const q = searchTerm.trim().toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.taxType.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tax Configuration</h1>
          <p className="text-muted-foreground">
            Configure GST, TDS, and other tax rates
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) setEditing(null); }}>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Tax Rate
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Tax Rate" : "Add Tax Rate"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? `Update "${editing.name}". Documents already raised keep the rate they were issued with.`
                  : "Create a new tax rate configuration"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tax Name</Label>
                  <Input
                    placeholder="e.g., GST 18%"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input
                    placeholder="e.g., GST18"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tax Type</Label>
                  <Select value={form.taxType} onValueChange={(v) => setForm({ ...form, taxType: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rate (%)</Label>
                  <Input
                    type="number" min="0" max="100" step="0.01" placeholder="0"
                    value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  />
                </div>
              </div>
              {/* CGST/SGST/IGST are derived from the rate, not stored, so
                  they are shown rather than typed — that is what keeps the
                  split on an invoice consistent with the master. */}
              {["GST", "IGST", "CGST", "SGST"].includes(form.taxType) && Number(form.rate) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {form.taxType === "GST"
                    ? `Intra-state: CGST ${(Number(form.rate) / 2).toFixed(2)}% + SGST ${(Number(form.rate) / 2).toFixed(2)}%. Inter-state: IGST ${Number(form.rate).toFixed(2)}%.`
                    : `Applied as ${form.taxType} ${Number(form.rate).toFixed(2)}%.`}
                </p>
              )}
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  placeholder="Optional"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving..." : editing ? "Save Changes" : "Save Tax Rate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tax Rates</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taxRates.filter((t) => t.isActive).length}</div>
            <p className="text-xs text-muted-foreground">
              {[...new Set(taxRates.filter((t) => t.isActive).map((t) => t.taxType))].join(", ") || "None configured"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">HSN Codes</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hsnCodes.length}</div>
            <p className="text-xs text-muted-foreground">Reference list, for goods</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SAC Codes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sacCodes.length}</div>
            <p className="text-xs text-muted-foreground">Reference list, for services</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Filing Due</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">GSTR-3B</div>
            <p className="text-xs text-muted-foreground">Due 20th of next month</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rates">Tax Rates</TabsTrigger>
          <TabsTrigger value="hsn">HSN Codes</TabsTrigger>
          <TabsTrigger value="sac">SAC Codes</TabsTrigger>
          <TabsTrigger value="settings">GST Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tax Rates</CardTitle>
                  <CardDescription>
                    Manage tax rates for invoices and transactions
                  </CardDescription>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tax rates..."
                    className="pl-8 w-[250px]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tax Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        Loading tax rates...
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && visibleRates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        {searchTerm ? "No tax rates match your search." : "No tax rates yet. Add one to get started."}
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && visibleRates.map((tax) => {
                    const split = splitOf(tax);
                    return (
                    <TableRow key={tax.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tax.name}</span>
                          <Badge variant="secondary" className="text-xs">{tax.code}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tax.taxType}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {Number(tax.rate)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {split.cgst !== null ? `${split.cgst}%` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {split.sgst !== null ? `${split.sgst}%` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {split.igst !== null ? `${split.igst}%` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            tax.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {tax.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Open actions menu">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(tax)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => remove(tax)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hsn" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>HSN Codes</CardTitle>
                  <CardDescription>
                    Harmonized System of Nomenclature codes for goods
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search HSN codes..."
                      className="pl-8 w-[250px]"
                    />
                  </div>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add HSN
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HSN Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">GST Rate</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hsnCodes.map((hsn) => (
                    <TableRow key={hsn.code}>
                      <TableCell className="font-mono font-medium">
                        {hsn.code}
                      </TableCell>
                      <TableCell>{hsn.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{hsn.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{hsn.gstRate}%</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sac" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>SAC Codes</CardTitle>
                  <CardDescription>
                    Services Accounting Codes for services
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search SAC codes..."
                      className="pl-8 w-[250px]"
                    />
                  </div>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add SAC
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SAC Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">GST Rate</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sacCodes.map((sac) => (
                    <TableRow key={sac.code}>
                      <TableCell className="font-mono font-medium">
                        {sac.code}
                      </TableCell>
                      <TableCell>{sac.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{sac.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{sac.gstRate}%</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>GST Settings</CardTitle>
              <CardDescription>
                Configure GST related settings for your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>GSTIN</Label>
                  <Input defaultValue="27DEMO12345A1ZA" />
                </div>
                <div className="space-y-2">
                  <Label>GST Registration Type</Label>
                  <Select defaultValue="regular">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="composition">Composition</SelectItem>
                      <SelectItem value="unregistered">Unregistered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Select defaultValue="MH">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JK">Jammu & Kashmir (01)</SelectItem>
                      <SelectItem value="HP">Himachal Pradesh (02)</SelectItem>
                      <SelectItem value="PB">Punjab (03)</SelectItem>
                      <SelectItem value="CH">Chandigarh (04)</SelectItem>
                      <SelectItem value="UK">Uttarakhand (05)</SelectItem>
                      <SelectItem value="HR">Haryana (06)</SelectItem>
                      <SelectItem value="DL">Delhi (07)</SelectItem>
                      <SelectItem value="RJ">Rajasthan (08)</SelectItem>
                      <SelectItem value="UP">Uttar Pradesh (09)</SelectItem>
                      <SelectItem value="BR">Bihar (10)</SelectItem>
                      <SelectItem value="SK">Sikkim (11)</SelectItem>
                      <SelectItem value="AR">Arunachal Pradesh (12)</SelectItem>
                      <SelectItem value="NL">Nagaland (13)</SelectItem>
                      <SelectItem value="MN">Manipur (14)</SelectItem>
                      <SelectItem value="MZ">Mizoram (15)</SelectItem>
                      <SelectItem value="TR">Tripura (16)</SelectItem>
                      <SelectItem value="ML">Meghalaya (17)</SelectItem>
                      <SelectItem value="AS">Assam (18)</SelectItem>
                      <SelectItem value="WB">West Bengal (19)</SelectItem>
                      <SelectItem value="JH">Jharkhand (20)</SelectItem>
                      <SelectItem value="OD">Odisha (21)</SelectItem>
                      <SelectItem value="CG">Chhattisgarh (22)</SelectItem>
                      <SelectItem value="MP">Madhya Pradesh (23)</SelectItem>
                      <SelectItem value="GJ">Gujarat (24)</SelectItem>
                      <SelectItem value="DD">Dadra & Nagar Haveli and Daman & Diu (26)</SelectItem>
                      <SelectItem value="MH">Maharashtra (27)</SelectItem>
                      <SelectItem value="AP">Andhra Pradesh (28)</SelectItem>
                      <SelectItem value="KA">Karnataka (29)</SelectItem>
                      <SelectItem value="GA">Goa (30)</SelectItem>
                      <SelectItem value="LD">Lakshadweep (31)</SelectItem>
                      <SelectItem value="KL">Kerala (32)</SelectItem>
                      <SelectItem value="TN">Tamil Nadu (33)</SelectItem>
                      <SelectItem value="PY">Puducherry (34)</SelectItem>
                      <SelectItem value="AN">Andaman & Nicobar Islands (35)</SelectItem>
                      <SelectItem value="TS">Telangana (36)</SelectItem>
                      <SelectItem value="LA">Ladakh (37)</SelectItem>
                      <SelectItem value="OT">Other Territory (97)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>E-Invoice Applicable</Label>
                  <Select defaultValue="yes">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Reverse Charge Mechanism</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable RCM for applicable purchases
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-apply IGST for inter-state</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically use IGST for transactions outside state
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>E-Way Bill Integration</Label>
                    <p className="text-sm text-muted-foreground">
                      Auto-generate e-way bills for applicable shipments
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
              <div className="flex justify-end">
                <Button>Save Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

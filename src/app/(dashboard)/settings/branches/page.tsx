"use client";

import * as React from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building,
  Plus,
  Loader2,
  AlertCircle,
  Pencil,
} from "lucide-react";

interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  gstNo?: string;
  isHeadOffice: boolean;
  isActive: boolean;
}

export default function BranchesSettingsPage() {
  const { organizationId, isLoading: authLoading } = useOrganization();
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingBranch, setEditingBranch] = React.useState<Branch | null>(null);

  const [formData, setFormData] = React.useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    country: "IN",
    postalCode: "",
    phone: "",
    email: "",
    gstNo: "",
    isHeadOffice: false,
  });

  const fetchBranches = React.useCallback(async () => {
    if (!organizationId) return;

    try {
      const response = await fetch(`/api/organizations/${organizationId}/branches`);
      if (response.ok) {
        const data = await response.json();
        setBranches(data);
      }
    } catch (error) {
      console.error("Error fetching branches:", error);
      toast.error("Failed to fetch branches");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      address: "",
      city: "",
      state: "",
      country: "IN",
      postalCode: "",
      phone: "",
      email: "",
      gstNo: "",
      isHeadOffice: false,
    });
    setEditingBranch(null);
  };

  const handleOpenDialog = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setFormData({
        name: branch.name,
        code: branch.code,
        address: branch.address || "",
        city: branch.city || "",
        state: branch.state || "",
        country: branch.country || "IN",
        postalCode: branch.postalCode || "",
        phone: branch.phone || "",
        email: branch.email || "",
        gstNo: branch.gstNo || "",
        isHeadOffice: branch.isHeadOffice,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.code) {
      toast.error("Name and code are required");
      return;
    }

    setSaving(true);

    try {
      const url = editingBranch
        ? `/api/organizations/${organizationId}/branches/${editingBranch.id}`
        : `/api/organizations/${organizationId}/branches`;

      const response = await fetch(url, {
        method: editingBranch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save branch");
      }

      toast.success(editingBranch ? "Branch updated" : "Branch created");
      setDialogOpen(false);
      resetForm();
      fetchBranches();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save branch");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branches</h1>
          <p className="text-muted-foreground">
            Manage your organization branches and locations
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Branch
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingBranch ? "Edit Branch" : "Add New Branch"}
              </DialogTitle>
              <DialogDescription>
                {editingBranch
                  ? "Update branch details"
                  : "Create a new branch for your organization"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Branch Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Head Office"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Branch Code *</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value.toUpperCase() })
                      }
                      placeholder="HO"
                      required
                    />
                  </div>
                </div>

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

                <div className="grid grid-cols-3 gap-4">
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

                <div className="grid grid-cols-2 gap-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      placeholder="branch@company.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gstNo">GST Number</Label>
                  <Input
                    id="gstNo"
                    value={formData.gstNo}
                    onChange={(e) =>
                      setFormData({ ...formData, gstNo: e.target.value.toUpperCase() })
                    }
                    placeholder="27AADCA1234A1ZA"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="isHeadOffice"
                    checked={formData.isHeadOffice}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isHeadOffice: checked })
                    }
                  />
                  <Label htmlFor="isHeadOffice">Mark as Head Office</Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saving ? "Saving..." : editingBranch ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Branches</CardTitle>
          <CardDescription>
            View and manage all branches in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {branches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Building className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No branches found</p>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Branch
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>GST No.</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{branch.name}</span>
                        {branch.isHeadOffice && (
                          <Badge variant="secondary">HQ</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm">{branch.code}</code>
                    </TableCell>
                    <TableCell>
                      {branch.city && branch.state
                        ? `${branch.city}, ${branch.state}`
                        : branch.city || branch.state || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {branch.phone && <div>{branch.phone}</div>}
                        {branch.email && (
                          <div className="text-muted-foreground">{branch.email}</div>
                        )}
                        {!branch.phone && !branch.email && "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm">{branch.gstNo || "-"}</code>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(branch)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

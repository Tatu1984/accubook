"use client";

import * as React from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderTree,
  Building,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/hooks/use-organization";
import { toast } from "sonner";

interface CostCenter {
  id: string;
  name: string;
  code?: string;
  description?: string;
  parentId?: string;
  isActive: boolean;
  children?: CostCenter[];
}

function CostCenterTree({
  items,
  level = 0,
  onEdit,
  onDelete,
  onAddChild,
}: {
  items: CostCenter[];
  level?: number;
  onEdit: (item: CostCenter) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(
    new Set(items.map((i) => i.id))
  );

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpanded(newExpanded);
  };

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.id}>
          <div
            className={cn(
              "flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors",
              level > 0 && "ml-6"
            )}
          >
            <div className="flex items-center gap-3">
              {item.children && item.children.length > 0 ? (
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="p-1 hover:bg-muted rounded"
                >
                  {expanded.has(item.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <div className="w-6" />
              )}
              <Building className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="font-medium">{item.name}</span>
                {item.code && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    ({item.code})
                  </span>
                )}
              </div>
              {!item.isActive && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onAddChild(item.id)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Sub-Center
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(item)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {item.children && expanded.has(item.id) && (
            <CostCenterTree
              items={item.children}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function CostCentersPage() {
  const { organizationId, isLoading: authLoading } = useOrganization();
  const [costCenters, setCostCenters] = React.useState<CostCenter[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<string | null>(null);
  const [editItem, setEditItem] = React.useState<CostCenter | null>(null);

  const [formData, setFormData] = React.useState({
    name: "",
    code: "",
    description: "",
    parentId: "",
    isActive: true,
  });

  // Fetch cost centers
  const fetchCostCenters = React.useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/cost-centers`
      );
      if (response.ok) {
        const data = await response.json();
        setCostCenters(buildTree(data.data || data));
      }
    } catch (error) {
      console.error("Error fetching cost centers:", error);
      toast.error("Failed to load cost centers");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      fetchCostCenters();
    }
  }, [organizationId, fetchCostCenters]);

  // Build tree from flat list
  const buildTree = (items: CostCenter[]): CostCenter[] => {
    const map = new Map<string, CostCenter>();
    const roots: CostCenter[] = [];

    items.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    items.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  // Get flat list for parent dropdown
  const flatList = React.useMemo(() => {
    const result: CostCenter[] = [];
    const flatten = (items: CostCenter[], level = 0) => {
      items.forEach((item) => {
        result.push({ ...item, name: "  ".repeat(level) + item.name });
        if (item.children) flatten(item.children, level + 1);
      });
    };
    flatten(costCenters);
    return result;
  }, [costCenters]);

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);

    try {
      const url = editItem
        ? `/api/organizations/${organizationId}/cost-centers/${editItem.id}`
        : `/api/organizations/${organizationId}/cost-centers`;

      const response = await fetch(url, {
        method: editItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          code: formData.code || undefined,
          description: formData.description || undefined,
          parentId: formData.parentId || undefined,
          isActive: formData.isActive,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save cost center");
      }

      toast.success(
        editItem
          ? "Cost center updated successfully"
          : "Cost center created successfully"
      );
      setIsDialogOpen(false);
      resetForm();
      fetchCostCenters();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save cost center"
      );
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!itemToDelete || !organizationId) return;

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/cost-centers/${itemToDelete}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to delete cost center");
      }

      toast.success("Cost center deleted successfully");
      fetchCostCenters();
    } catch (error) {
      toast.error("Failed to delete cost center");
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      description: "",
      parentId: "",
      isActive: true,
    });
    setEditItem(null);
  };

  // Open edit dialog
  const handleEdit = (item: CostCenter) => {
    setEditItem(item);
    setFormData({
      name: item.name,
      code: item.code || "",
      description: item.description || "",
      parentId: item.parentId || "",
      isActive: item.isActive,
    });
    setIsDialogOpen(true);
  };

  // Open add child dialog
  const handleAddChild = (parentId: string) => {
    resetForm();
    setFormData((prev) => ({ ...prev, parentId }));
    setIsDialogOpen(true);
  };

  // Calculate stats
  const totalCenters = React.useMemo(() => {
    let count = 0;
    const countItems = (items: CostCenter[]) => {
      items.forEach((item) => {
        count++;
        if (item.children) countItems(item.children);
      });
    };
    countItems(costCenters);
    return count;
  }, [costCenters]);

  const activeCount = React.useMemo(() => {
    let count = 0;
    const countActive = (items: CostCenter[]) => {
      items.forEach((item) => {
        if (item.isActive) count++;
        if (item.children) countActive(item.children);
      });
    };
    countActive(costCenters);
    return count;
  }, [costCenters]);

  if (authLoading) {
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
          <h1 className="text-2xl font-bold tracking-tight">Cost Centers</h1>
          <p className="text-muted-foreground">
            Manage organizational cost centers for expense tracking
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              New Cost Center
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editItem ? "Edit Cost Center" : "Create Cost Center"}
                </DialogTitle>
                <DialogDescription>
                  {editItem
                    ? "Update cost center details"
                    : "Add a new cost center for tracking expenses"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Enter cost center name"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                    placeholder="Enter unique code"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Enter description"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="parent">Parent Cost Center</Label>
                  <Select
                    value={formData.parentId}
                    onValueChange={(v) =>
                      setFormData({ ...formData, parentId: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select parent (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Top Level)</SelectItem>
                      {flatList
                        .filter((c) => c.id !== editItem?.id)
                        .map((center) => (
                          <SelectItem key={center.id} value={center.id}>
                            {center.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="active">Active</Label>
                  <Switch
                    id="active"
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isActive: checked })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saving ? "Saving..." : editItem ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Total Cost Centers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCenters}</div>
            <p className="text-xs text-muted-foreground">Across all levels</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Level</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{costCenters.length}</div>
            <p className="text-xs text-muted-foreground">Parent centers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {activeCount}
            </div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            <CardTitle>Cost Center Hierarchy</CardTitle>
          </div>
          <CardDescription>
            Organize your cost centers in a hierarchical structure
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : costCenters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Building className="h-12 w-12 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No cost centers found</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Cost Center
              </Button>
            </div>
          ) : (
            <CostCenterTree
              items={costCenters}
              onEdit={handleEdit}
              onDelete={(id) => {
                setItemToDelete(id);
                setDeleteDialogOpen(true);
              }}
              onAddChild={handleAddChild}
            />
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Center</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this cost center? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

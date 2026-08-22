"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowUpDown,
  Building2,
  Loader2,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/frontend/components/ui/dialog";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Textarea } from "@/frontend/components/ui/textarea";
import { DataTable } from "@/frontend/components/ui/data-table";
import { useOrganization } from "@/frontend/hooks/use-organization";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/frontend/components/ui/alert-dialog";
import { toast } from "sonner";

interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  headName: string | null;
  employeeCount: number;
  isActive: boolean;
}

export default function DepartmentsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [editingDepartment, setEditingDepartment] =
    React.useState<Department | null>(null);
  const [deleteDepartmentId, setDeleteDepartmentId] = React.useState<
    string | null
  >(null);

  const [formData, setFormData] = React.useState({
    name: "",
    code: "",
    description: "",
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", description: "" });
    setEditingDepartment(null);
  };

  const fetchDepartments = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/departments`
      );
      if (!response.ok) throw new Error("Failed to fetch departments");
      const data = await response.json();
      setDepartments(data.data || []);
    } catch (error) {
      console.error("Error fetching departments:", error);
      toast.error("Failed to load departments");
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      fetchDepartments().finally(() => setIsLoading(false));
    }
  }, [organizationId, fetchDepartments]);

  const handleSubmit = async () => {
    if (!organizationId) return;
    if (!formData.name || !formData.code) {
      toast.error("Name and code are required");
      return;
    }

    setIsSubmitting(true);
    try {
      /**
       * This used to pop a success toast without issuing a request at all, so
       * every "created" department vanished on the next refresh.
       */
      const url = editingDepartment
        ? `/api/organizations/${organizationId}/departments/${editingDepartment.id}`
        : `/api/organizations/${organizationId}/departments`;

      const response = await fetch(url, {
        method: editingDepartment ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          code: formData.code || undefined,
          description: formData.description || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save department");

      toast.success(
        editingDepartment
          ? "Department updated successfully"
          : "Department created successfully"
      );
      setIsDialogOpen(false);
      resetForm();
      fetchDepartments();
    } catch (error) {
      console.error("Error saving department:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save department"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (department: Department) => {
    setEditingDepartment(department);
    setFormData({
      name: department.name,
      code: department.code ?? "",
      description: department.description ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!organizationId || !deleteDepartmentId) return;
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/departments/${deleteDepartmentId}`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to delete department");
      toast.success(
        data.softDeleted
          ? "Department deactivated (it still has employees)"
          : "Department deleted"
      );
      setDeleteDepartmentId(null);
      fetchDepartments();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete department"
      );
    }
  };

  const columns: ColumnDef<Department>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Department Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("code")}</Badge>
      ),
    },
    {
      accessorKey: "headName",
      header: "Department Head",
      cell: ({ row }) => row.getValue("headName") || "-",
    },
    {
      accessorKey: "employeeCount",
      header: "Employees",
      cell: ({ row }) => row.getValue("employeeCount") || 0,
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => {
        const isActive = row.getValue("isActive") as boolean;
        return (
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Open actions menu">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => setDeleteDepartmentId(row.original.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

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
          <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground">
            Manage organizational departments
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Department
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingDepartment ? "Edit Department" : "Add New Department"}
              </DialogTitle>
              <DialogDescription>
                Create a new department in your organization
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Department Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Engineering"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code *</Label>
                  <Input
                    id="code"
                    placeholder="e.g., ENG"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Department description..."
                  rows={2}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          {departments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No departments found</h3>
              <p className="text-muted-foreground mb-4">
                Create departments to organize your employees
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Department
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={departments}
              searchKey="name"
              searchPlaceholder="Search departments..."
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteDepartmentId}
        onOpenChange={() => setDeleteDepartmentId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this department? If employees are still assigned to it, it
              is deactivated instead so their records stay intact.
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

"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  ArrowUpDown,
  Download,
  Upload,
  Calendar,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { Checkbox } from "@/frontend/components/ui/checkbox";
import { DataTable } from "@/frontend/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import { cn } from "@/shared/utils/common.util";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { RecordDetailsDialog } from "@/frontend/components/ui/record-details-dialog";
import { downloadCsv } from "@/frontend/utils/export-csv";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Types
interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  joiningDate: string;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  status: "ACTIVE" | "ON_NOTICE" | "RELIEVED" | "TERMINATED";
  ctc: number;
  reportingTo?: string;
  avatar?: string;
}

/**
 * The list starts empty and is filled from the API.
 *
 * It used to be seeded with a hardcoded roster, so invented employees
 * appeared on first paint and — if the fetch failed — stayed on screen as
 * though they were real staff.
 */

const statusConfig = {
  ACTIVE: { color: "bg-green-100 text-green-800", label: "Active" },
  ON_NOTICE: { color: "bg-yellow-100 text-yellow-800", label: "On Notice" },
  RELIEVED: { color: "bg-gray-100 text-gray-800", label: "Relieved" },
  TERMINATED: { color: "bg-red-100 text-red-800", label: "Terminated" },
};

const employmentTypeConfig = {
  FULL_TIME: { color: "bg-blue-100 text-blue-800", label: "Full Time" },
  PART_TIME: { color: "bg-purple-100 text-purple-800", label: "Part Time" },
  CONTRACT: { color: "bg-orange-100 text-orange-800", label: "Contract" },
  INTERN: { color: "bg-cyan-100 text-cyan-800", label: "Intern" },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
}

interface EmployeeActions {
  onViewProfile: (employee: Employee) => void;
  onViewPayslips: (employee: Employee) => void;
  onViewAttendance: (employee: Employee) => void;
  onEdit: (employee: Employee) => void;
  onDeactivate: (employee: Employee) => void;
}

// Column definitions — built per render so the row menu reaches the page's
// handlers. As a module-level constant none of its actions could be wired.
function buildColumns(actions: EmployeeActions): ColumnDef<Employee>[] {
  return [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "employeeCode",
    header: "Emp Code",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("employeeCode")}</span>
    ),
  },
  {
    id: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Employee
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    accessorFn: (row) => `${row.firstName} ${row.lastName}`,
    cell: ({ row }) => {
      const employee = row.original;
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={employee.avatar} />
            <AvatarFallback>
              {getInitials(employee.firstName, employee.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">
              {employee.firstName} {employee.lastName}
            </span>
            <span className="text-xs text-muted-foreground">
              {employee.email}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "department",
    header: "Department",
  },
  {
    accessorKey: "designation",
    header: "Designation",
  },
  {
    accessorKey: "joiningDate",
    header: "Joining Date",
    cell: ({ row }) => formatDate(row.getValue("joiningDate")),
  },
  {
    accessorKey: "employmentType",
    header: "Type",
    cell: ({ row }) => {
      const type = row.getValue("employmentType") as keyof typeof employmentTypeConfig;
      const config = employmentTypeConfig[type];
      return (
        <Badge variant="secondary" className={cn("text-xs", config.color)}>
          {config.label}
        </Badge>
      );
    },
  },
  {
    accessorKey: "ctc",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="justify-end w-full"
        >
          CTC (Annual)
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {formatCurrency(row.getValue("ctc"))}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as keyof typeof statusConfig;
      const config = statusConfig[status];
      return (
        <Badge variant="secondary" className={cn("text-xs", config.color)}>
          {config.label}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const employee = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => actions.onViewProfile(employee)}>
              <Eye className="mr-2 h-4 w-4" />
              View Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onViewPayslips(employee)}>
              <FileText className="mr-2 h-4 w-4" />
              View Payslips
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onViewAttendance(employee)}>
              <Calendar className="mr-2 h-4 w-4" />
              Attendance
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onEdit(employee)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => actions.onDeactivate(employee)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Deactivate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
  ];
}

const initialFormData = {
  employeeCode: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  joiningDate: "",
  employmentType: "FULL_TIME",
  ctc: "",
  panNo: "",
  aadharNo: "",
};

export default function EmployeesPage() {
  const router = useRouter();
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [detailsEmployee, setDetailsEmployee] = React.useState<Employee | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");
  const [employeesData, setEmployeesData] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [formData, setFormData] = React.useState(initialFormData);
  const [editingEmployee, setEditingEmployee] = React.useState<Employee | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [employeeToDelete, setEmployeeToDelete] = React.useState<Employee | null>(null);

  // Fetch employees from API
  React.useEffect(() => {
    if (organizationId) {
      fetchEmployees();
    }
  }, [organizationId]);

  const fetchEmployees = async () => {
    if (!organizationId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/employees?limit=500`);
      if (response.ok) {
        const payload = await response.json();
        /**
         * The endpoint answers `{ data, pagination }`. This read the envelope
         * itself as the array, so `data.length` was always undefined and the
         * roster rendered empty no matter how many employees existed.
         */
        const data = payload.data ?? [];
        {
          type ApiEmployee = {
            id: string;
            employeeCode: string;
            firstName: string;
            lastName?: string | null;
            email?: string | null;
            phone?: string | null;
            department?: { name?: string | null } | null;
            designation?: { name?: string | null } | null;
            joiningDate: string;
            employmentType: Employee["employmentType"];
            status: Employee["status"];
            ctc?: number | string | null;
            reportingTo?: string | null;
          };
          setEmployeesData((data as ApiEmployee[]).map<Employee>((emp) => ({
            id: emp.id,
            employeeCode: emp.employeeCode,
            firstName: emp.firstName,
            lastName: emp.lastName || "",
            email: emp.email || "",
            phone: emp.phone || "",
            department: emp.department?.name || "Unassigned",
            designation: emp.designation?.name || "Unassigned",
            joiningDate: emp.joiningDate,
            employmentType: emp.employmentType,
            status: emp.status,
            ctc: Number(emp.ctc) || 0,
            reportingTo: emp.reportingTo ?? undefined,
          })));
        }
      }
    } catch (error) {
      console.error("Error fetching employees:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!organizationId) {
      toast.error("Please select an organization");
      return;
    }
    if (!formData.employeeCode || !formData.firstName || !formData.email || !formData.joiningDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      const url = editingEmployee
        ? `/api/organizations/${organizationId}/employees/${editingEmployee.id}`
        : `/api/organizations/${organizationId}/employees`;

      const response = await fetch(url, {
        method: editingEmployee ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          ctc: formData.ctc ? parseFloat(formData.ctc) : 0,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save employee");
      }

      toast.success(editingEmployee ? "Employee updated successfully" : "Employee added successfully");
      setIsDialogOpen(false);
      setFormData(initialFormData);
      setEditingEmployee(null);
      fetchEmployees();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save employee");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone,
      department: employee.department,
      designation: employee.designation,
      joiningDate: employee.joiningDate.split("T")[0],
      employmentType: employee.employmentType,
      ctc: employee.ctc.toString(),
      panNo: "",
      aadharNo: "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!employeeToDelete || !organizationId) return;

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/employees/${employeeToDelete.id}`,
        { method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "TERMINATED" }) }
      );
      if (!response.ok) throw new Error("Failed to deactivate");
      toast.success("Employee deactivated successfully");
      fetchEmployees();
    } catch {
      toast.error("Failed to deactivate employee");
    } finally {
      setDeleteDialogOpen(false);
      setEmployeeToDelete(null);
    }
  };

  const filteredEmployees = React.useMemo(() => {
    if (selectedStatus === "all") return employeesData;
    return employeesData.filter((emp) => emp.status === selectedStatus);
  }, [selectedStatus, employeesData]);

  const columns = React.useMemo(
    () =>
      buildColumns({
        onViewProfile: setDetailsEmployee,
        onViewPayslips: (employee) =>
          router.push(`/hr/payroll?employeeCode=${encodeURIComponent(employee.employeeCode)}`),
        onViewAttendance: (employee) =>
          router.push(`/hr/attendance?employeeCode=${encodeURIComponent(employee.employeeCode)}`),
        onEdit: handleEdit,
        onDeactivate: (employee) => {
          setEmployeeToDelete(employee);
          setDeleteDialogOpen(true);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router]
  );

  const handleExport = () => {
    if (filteredEmployees.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `employees-${new Date().toISOString().slice(0, 10)}`,
      filteredEmployees.map((emp) => ({
        Code: emp.employeeCode,
        FirstName: emp.firstName,
        LastName: emp.lastName,
        Email: emp.email,
        Phone: emp.phone,
        Department: emp.department,
        Designation: emp.designation,
        JoiningDate: formatDate(emp.joiningDate),
        EmploymentType: emp.employmentType,
        CTC: emp.ctc,
        Status: emp.status,
      }))
    );
    toast.success(`Exported ${filteredEmployees.length} employees`);
  };

  /**
   * CSV import. Header row (case-insensitive) must contain at least
   * `employeeCode`, `firstName` and `joiningDate`.
   */
  const handleImportFile = async (file: File) => {
    if (!organizationId) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) {
        toast.error("The file has no data rows");
        return;
      }

      const parseLine = (line: string): string[] => {
        const cells: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (inQuotes) {
            if (char === '"' && line[i + 1] === '"') {
              current += '"';
              i++;
            } else if (char === '"') {
              inQuotes = false;
            } else {
              current += char;
            }
          } else if (char === '"') {
            inQuotes = true;
          } else if (char === ",") {
            cells.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        cells.push(current);
        return cells.map((c) => c.trim());
      };

      const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ""));
      const col = (row: string[], ...names: string[]) => {
        for (const name of names) {
          const index = headers.indexOf(name);
          if (index !== -1 && row[index]) return row[index];
        }
        return "";
      };

      let created = 0;
      const failures: string[] = [];

      for (const line of lines.slice(1)) {
        const row = parseLine(line);
        const employeeCode = col(row, "employeecode", "code");
        const firstName = col(row, "firstname", "name");
        const joiningDate = col(row, "joiningdate", "dateofjoining");
        if (!employeeCode || !firstName || !joiningDate) continue;

        try {
          const response = await fetch(
            `/api/organizations/${organizationId}/employees`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                employeeCode,
                firstName,
                lastName: col(row, "lastname") || undefined,
                email: col(row, "email") || undefined,
                phone: col(row, "phone") || undefined,
                joiningDate,
                employmentType:
                  col(row, "employmenttype").toUpperCase() || "FULL_TIME",
                ctc: Number(col(row, "ctc")) || undefined,
                panNo: col(row, "panno", "pan") || undefined,
                aadharNo: col(row, "aadharno", "aadhar") || undefined,
              }),
            }
          );
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            failures.push(`${employeeCode}: ${error.error ?? response.statusText}`);
          } else {
            created++;
          }
        } catch {
          failures.push(`${employeeCode}: request failed`);
        }
      }

      if (created > 0) toast.success(`Imported ${created} employees`);
      if (failures.length > 0) {
        toast.error(`${failures.length} rows failed. First: ${failures[0]}`, {
          duration: 8000,
        });
      }
      if (created === 0 && failures.length === 0) {
        toast.error(
          "No importable rows — employeeCode, firstName and joiningDate are required"
        );
      }
      fetchEmployees();
    } catch (error) {
      console.error("Error importing employees:", error);
      toast.error("Failed to read the import file");
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  // Summary stats
  const stats = React.useMemo(() => {
    const activeEmployees = employeesData.filter((e) => e.status === "ACTIVE");
    return {
      total: employeesData.length,
      active: activeEmployees.length,
      onNotice: employeesData.filter((e) => e.status === "ON_NOTICE").length,
      departments: [...new Set(employeesData.map((e) => e.department))].length,
      totalCtc: activeEmployees.reduce((sum, e) => sum + e.ctc, 0),
    };
  }, [employeesData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">
            Manage your organization&apos;s workforce
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />
          <Button
            variant="outline"
            disabled={isImporting}
            onClick={() => importInputRef.current?.click()}
          >
            {isImporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Import
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Employee</DialogTitle>
                <DialogDescription>
                  Enter the employee details to add them to your organization
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emp-code">Employee Code *</Label>
                    <Input
                      id="emp-code"
                      placeholder="e.g., EMP001"
                      value={formData.employeeCode}
                      onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="first-name">First Name *</Label>
                    <Input
                      id="first-name"
                      placeholder="First name"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">Last Name</Label>
                    <Input
                      id="last-name"
                      placeholder="Last name"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@company.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      placeholder="+91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Department *</Label>
                    <Select
                      value={formData.department}
                      onValueChange={(value) => setFormData({ ...formData, department: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Engineering">Engineering</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                        <SelectItem value="Sales">Sales</SelectItem>
                        <SelectItem value="HR">HR</SelectItem>
                        <SelectItem value="Operations">Operations</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Designation *</Label>
                    <Select
                      value={formData.designation}
                      onValueChange={(value) => setFormData({ ...formData, designation: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select designation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Senior Executive">Senior Executive</SelectItem>
                        <SelectItem value="Executive">Executive</SelectItem>
                        <SelectItem value="Intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="joining-date">Joining Date *</Label>
                    <Input
                      id="joining-date"
                      type="date"
                      value={formData.joiningDate}
                      onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Employment Type</Label>
                    <Select
                      value={formData.employmentType}
                      onValueChange={(value) => setFormData({ ...formData, employmentType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FULL_TIME">Full Time</SelectItem>
                        <SelectItem value="PART_TIME">Part Time</SelectItem>
                        <SelectItem value="CONTRACT">Contract</SelectItem>
                        <SelectItem value="INTERN">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ctc">Annual CTC</Label>
                    <Input
                      id="ctc"
                      type="number"
                      placeholder="0"
                      value={formData.ctc}
                      onChange={(e) => setFormData({ ...formData, ctc: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pan">PAN Number</Label>
                    <Input
                      id="pan"
                      placeholder="ABCDE1234F"
                      value={formData.panNo}
                      onChange={(e) => setFormData({ ...formData, panNo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aadhar">Aadhar Number</Label>
                    <Input
                      id="aadhar"
                      placeholder="1234 5678 9012"
                      value={formData.aadharNo}
                      onChange={(e) => setFormData({ ...formData, aadharNo: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setIsDialogOpen(false);
                  setFormData(initialFormData);
                  setEditingEmployee(null);
                }}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingEmployee ? "Update Employee" : "Add Employee"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">On Notice</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.onNotice}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Departments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.departments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total CTC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalCtc)}</div>
            <p className="text-xs text-muted-foreground">Annual</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
        <TabsList>
          <TabsTrigger value="all">All Employees</TabsTrigger>
          <TabsTrigger value="ACTIVE">Active</TabsTrigger>
          <TabsTrigger value="ON_NOTICE">On Notice</TabsTrigger>
          <TabsTrigger value="RELIEVED">Relieved</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Employees Table */}
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filteredEmployees}
            searchKey="name"
            searchPlaceholder="Search employees..."
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {employeeToDelete?.firstName} {employeeToDelete?.lastName}?
              This action can be reversed later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {detailsEmployee && (
        <RecordDetailsDialog
          open={!!detailsEmployee}
          onOpenChange={(open) => !open && setDetailsEmployee(null)}
          title={`${detailsEmployee.firstName} ${detailsEmployee.lastName}`.trim()}
          description={detailsEmployee.employeeCode}
          status={{
            label: statusConfig[detailsEmployee.status]?.label ?? detailsEmployee.status,
          }}
          sections={[
            {
              title: "Contact",
              fields: [
                { label: "Email", value: detailsEmployee.email },
                { label: "Phone", value: detailsEmployee.phone },
              ],
            },
            {
              title: "Employment",
              fields: [
                { label: "Department", value: detailsEmployee.department },
                { label: "Designation", value: detailsEmployee.designation },
                {
                  label: "Employment Type",
                  value:
                    employmentTypeConfig[detailsEmployee.employmentType]?.label ??
                    detailsEmployee.employmentType,
                },
                {
                  label: "Joining Date",
                  value: formatDate(detailsEmployee.joiningDate),
                },
                { label: "CTC", value: formatCurrency(detailsEmployee.ctc) },
                { label: "Reporting To", value: detailsEmployee.reportingTo },
              ],
            },
          ]}
          actions={
            <Button
              variant="outline"
              onClick={() => {
                const employee = detailsEmployee;
                setDetailsEmployee(null);
                handleEdit(employee);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          }
        />
      )}
    </div>
  );
}

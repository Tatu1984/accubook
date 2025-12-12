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
  User,
  Mail,
  Phone,
  Building,
  Calendar,
  FileText,
  Loader2,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/hooks/use-organization";
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

// Mock data
const employees: Employee[] = [
  {
    id: "1",
    employeeCode: "EMP001",
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@company.com",
    phone: "+91 98765 43210",
    department: "Engineering",
    designation: "Senior Software Engineer",
    joiningDate: "2022-03-15",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    ctc: 1800000,
    reportingTo: "Jane Smith",
  },
  {
    id: "2",
    employeeCode: "EMP002",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@company.com",
    phone: "+91 98765 43211",
    department: "Engineering",
    designation: "Engineering Manager",
    joiningDate: "2021-06-01",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    ctc: 2800000,
  },
  {
    id: "3",
    employeeCode: "EMP003",
    firstName: "Rahul",
    lastName: "Kumar",
    email: "rahul.kumar@company.com",
    phone: "+91 98765 43212",
    department: "Finance",
    designation: "Accountant",
    joiningDate: "2023-01-10",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    ctc: 900000,
    reportingTo: "Priya Sharma",
  },
  {
    id: "4",
    employeeCode: "EMP004",
    firstName: "Priya",
    lastName: "Sharma",
    email: "priya.sharma@company.com",
    phone: "+91 98765 43213",
    department: "Finance",
    designation: "Finance Manager",
    joiningDate: "2020-08-20",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    ctc: 2200000,
  },
  {
    id: "5",
    employeeCode: "EMP005",
    firstName: "Amit",
    lastName: "Patel",
    email: "amit.patel@company.com",
    phone: "+91 98765 43214",
    department: "Sales",
    designation: "Sales Executive",
    joiningDate: "2023-06-01",
    employmentType: "FULL_TIME",
    status: "ON_NOTICE",
    ctc: 600000,
    reportingTo: "Neha Gupta",
  },
  {
    id: "6",
    employeeCode: "EMP006",
    firstName: "Neha",
    lastName: "Gupta",
    email: "neha.gupta@company.com",
    phone: "+91 98765 43215",
    department: "Sales",
    designation: "Sales Manager",
    joiningDate: "2021-02-15",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    ctc: 1500000,
  },
  {
    id: "7",
    employeeCode: "INT001",
    firstName: "Vikram",
    lastName: "Singh",
    email: "vikram.singh@company.com",
    phone: "+91 98765 43216",
    department: "Engineering",
    designation: "Software Engineer Intern",
    joiningDate: "2024-07-01",
    employmentType: "INTERN",
    status: "ACTIVE",
    ctc: 300000,
    reportingTo: "John Doe",
  },
  {
    id: "8",
    employeeCode: "CON001",
    firstName: "Lisa",
    lastName: "Johnson",
    email: "lisa.johnson@company.com",
    phone: "+91 98765 43217",
    department: "HR",
    designation: "HR Consultant",
    joiningDate: "2024-01-15",
    employmentType: "CONTRACT",
    status: "ACTIVE",
    ctc: 1200000,
  },
];

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

// Column definitions
const columns: ColumnDef<Employee>[] = [
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
            <DropdownMenuItem>
              <Eye className="mr-2 h-4 w-4" />
              View Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FileText className="mr-2 h-4 w-4" />
              View Payslips
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Calendar className="mr-2 h-4 w-4" />
              Attendance
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Deactivate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

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
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");
  const [employeesData, setEmployeesData] = React.useState<Employee[]>(employees);
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
      const response = await fetch(`/api/organizations/${organizationId}/employees`);
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          setEmployeesData(data.map((emp: any) => ({
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
            reportingTo: emp.reportingTo,
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
        ? `/api/organizations/${organizationId}/employees?id=${editingEmployee.id}`
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
        `/api/organizations/${organizationId}/employees?id=${employeeToDelete.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete");
      toast.success("Employee deactivated successfully");
      fetchEmployees();
    } catch (error) {
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
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button variant="outline">
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
    </div>
  );
}

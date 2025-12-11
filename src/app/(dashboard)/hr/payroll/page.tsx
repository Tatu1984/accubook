"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Search,
  Wallet,
  Users,
  MoreHorizontal,
  Download,
  Eye,
  FileText,
  Send,
  Calculator,
  IndianRupee,
  Calendar,
  CheckCircle,
  Clock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const payrollRuns = [
  {
    id: "PAY-2024-03",
    month: "March 2024",
    employees: 45,
    grossSalary: 2850000,
    deductions: 485000,
    netSalary: 2365000,
    status: "DRAFT",
    processedDate: null,
  },
  {
    id: "PAY-2024-02",
    month: "February 2024",
    employees: 44,
    grossSalary: 2780000,
    deductions: 472000,
    netSalary: 2308000,
    status: "PAID",
    processedDate: "2024-02-28",
  },
  {
    id: "PAY-2024-01",
    month: "January 2024",
    employees: 43,
    grossSalary: 2720000,
    deductions: 462000,
    netSalary: 2258000,
    status: "PAID",
    processedDate: "2024-01-31",
  },
];

const salarySlips = [
  {
    id: "SLIP-001",
    employee: "Rahul Sharma",
    empId: "EMP001",
    department: "Engineering",
    basic: 50000,
    hra: 20000,
    allowances: 15000,
    grossSalary: 85000,
    pf: 6000,
    tax: 8500,
    deductions: 14500,
    netSalary: 70500,
    status: "GENERATED",
  },
  {
    id: "SLIP-002",
    employee: "Priya Patel",
    empId: "EMP002",
    department: "Finance",
    basic: 45000,
    hra: 18000,
    allowances: 12000,
    grossSalary: 75000,
    pf: 5400,
    tax: 6500,
    deductions: 11900,
    netSalary: 63100,
    status: "SENT",
  },
  {
    id: "SLIP-003",
    employee: "Amit Kumar",
    empId: "EMP003",
    department: "Sales",
    basic: 40000,
    hra: 16000,
    allowances: 10000,
    grossSalary: 66000,
    pf: 4800,
    tax: 4500,
    deductions: 9300,
    netSalary: 56700,
    status: "GENERATED",
  },
  {
    id: "SLIP-004",
    employee: "Sneha Reddy",
    empId: "EMP004",
    department: "HR",
    basic: 42000,
    hra: 16800,
    allowances: 11000,
    grossSalary: 69800,
    pf: 5040,
    tax: 5200,
    deductions: 10240,
    netSalary: 59560,
    status: "SENT",
  },
];

const salaryStructures = [
  {
    id: "STR001",
    name: "Executive Grade",
    basicPercent: 50,
    hraPercent: 40,
    pfPercent: 12,
    employees: 15,
  },
  {
    id: "STR002",
    name: "Manager Grade",
    basicPercent: 50,
    hraPercent: 40,
    pfPercent: 12,
    employees: 12,
  },
  {
    id: "STR003",
    name: "Senior Grade",
    basicPercent: 55,
    hraPercent: 35,
    pfPercent: 12,
    employees: 18,
  },
];

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  PROCESSING: "bg-yellow-100 text-yellow-800",
  GENERATED: "bg-blue-100 text-blue-800",
  SENT: "bg-green-100 text-green-800",
  PAID: "bg-green-100 text-green-800",
};

export default function PayrollPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">
            Manage salary processing and payslips
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Calculator className="mr-2 h-4 w-4" />
              Run Payroll
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Run Payroll</DialogTitle>
              <DialogDescription>
                Process payroll for the selected month
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="03-2024">March 2024</SelectItem>
                      <SelectItem value="04-2024">April 2024</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pay Date</Label>
                  <Input type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Employees</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees (45)</SelectItem>
                    <SelectItem value="engineering">Engineering (15)</SelectItem>
                    <SelectItem value="finance">Finance (8)</SelectItem>
                    <SelectItem value="sales">Sales (12)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Employees</div>
                      <div className="text-xl font-bold">45</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Est. Gross</div>
                      <div className="text-xl font-bold">₹28.5L</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Est. Net</div>
                      <div className="text-xl font-bold">₹23.6L</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>
                <Calculator className="mr-2 h-4 w-4" />
                Calculate Payroll
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹28.5L</div>
            <p className="text-xs text-muted-foreground">March 2024 (Draft)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YTD Payroll</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹3.42Cr</div>
            <p className="text-xs text-muted-foreground">FY 2024-25</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">45</div>
            <p className="text-xs text-muted-foreground">Active on payroll</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2</div>
            <p className="text-xs text-muted-foreground">Salary revisions</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs">Payroll Runs</TabsTrigger>
          <TabsTrigger value="slips">Salary Slips</TabsTrigger>
          <TabsTrigger value="structures">Salary Structures</TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Payroll History</CardTitle>
                  <CardDescription>
                    View and manage monthly payroll runs
                  </CardDescription>
                </div>
                <Select defaultValue="2024">
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2023">2023</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                    <TableHead className="text-right">Gross Salary</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Processed Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">{run.month}</TableCell>
                      <TableCell className="text-right">{run.employees}</TableCell>
                      <TableCell className="text-right">
                        ₹{(run.grossSalary / 100000).toFixed(2)}L
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        ₹{(run.deductions / 100000).toFixed(2)}L
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{(run.netSalary / 100000).toFixed(2)}L
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[run.status]}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {run.processedDate
                          ? new Date(run.processedDate).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <FileText className="mr-2 h-4 w-4" />
                              Generate Slips
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              Download Report
                            </DropdownMenuItem>
                            {run.status === "DRAFT" && (
                              <DropdownMenuItem>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Process Payroll
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slips" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Salary Slips</CardTitle>
                  <CardDescription>
                    March 2024 salary slips
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search employee..."
                      className="pl-8 w-[250px]"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button variant="outline">
                    <Send className="mr-2 h-4 w-4" />
                    Send All
                  </Button>
                  <Button variant="outline" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">HRA</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salarySlips.map((slip) => (
                    <TableRow key={slip.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{slip.employee}</div>
                          <div className="text-sm text-muted-foreground">
                            {slip.empId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{slip.department}</TableCell>
                      <TableCell className="text-right">
                        ₹{slip.basic.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{slip.hra.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{slip.grossSalary.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        ₹{slip.deductions.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{slip.netSalary.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[slip.status]}>
                          {slip.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              View Slip
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Send className="mr-2 h-4 w-4" />
                              Send to Employee
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="structures" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Salary Structures</CardTitle>
                  <CardDescription>
                    Configure salary components and structures
                  </CardDescription>
                </div>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Structure
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {salaryStructures.map((structure) => (
                  <Card key={structure.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">{structure.name}</CardTitle>
                      <CardDescription>
                        {structure.employees} employees
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Basic</span>
                        <span className="font-medium">{structure.basicPercent}% of CTC</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">HRA</span>
                        <span className="font-medium">{structure.hraPercent}% of Basic</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">PF Contribution</span>
                        <span className="font-medium">{structure.pfPercent}% of Basic</span>
                      </div>
                      <Button variant="outline" className="w-full mt-4">
                        Edit Structure
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

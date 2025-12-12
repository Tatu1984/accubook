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
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
  Settings,
  Info,
  HelpCircle,
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
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </TabsTrigger>
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

        <TabsContent value="settings" className="space-y-4">
          {/* Calculation Formula Info */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>How Payroll is Calculated</AlertTitle>
            <AlertDescription>
              Net Salary = Gross Salary - (EPF + ESI + Professional Tax + TDS + Other Deductions)
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Pay Schedule Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Pay Schedule
                </CardTitle>
                <CardDescription>
                  Configure when salaries are processed and paid
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Pay Frequency</Label>
                  <Select defaultValue="monthly">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pay Day</Label>
                  <Select defaultValue="last">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1st of month</SelectItem>
                      <SelectItem value="7">7th of month</SelectItem>
                      <SelectItem value="15">15th of month</SelectItem>
                      <SelectItem value="last">Last day of month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Payroll Cut-off Date</Label>
                  <Select defaultValue="25">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20th of month</SelectItem>
                      <SelectItem value="25">25th of month</SelectItem>
                      <SelectItem value="last">Last day of month</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Attendance and leaves after this date will be considered in next cycle
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Statutory Compliance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Statutory Compliance
                </CardTitle>
                <CardDescription>
                  Configure statutory deductions as per Indian labor laws
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>EPF (Employee Provident Fund)</Label>
                    <p className="text-xs text-muted-foreground">
                      12% of Basic (both employer & employee)
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>ESI (Employee State Insurance)</Label>
                    <p className="text-xs text-muted-foreground">
                      0.75% Employee + 3.25% Employer (if gross ≤ ₹21,000)
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Professional Tax</Label>
                    <p className="text-xs text-muted-foreground">
                      State-wise slab (max ₹2,500/year)
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>TDS (Tax Deducted at Source)</Label>
                    <p className="text-xs text-muted-foreground">
                      As per income tax slabs
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>LWF (Labour Welfare Fund)</Label>
                    <p className="text-xs text-muted-foreground">
                      State-specific contribution
                    </p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Salary Components Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Salary Components & Calculation Rules
              </CardTitle>
              <CardDescription>
                Configure how each salary component is calculated
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Earnings */}
                <div>
                  <h4 className="font-medium mb-3 text-green-600">Earnings (Added to Gross)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Calculation Type</TableHead>
                        <TableHead>Value/Formula</TableHead>
                        <TableHead>Taxable</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Basic Salary</TableCell>
                        <TableCell>
                          <Badge variant="outline">% of CTC</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">50% of CTC</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-red-100 text-red-800">Fully Taxable</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked disabled />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">HRA (House Rent Allowance)</TableCell>
                        <TableCell>
                          <Badge variant="outline">% of Basic</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">40% of Basic (Metro) / 50% (Non-Metro)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-yellow-100 text-yellow-800">Partially Exempt</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Conveyance Allowance</TableCell>
                        <TableCell>
                          <Badge variant="outline">Fixed Amount</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">₹1,600/month</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">Exempt upto ₹1,600</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Special Allowance</TableCell>
                        <TableCell>
                          <Badge variant="outline">Balancing</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">CTC - (Basic + HRA + Other Fixed)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-red-100 text-red-800">Fully Taxable</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Deductions */}
                <div>
                  <h4 className="font-medium mb-3 text-red-600">Deductions (Subtracted from Gross)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Calculation Type</TableHead>
                        <TableHead>Value/Formula</TableHead>
                        <TableHead>Tax Benefit</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">EPF (Employee Share)</TableCell>
                        <TableCell>
                          <Badge variant="outline">% of Basic</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">12% of Basic (max ₹15,000 wage ceiling)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">80C Deduction</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">ESI (Employee Share)</TableCell>
                        <TableCell>
                          <Badge variant="outline">% of Gross</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">0.75% of Gross (if Gross ≤ ₹21,000)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-gray-100 text-gray-800">N/A</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Professional Tax</TableCell>
                        <TableCell>
                          <Badge variant="outline">Slab Based</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">₹200/month (varies by state)</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">Deductible from Income</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">TDS (Income Tax)</TableCell>
                        <TableCell>
                          <Badge variant="outline">Tax Slab</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">As per New/Old Regime selection</code>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-gray-100 text-gray-800">Tax Payment</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Employer Contributions */}
                <div>
                  <h4 className="font-medium mb-3 text-blue-600">Employer Contributions (Not deducted from salary)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Calculation</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">EPF (Employer Share)</TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">12% of Basic (3.67% EPF + 8.33% EPS)</code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          EPS capped at ₹15,000 wage ceiling
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">ESI (Employer Share)</TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">3.25% of Gross</code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          Applicable if employee gross ≤ ₹21,000
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Gratuity</TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">4.81% of Basic</code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          Payable after 5 years of service
                        </TableCell>
                        <TableCell>
                          <Switch defaultChecked />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* EPF & ESI Details */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>EPF Configuration</CardTitle>
                <CardDescription>
                  Employee Provident Fund settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>EPF Establishment Code</Label>
                    <Input placeholder="MHBAN00123450000" />
                  </div>
                  <div className="space-y-2">
                    <Label>EPF Wage Ceiling</Label>
                    <Select defaultValue="15000">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15000">₹15,000 (Statutory)</SelectItem>
                        <SelectItem value="actual">Actual Basic (Voluntary)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Include employer PF in CTC</Label>
                    <p className="text-xs text-muted-foreground">
                      Employer&apos;s 12% contribution shown as part of CTC
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Allow VPF (Voluntary PF)</Label>
                    <p className="text-xs text-muted-foreground">
                      Employees can contribute more than 12%
                    </p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>ESI Configuration</CardTitle>
                <CardDescription>
                  Employee State Insurance settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>ESI Code</Label>
                    <Input placeholder="31-00-123456-000-0001" />
                  </div>
                  <div className="space-y-2">
                    <Label>ESI Wage Limit</Label>
                    <Input value="₹21,000" disabled />
                    <p className="text-xs text-muted-foreground">
                      Statutory limit for ESI applicability
                    </p>
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">ESI Contribution Rates:</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>Employee: <span className="font-medium">0.75%</span></div>
                    <div>Employer: <span className="font-medium">3.25%</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* TDS Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>TDS Configuration</CardTitle>
              <CardDescription>
                Income Tax deduction at source settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>TAN Number</Label>
                  <Input placeholder="MUMB12345A" />
                </div>
                <div className="space-y-2">
                  <Label>Default Tax Regime</Label>
                  <Select defaultValue="new">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New Regime (Default)</SelectItem>
                      <SelectItem value="old">Old Regime</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Financial Year</Label>
                  <Select defaultValue="2024-25">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2024-25">FY 2024-25</SelectItem>
                      <SelectItem value="2025-26">FY 2025-26</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 mt-4">
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium mb-2">New Tax Regime (FY 2024-25)</h5>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Up to ₹3,00,000</span><span className="font-medium">Nil</span></div>
                    <div className="flex justify-between"><span>₹3,00,001 - ₹7,00,000</span><span className="font-medium">5%</span></div>
                    <div className="flex justify-between"><span>₹7,00,001 - ₹10,00,000</span><span className="font-medium">10%</span></div>
                    <div className="flex justify-between"><span>₹10,00,001 - ₹12,00,000</span><span className="font-medium">15%</span></div>
                    <div className="flex justify-between"><span>₹12,00,001 - ₹15,00,000</span><span className="font-medium">20%</span></div>
                    <div className="flex justify-between"><span>Above ₹15,00,000</span><span className="font-medium">30%</span></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Standard deduction: ₹75,000
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium mb-2">Old Tax Regime</h5>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Up to ₹2,50,000</span><span className="font-medium">Nil</span></div>
                    <div className="flex justify-between"><span>₹2,50,001 - ₹5,00,000</span><span className="font-medium">5%</span></div>
                    <div className="flex justify-between"><span>₹5,00,001 - ₹10,00,000</span><span className="font-medium">20%</span></div>
                    <div className="flex justify-between"><span>Above ₹10,00,000</span><span className="font-medium">30%</span></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    80C, 80D, HRA exemptions applicable
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-2">
            <Button variant="outline">Reset to Defaults</Button>
            <Button>Save Payroll Settings</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

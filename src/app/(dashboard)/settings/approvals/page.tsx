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
  Plus,
  Search,
  GitBranch,
  MoreHorizontal,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  Users,
  FileCheck,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const workflows = [
  {
    id: "WF001",
    name: "Purchase Order Approval",
    module: "Purchases",
    trigger: "Amount > ₹50,000",
    steps: 2,
    isActive: true,
    pendingApprovals: 5,
  },
  {
    id: "WF002",
    name: "Payment Approval",
    module: "Banking",
    trigger: "All Payments",
    steps: 1,
    isActive: true,
    pendingApprovals: 3,
  },
  {
    id: "WF003",
    name: "Expense Claim Approval",
    module: "HR",
    trigger: "Amount > ₹5,000",
    steps: 2,
    isActive: true,
    pendingApprovals: 8,
  },
  {
    id: "WF004",
    name: "Voucher Approval",
    module: "Accounting",
    trigger: "Journal Entries",
    steps: 1,
    isActive: false,
    pendingApprovals: 0,
  },
  {
    id: "WF005",
    name: "Leave Request Approval",
    module: "HR",
    trigger: "All Leave Requests",
    steps: 1,
    isActive: true,
    pendingApprovals: 2,
  },
];

const pendingApprovals = [
  {
    id: "APR001",
    document: "PO-2024-045",
    type: "Purchase Order",
    requestedBy: "Rahul Sharma",
    amount: 125000,
    date: "2024-03-15",
    status: "PENDING",
    currentStep: "Manager Approval",
  },
  {
    id: "APR002",
    document: "PAY-2024-032",
    type: "Payment",
    requestedBy: "Priya Patel",
    amount: 85000,
    date: "2024-03-15",
    status: "PENDING",
    currentStep: "Finance Head Approval",
  },
  {
    id: "APR003",
    document: "EXP-2024-018",
    type: "Expense Claim",
    requestedBy: "Amit Kumar",
    amount: 12500,
    date: "2024-03-14",
    status: "PENDING",
    currentStep: "Manager Approval",
  },
  {
    id: "APR004",
    document: "LV-2024-089",
    type: "Leave Request",
    requestedBy: "Sneha Reddy",
    amount: null,
    date: "2024-03-14",
    status: "APPROVED",
    currentStep: "Completed",
  },
  {
    id: "APR005",
    document: "PO-2024-044",
    type: "Purchase Order",
    requestedBy: "Vikram Singh",
    amount: 250000,
    date: "2024-03-13",
    status: "REJECTED",
    currentStep: "Rejected by CFO",
  },
];

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
};

export default function ApprovalsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approval Workflows</h1>
          <p className="text-muted-foreground">
            Configure approval rules and manage pending approvals
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Workflow
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Approval Workflow</DialogTitle>
              <DialogDescription>
                Define a new approval workflow for documents
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Workflow Name</Label>
                <Input placeholder="e.g., High Value Purchase Approval" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Module</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select module" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchases">Purchases</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="accounting">Accounting</SelectItem>
                      <SelectItem value="banking">Banking</SelectItem>
                      <SelectItem value="hr">HR & Payroll</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="po">Purchase Order</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="voucher">Voucher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Trigger Condition</Label>
                <div className="flex gap-2">
                  <Select>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amount">Amount</SelectItem>
                      <SelectItem value="type">Type</SelectItem>
                      <SelectItem value="all">All Documents</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Operator" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gt">Greater than</SelectItem>
                      <SelectItem value="lt">Less than</SelectItem>
                      <SelectItem value="eq">Equals</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Value" className="flex-1" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Approval Steps</Label>
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                      <Badge>Step 1</Badge>
                      <Select>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select approver" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manager">Direct Manager</SelectItem>
                          <SelectItem value="dept_head">Department Head</SelectItem>
                          <SelectItem value="finance">Finance Head</SelectItem>
                          <SelectItem value="cfo">CFO</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button variant="outline" className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Step
                    </Button>
                  </CardContent>
                </Card>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="active" defaultChecked />
                <Label htmlFor="active">Activate workflow immediately</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsDialogOpen(false)}>Create Workflow</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">18</div>
            <p className="text-xs text-muted-foreground">Awaiting your action</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">Documents approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2</div>
            <p className="text-xs text-muted-foreground">This week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4</div>
            <p className="text-xs text-muted-foreground">Of 5 configured</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending Approvals
            <Badge variant="secondary" className="ml-2">18</Badge>
          </TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="history">Approval History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pending Approvals</CardTitle>
                  <CardDescription>
                    Documents awaiting your approval
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select defaultValue="all">
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="po">Purchase Orders</SelectItem>
                      <SelectItem value="payment">Payments</SelectItem>
                      <SelectItem value="expense">Expenses</SelectItem>
                      <SelectItem value="leave">Leave Requests</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Current Step</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovals.map((approval) => (
                    <TableRow key={approval.id}>
                      <TableCell className="font-medium">
                        <span className="text-blue-600 cursor-pointer hover:underline">
                          {approval.document}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{approval.type}</Badge>
                      </TableCell>
                      <TableCell>{approval.requestedBy}</TableCell>
                      <TableCell className="text-right">
                        {approval.amount
                          ? `₹${approval.amount.toLocaleString()}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {new Date(approval.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {approval.currentStep}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[approval.status]}>
                          {approval.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {approval.status === "PENDING" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-8 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-red-600">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Approval Workflows</CardTitle>
                  <CardDescription>
                    Configure approval rules for different document types
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow Name</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-center">Steps</TableHead>
                    <TableHead className="text-center">Pending</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflows.map((workflow) => (
                    <TableRow key={workflow.id}>
                      <TableCell className="font-medium">{workflow.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{workflow.module}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {workflow.trigger}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {Array.from({ length: workflow.steps }).map((_, i) => (
                            <div
                              key={i}
                              className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs"
                            >
                              {i + 1}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {workflow.pendingApprovals > 0 ? (
                          <Badge variant="secondary">
                            {workflow.pendingApprovals}
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            workflow.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {workflow.isActive ? "Active" : "Inactive"}
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
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              {workflow.isActive ? (
                                <>
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
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

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Approval History</CardTitle>
              <CardDescription>
                View all past approval decisions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <FileCheck className="mx-auto h-12 w-12 mb-4" />
                <p>Select a date range to view approval history</p>
                <div className="flex justify-center gap-2 mt-4">
                  <Input type="date" className="w-[150px]" />
                  <span className="self-center">to</span>
                  <Input type="date" className="w-[150px]" />
                  <Button>Search</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

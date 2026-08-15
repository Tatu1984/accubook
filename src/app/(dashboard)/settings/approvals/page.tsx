"use client";

import * as React from "react";
import { useState } from "react";
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
  DialogTrigger,
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
  GitBranch,
  MoreHorizontal,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  FileCheck,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";

/**
 * Workflows and the current user's queue, from the approvals endpoint.
 *
 * Both lists used to be hardcoded — invented workflows (WF001 "Purchase
 * Order Approval"), invented requests from invented colleagues, and four
 * tiles reading 18 / 12 / 2 / 4. An administrator checking what needed
 * their sign-off was shown someone else's fiction.
 */
interface Workflow {
  id: string;
  name: string;
  entityType: string;
  isActive: boolean;
  steps: { id: string; stepNumber: number; approverType: string; amountLimit?: string | null }[];
}

interface PendingApproval {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  amount?: string | null;
  status: string;
  stepNumber?: number | null;
  createdAt: string;
  requester?: { id: string; name: string | null; email: string } | null;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
};

export default function ApprovalsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [workflows, setWorkflows] = React.useState<Workflow[]>([]);
  const [pendingApprovals, setPendingApprovals] = React.useState<PendingApproval[]>([]);
  const [history, setHistory] = React.useState<PendingApproval[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const get = async (qs: string) => {
          const r = await fetch(`/api/organizations/${organizationId}/approvals?${qs}`, { signal: controller.signal });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to load approvals");
          return r.json();
        };
        const [wf, pend, hist] = await Promise.all([
          get("view=workflows&limit=100"),
          get("view=pending&limit=100"),
          get("view=history&limit=200"),
        ]);
        setWorkflows((wf.data ?? []) as Workflow[]);
        setPendingApprovals((pend.data ?? []) as PendingApproval[]);
        setHistory((hist.data ?? []) as PendingApproval[]);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [organizationId]);

  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const today = new Date().toDateString();
  const historyToday = {
    approved: history.filter((a) => a.status === "APPROVED" && new Date(a.createdAt).toDateString() === today).length,
    rejected: history.filter((a) => a.status === "REJECTED" && new Date(a.createdAt).toDateString() === today).length,
  };

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

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
            <div className="text-2xl font-bold">{pendingApprovals.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting your action</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{historyToday.approved}</div>
            <p className="text-xs text-muted-foreground">Documents approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{historyToday.rejected}</div>
            <p className="text-xs text-muted-foreground">This week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workflows.filter((w) => w.isActive).length}</div>
            <p className="text-xs text-muted-foreground">Of 5 configured</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending Approvals
            <Badge variant="secondary" className="ml-2">{pendingApprovals.length}</Badge>
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
                          {approval.entityLabel ?? approval.entityId}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{approval.entityType}</Badge>
                      </TableCell>
                      <TableCell>{approval.requester?.name ?? approval.requester?.email ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {approval.amount
                          ? `₹${Number(approval.amount).toLocaleString("en-IN")}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {new Date(approval.createdAt).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {approval.stepNumber ? `Step ${approval.stepNumber}` : "—"}
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
                        <Badge variant="outline">{workflow.entityType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {workflow.steps.find((st) => st.amountLimit)
                          ? `Above ₹${Number(workflow.steps.find((st) => st.amountLimit)!.amountLimit).toLocaleString("en-IN")}`
                          : "All documents"}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {workflow.steps.map((_, i) => (
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
                        {(() => {
                          const n = pendingApprovals.filter(
                            (a) => a.entityType === workflow.entityType
                          ).length;
                          return n > 0 ? <Badge variant="secondary">{n}</Badge> : "-";
                        })()}
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
                            <Button variant="ghost" size="icon" aria-label="Open actions menu">
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

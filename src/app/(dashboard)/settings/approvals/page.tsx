"use client";

import * as React from "react";
import { useState } from "react";
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
  steps: {
    id: string;
    stepNumber: number;
    approverType: string;
    approverId?: string | null;
    amountLimit?: string | null;
  }[];
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

  const loadApprovals = React.useCallback(async (signal?: AbortSignal) => {
    if (!organizationId) return;
    {
      setLoading(true);
      setError(null);
      try {
        const get = async (qs: string) => {
          const r = await fetch(`/api/organizations/${organizationId}/approvals?${qs}`, { signal });
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
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    loadApprovals(controller.signal);
    return () => controller.abort();
  }, [organizationId, loadApprovals]);

  const reload = React.useCallback(() => loadApprovals(), [loadApprovals]);

  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [deleteWorkflow, setDeleteWorkflow] = useState<Workflow | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyFilter, setHistoryFilter] = useState<{ from: string; to: string } | null>(
    null
  );
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);

  type StepForm = {
    approverType: "ROLE" | "USER" | "MANAGER";
    approverId: string;
    amountLimit: string;
    isRequired: boolean;
  };
  const emptyStep: StepForm = {
    approverType: "MANAGER",
    approverId: "",
    amountLimit: "",
    isRequired: true,
  };
  const [workflowForm, setWorkflowForm] = useState<{
    name: string;
    entityType: string;
    isActive: boolean;
    steps: StepForm[];
  }>({ name: "", entityType: "BILL", isActive: true, steps: [{ ...emptyStep }] });

  React.useEffect(() => {
    if (!organizationId) return;
    (async () => {
      try {
        const [rRes, uRes] = await Promise.all([
          fetch(`/api/organizations/${organizationId}/roles`),
          fetch(`/api/organizations/${organizationId}/users?limit=200`),
        ]);
        if (rRes.ok) {
          const body = await rRes.json();
          setRoles(
            ((body.data ?? []) as { id: string; name: string }[]).map((r) => ({
              id: r.id,
              name: r.name,
            }))
          );
        }
        if (uRes.ok) {
          const body = await uRes.json();
          type Row = { userId?: string; user?: { id?: string; name?: string | null; email?: string } };
          setMembers(
            ((body.data ?? []) as Row[]).map((ou) => ({
              id: String(ou.user?.id ?? ou.userId),
              name: String(ou.user?.name ?? ou.user?.email ?? "Unknown"),
            }))
          );
        }
      } catch {
        // Selects fall back to empty with an explanatory message.
      }
    })();
  }, [organizationId]);

  const openCreateWorkflow = () => {
    setEditingWorkflow(null);
    setWorkflowForm({
      name: "",
      entityType: "BILL",
      isActive: true,
      steps: [{ ...emptyStep }],
    });
    setIsDialogOpen(true);
  };

  const openEditWorkflow = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setWorkflowForm({
      name: workflow.name,
      entityType: workflow.entityType,
      isActive: workflow.isActive,
      steps:
        workflow.steps.length > 0
          ? [...workflow.steps]
              .sort((a, b) => a.stepNumber - b.stepNumber)
              .map((step) => ({
                approverType: (step.approverType as StepForm["approverType"]) ?? "MANAGER",
                approverId: step.approverId ?? "",
                amountLimit:
                  step.amountLimit != null ? String(step.amountLimit) : "",
                isRequired: true,
              }))
          : [{ ...emptyStep }],
    });
    setIsDialogOpen(true);
  };

  const updateStep = (index: number, patch: Partial<StepForm>) =>
    setWorkflowForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));

  const addStep = () =>
    setWorkflowForm((prev) => ({ ...prev, steps: [...prev.steps, { ...emptyStep }] }));

  const removeStep = (index: number) =>
    setWorkflowForm((prev) => ({
      ...prev,
      steps:
        prev.steps.length === 1
          ? prev.steps
          : prev.steps.filter((_, i) => i !== index),
    }));

  const handleSaveWorkflow = async () => {
    if (!organizationId) return;
    if (!workflowForm.name.trim()) return toast.error("A workflow name is required");

    for (const [index, step] of workflowForm.steps.entries()) {
      if (step.approverType !== "MANAGER" && !step.approverId) {
        return toast.error(`Step ${index + 1} needs an approver`);
      }
    }

    const payload = {
      name: workflowForm.name.trim(),
      entityType: workflowForm.entityType,
      isActive: workflowForm.isActive,
      steps: workflowForm.steps.map((step, index) => ({
        stepNumber: index + 1,
        approverType: step.approverType,
        approverId: step.approverType === "MANAGER" ? undefined : step.approverId,
        amountLimit: step.amountLimit ? Number(step.amountLimit) : undefined,
        isRequired: step.isRequired,
      })),
    };

    setSaving(true);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/approvals`, {
        method: editingWorkflow ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingWorkflow ? { workflowId: editingWorkflow.id, ...payload } : payload
        ),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to save workflow");
      toast.success(editingWorkflow ? "Workflow updated" : "Workflow created");
      setIsDialogOpen(false);
      setEditingWorkflow(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleWorkflow = async (workflow: Workflow) => {
    if (!organizationId) return;
    setBusyId(workflow.id);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/approvals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: workflow.id,
          isActive: !workflow.isActive,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to update workflow");
      toast.success(workflow.isActive ? "Workflow deactivated" : "Workflow activated");
      reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to update workflow");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!organizationId || !deleteWorkflow) return;
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/approvals?workflowId=${deleteWorkflow.id}`,
        { method: "DELETE" }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to delete workflow");
      toast.success("Workflow deleted");
      setDeleteWorkflow(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to delete workflow");
    }
  };

  const handleDecision = async (
    approval: PendingApproval,
    action: "APPROVE" | "REJECT"
  ) => {
    if (!organizationId) return;
    setBusyId(approval.id);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/approvals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: approval.id, action }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to record decision");
      toast.success(action === "APPROVE" ? "Approved" : "Rejected");
      reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to record decision");
    } finally {
      setBusyId(null);
    }
  };

  const filteredHistory = React.useMemo(() => {
    if (!historyFilter) return history;
    const from = historyFilter.from ? new Date(historyFilter.from) : null;
    const to = historyFilter.to ? new Date(historyFilter.to) : null;
    if (to) to.setHours(23, 59, 59, 999);
    return history.filter((h) => {
      const when = new Date(h.createdAt);
      if (from && when < from) return false;
      if (to && when > to) return false;
      return true;
    });
  }, [history, historyFilter]);

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
            <Button onClick={openCreateWorkflow}>
              <Plus className="mr-2 h-4 w-4" />
              New Workflow
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingWorkflow
                  ? `Edit ${editingWorkflow.name}`
                  : "Create Approval Workflow"}
              </DialogTitle>
              <DialogDescription>
                Route documents of a given type through an ordered list of
                approvers. A step with an amount limit only engages above that
                amount.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workflow-name">Workflow Name *</Label>
                <Input
                  id="workflow-name"
                  placeholder="e.g., High Value Purchase Approval"
                  value={workflowForm.name}
                  onChange={(e) =>
                    setWorkflowForm({ ...workflowForm, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Document Type *</Label>
                <Select
                  value={workflowForm.entityType}
                  onValueChange={(value) =>
                    setWorkflowForm({ ...workflowForm, entityType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BILL">Bill</SelectItem>
                    <SelectItem value="INVOICE">Invoice</SelectItem>
                    <SelectItem value="PURCHASE_ORDER">Purchase Order</SelectItem>
                    <SelectItem value="VOUCHER">Voucher</SelectItem>
                    <SelectItem value="EXPENSE_CLAIM">Expense Claim</SelectItem>
                    <SelectItem value="LEAVE">Leave</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Documents of this type are routed through the steps below.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Approval Steps</Label>
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    {workflowForm.steps.map((step, index) => (
                      <div
                        key={index}
                        className="flex flex-wrap items-center gap-2 p-2 bg-muted rounded-lg"
                      >
                        <Badge>Step {index + 1}</Badge>
                        <Select
                          value={step.approverType}
                          onValueChange={(value) =>
                            updateStep(index, {
                              approverType: value as "ROLE" | "USER" | "MANAGER",
                              approverId: "",
                            })
                          }
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MANAGER">Direct Manager</SelectItem>
                            <SelectItem value="ROLE">Anyone with role</SelectItem>
                            <SelectItem value="USER">Specific user</SelectItem>
                          </SelectContent>
                        </Select>
                        {step.approverType === "ROLE" && (
                          <Select
                            value={step.approverId}
                            onValueChange={(value) =>
                              updateStep(index, { approverId: value })
                            }
                          >
                            <SelectTrigger className="flex-1 min-w-[160px]">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>
                                  {role.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {step.approverType === "USER" && (
                          <Select
                            value={step.approverId}
                            onValueChange={(value) =>
                              updateStep(index, { approverId: value })
                            }
                          >
                            <SelectTrigger className="flex-1 min-w-[160px]">
                              <SelectValue placeholder="Select user" />
                            </SelectTrigger>
                            <SelectContent>
                              {members.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Input
                          className="w-[140px]"
                          type="number"
                          min="0"
                          placeholder="Amount limit"
                          value={step.amountLimit}
                          onChange={(e) =>
                            updateStep(index, { amountLimit: e.target.value })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove step ${index + 1}`}
                          disabled={workflowForm.steps.length === 1}
                          onClick={() => removeStep(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" className="w-full" onClick={addStep}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Step
                    </Button>
                  </CardContent>
                </Card>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={workflowForm.isActive}
                  onCheckedChange={(checked) =>
                    setWorkflowForm({ ...workflowForm, isActive: checked })
                  }
                />
                <Label htmlFor="active">Workflow is active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveWorkflow} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingWorkflow ? "Save Changes" : "Create Workflow"}
              </Button>
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
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-green-600"
                              aria-label="Approve"
                              disabled={busyId === approval.id}
                              onClick={() => handleDecision(approval, "APPROVE")}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-red-600"
                              aria-label="Reject"
                              disabled={busyId === approval.id}
                              onClick={() => handleDecision(approval, "REJECT")}
                            >
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
                            <DropdownMenuItem onClick={() => openEditWorkflow(workflow)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={busyId === workflow.id}
                              onClick={() => handleToggleWorkflow(workflow)}
                            >
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
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteWorkflow(workflow)}
                            >
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
            <CardContent className="space-y-4">
              <div className="text-center text-muted-foreground">
                <div className="flex justify-center gap-2">
                  <Input
                    type="date"
                    className="w-[150px]"
                    value={historyFrom}
                    onChange={(e) => setHistoryFrom(e.target.value)}
                  />
                  <span className="self-center">to</span>
                  <Input
                    type="date"
                    className="w-[150px]"
                    value={historyTo}
                    onChange={(e) => setHistoryTo(e.target.value)}
                  />
                  <Button
                    onClick={() => {
                      if (!historyFrom && !historyTo) {
                        setHistoryFilter(null);
                        toast.message("Showing all approval history");
                        return;
                      }
                      setHistoryFilter({ from: historyFrom, to: historyTo });
                    }}
                  >
                    Search
                  </Button>
                </div>
              </div>

              {/* The list itself was never rendered — only the empty-state text
                  and a dead search box, so decided approvals were unreachable. */}
              {filteredHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileCheck className="mx-auto h-12 w-12 mb-4" />
                  <p>No approval history in this range</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Decided</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.entityLabel ?? `${row.entityType} ${row.entityId.slice(0, 8)}`}
                        </TableCell>
                        <TableCell>
                          {row.requester?.name ?? row.requester?.email ?? "—"}
                        </TableCell>
                        <TableCell>{row.amount ?? "—"}</TableCell>
                        <TableCell>
                          {new Date(row.createdAt).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[row.status]}>
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={!!deleteWorkflow}
        onOpenChange={(open) => !open && setDeleteWorkflow(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteWorkflow?.name}&quot; and its steps? Documents
              of this type will stop being routed for approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorkflow}
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

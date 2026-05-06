"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
  FolderOpen,
  Folder,
  Loader2,
  Building2,
  Eye,
  Receipt,
} from "lucide-react";
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
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { ScrollArea } from "@/frontend/components/ui/scroll-area";
import { cn } from "@/shared/utils/common.util";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { toast } from "sonner";
import { downloadCsv } from "@/frontend/utils/export-csv";

interface CoaActions {
  onAddSubGroup: (parentId: string, parentNature: string) => void;
  onAddLedger: (groupId: string) => void;
  onEditGroup: (group: LedgerGroup) => void;
  onDeleteGroup: (group: LedgerGroup) => void;
  onDeleteLedger: (ledger: Ledger) => void;
}

interface LedgerGroup {
  id: string;
  name: string;
  nature: "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "EQUITY";
  parentId: string | null;
  isSystem?: boolean;
  children: LedgerGroup[];
  _count?: { ledgers: number };
}

interface Ledger {
  id: string;
  name: string;
  code: string | null;
  groupId: string;
  group: { name: string; nature: string };
  openingBalance: number;
  openingBalanceType: "DEBIT" | "CREDIT";
  currentBalance: number;
}

const natureColors = {
  ASSETS: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  LIABILITIES: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  INCOME: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  EXPENSES: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  EQUITY: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

function TreeItem({
  group,
  level = 0,
  ledgersByGroup,
  actions,
}: {
  group: LedgerGroup;
  level?: number;
  ledgersByGroup: Record<string, Ledger[]>;
  actions: CoaActions;
}) {
  const [isExpanded, setIsExpanded] = React.useState(level < 2);
  const groupLedgers = ledgersByGroup[group.id] || [];
  const hasChildren = group.children.length > 0 || groupLedgers.length > 0;

  const totalBalance = React.useMemo(() => {
    let total = 0;
    const calculateBalance = (g: LedgerGroup): number => {
      let balance = 0;
      const ledgers = ledgersByGroup[g.id] || [];
      ledgers.forEach((l) => {
        const amt = Number(l.currentBalance) || Number(l.openingBalance) || 0;
        balance += amt;
      });
      g.children.forEach((child) => {
        balance += calculateBalance(child);
      });
      return balance;
    };
    total = calculateBalance(group);
    return total;
  }, [group, ledgersByGroup]);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-3 hover:bg-muted/50 cursor-pointer rounded-md",
          level === 0 && "bg-muted/30"
        )}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        {hasChildren ? (
          <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <span className="w-5" />
        )}
        {hasChildren ? (
          isExpanded ? (
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground" />
          )
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground" />
        )}
        <span className={cn("flex-1 text-sm", level === 0 && "font-semibold")}>
          {group.name}
        </span>
        {level === 0 && (
          <Badge variant="secondary" className={cn("text-xs", natureColors[group.nature])}>
            {group.nature}
          </Badge>
        )}
        <span className="text-sm font-medium tabular-nums">
          {formatCurrency(totalBalance)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => actions.onAddSubGroup(group.id, group.nature)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Sub-Group
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onAddLedger(group.id)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Ledger
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => actions.onEditGroup(group)}
              disabled={group.isSystem}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {group.isSystem ? "Edit (system)" : "Edit"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onSelect={() => actions.onDeleteGroup(group)}
              disabled={group.isSystem}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && (
        <>
          {group.children.map((child) => (
            <TreeItem
              key={child.id}
              group={child}
              level={level + 1}
              ledgersByGroup={ledgersByGroup}
              actions={actions}
            />
          ))}
          {groupLedgers.map((ledger) => (
            <div
              key={ledger.id}
              className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 cursor-pointer rounded-md"
              style={{ paddingLeft: `${(level + 1) * 20 + 32}px` }}
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm">{ledger.name}</span>
              <span
                className={cn(
                  "text-sm font-medium tabular-nums",
                  ledger.openingBalanceType === "DEBIT" ? "text-blue-600" : "text-green-600"
                )}
              >
                {formatCurrency(Number(ledger.currentBalance) || Number(ledger.openingBalance) || 0)}{" "}
                {ledger.openingBalanceType === "DEBIT" ? "DR" : "CR"}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/ledgers?ledgerId=${ledger.id}`}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/ledgers?edit=${ledger.id}`}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/vouchers?ledgerId=${ledger.id}`}>
                      <Receipt className="mr-2 h-4 w-4" />
                      View Transactions
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onSelect={() => actions.onDeleteLedger(ledger)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

type GroupFormMode = "create" | "edit";

export default function ChartOfAccountsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [groups, setGroups] = React.useState<LedgerGroup[]>([]);
  const [ledgers, setLedgers] = React.useState<Ledger[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [groupMode, setGroupMode] = React.useState<GroupFormMode>("create");
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = React.useState<LedgerGroup | null>(null);
  const [deleteLedgerTarget, setDeleteLedgerTarget] = React.useState<Ledger | null>(null);

  const [formData, setFormData] = React.useState({
    name: "",
    nature: "",
    parentId: "",
  });

  const fetchGroups = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/ledger-groups`);
      if (!response.ok) throw new Error("Failed to fetch groups");
      const data = await response.json();
      setGroups(data);
    } catch (error) {
      console.error("Error fetching groups:", error);
      toast.error("Failed to fetch ledger groups");
    }
  }, [organizationId]);

  const fetchLedgers = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(`/api/organizations/${organizationId}/ledgers`);
      if (!response.ok) throw new Error("Failed to fetch ledgers");
      const data = await response.json();
      setLedgers(data);
    } catch (error) {
      console.error("Error fetching ledgers:", error);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      Promise.all([fetchGroups(), fetchLedgers()]).finally(() => setIsLoading(false));
    }
  }, [organizationId, fetchGroups, fetchLedgers]);

  const handleCreateGroup = async () => {
    if (!organizationId) return;
    if (!formData.name || !formData.nature) {
      toast.error("Name and nature are required");
      return;
    }

    setIsSubmitting(true);
    try {
      let response: Response;
      if (groupMode === "edit" && editingGroupId) {
        response = await fetch(
          `/api/organizations/${organizationId}/ledger-groups/${editingGroupId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: formData.name,
              nature: formData.nature,
              parentId: formData.parentId || null,
            }),
          }
        );
      } else {
        response = await fetch(`/api/organizations/${organizationId}/ledger-groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            nature: formData.nature,
            parentId: formData.parentId || undefined,
          }),
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save group");
      }

      toast.success(
        groupMode === "edit"
          ? "Ledger group updated"
          : "Ledger group created successfully"
      );
      setIsDialogOpen(false);
      setFormData({ name: "", nature: "", parentId: "" });
      setGroupMode("create");
      setEditingGroupId(null);
      fetchGroups();
    } catch (error) {
      console.error("Error saving group:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save group");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreateGroup = (parentId?: string, nature?: string) => {
    setGroupMode("create");
    setEditingGroupId(null);
    setFormData({
      name: "",
      nature: nature ?? "",
      parentId: parentId ?? "",
    });
    setIsDialogOpen(true);
  };

  const openEditGroup = (group: LedgerGroup) => {
    setGroupMode("edit");
    setEditingGroupId(group.id);
    setFormData({
      name: group.name,
      nature: group.nature,
      parentId: group.parentId ?? "",
    });
    setIsDialogOpen(true);
  };

  const performDeleteGroup = async () => {
    if (!organizationId || !deleteGroupTarget) return;
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/ledger-groups/${deleteGroupTarget.id}`,
        { method: "DELETE" }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to delete");
      toast.success(`Group "${deleteGroupTarget.name}" deleted`);
      fetchGroups();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete group");
    } finally {
      setDeleteGroupTarget(null);
    }
  };

  const performDeleteLedger = async () => {
    if (!organizationId || !deleteLedgerTarget) return;
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/ledgers/${deleteLedgerTarget.id}`,
        { method: "DELETE" }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to delete");
      toast.success(`Ledger "${deleteLedgerTarget.name}" deleted`);
      fetchLedgers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete ledger");
    } finally {
      setDeleteLedgerTarget(null);
    }
  };

  const treeActions: CoaActions = {
    onAddSubGroup: (parentId, nature) => openCreateGroup(parentId, nature),
    onAddLedger: (groupId) => {
      window.location.href = `/accounting/ledgers?groupId=${groupId}`;
    },
    onEditGroup: (group) => openEditGroup(group),
    onDeleteGroup: (group) => setDeleteGroupTarget(group),
    onDeleteLedger: (ledger) => setDeleteLedgerTarget(ledger),
  };

  const handleExport = () => {
    if (groups.length === 0 && ledgers.length === 0) {
      toast.info("Nothing to export");
      return;
    }
    const rows = [
      ...groups.map((g) => ({
        Type: "Group",
        Name: g.name,
        Nature: g.nature,
        Parent: g.parentId ?? "",
        Code: "",
        Balance: "",
      })),
      ...ledgers.map((l) => ({
        Type: "Ledger",
        Name: l.name,
        Nature: l.group?.nature ?? "",
        Parent: l.groupId,
        Code: l.code ?? "",
        Balance: String(l.currentBalance ?? l.openingBalance ?? 0),
      })),
    ];
    downloadCsv(`chart-of-accounts-${new Date().toISOString().slice(0, 10)}`, rows);
    toast.success(`Exported ${rows.length} rows`);
  };

  // Build hierarchy from flat list
  const groupTree = React.useMemo(() => {
    const groupMap = new Map<string, LedgerGroup>();
    groups.forEach((g) => {
      groupMap.set(g.id, { ...g, children: [] });
    });

    const roots: LedgerGroup[] = [];
    groupMap.forEach((group) => {
      if (group.parentId && groupMap.has(group.parentId)) {
        groupMap.get(group.parentId)!.children.push(group);
      } else if (!group.parentId) {
        roots.push(group);
      }
    });

    // Sort by nature order
    const natureOrder = ["ASSETS", "LIABILITIES", "INCOME", "EXPENSES", "EQUITY"];
    return roots.sort((a, b) => natureOrder.indexOf(a.nature) - natureOrder.indexOf(b.nature));
  }, [groups]);

  // Group ledgers by groupId
  const ledgersByGroup = React.useMemo(() => {
    const map: Record<string, Ledger[]> = {};
    ledgers.forEach((l) => {
      if (!map[l.groupId]) {
        map[l.groupId] = [];
      }
      map[l.groupId].push(l);
    });
    return map;
  }, [ledgers]);

  // Calculate totals
  const totals = React.useMemo(() => {
    const result = {
      ASSETS: 0,
      LIABILITIES: 0,
      INCOME: 0,
      EXPENSES: 0,
      EQUITY: 0,
    };

    ledgers.forEach((l) => {
      const nature = l.group?.nature as keyof typeof result;
      if (nature && result[nature] !== undefined) {
        result[nature] += Number(l.currentBalance) || Number(l.openingBalance) || 0;
      }
    });

    return result;
  }, [ledgers]);

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
          <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-muted-foreground">
            Manage your ledger groups and accounts hierarchy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <FileText className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(o) => {
              setIsDialogOpen(o);
              if (!o) {
                setGroupMode("create");
                setEditingGroupId(null);
                setFormData({ name: "", nature: "", parentId: "" });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => openCreateGroup()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {groupMode === "edit" ? "Edit Ledger Group" : "Create Ledger Group"}
                </DialogTitle>
                <DialogDescription>
                  {groupMode === "edit"
                    ? "Update name, nature, or parent."
                    : "Add a new ledger group to organize your accounts"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Group Name *</Label>
                  <Input
                    id="name"
                    placeholder="Enter group name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nature">Nature *</Label>
                  <Select
                    value={formData.nature}
                    onValueChange={(value) => setFormData({ ...formData, nature: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select nature" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASSETS">Assets</SelectItem>
                      <SelectItem value="LIABILITIES">Liabilities</SelectItem>
                      <SelectItem value="INCOME">Income</SelectItem>
                      <SelectItem value="EXPENSES">Expenses</SelectItem>
                      <SelectItem value="EQUITY">Equity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent">Parent Group</Label>
                  <Select
                    value={formData.parentId || "none"}
                    onValueChange={(value) =>
                      setFormData({ ...formData, parentId: value === "none" ? "" : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select parent group (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Parent (Primary Group)</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Button onClick={handleCreateGroup} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {groupMode === "edit" ? "Save Changes" : "Create Group"}
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
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(totals.ASSETS)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totals.LIABILITIES)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totals.INCOME)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(totals.EXPENSES)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Equity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(totals.EQUITY)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart of Accounts Tree */}
      <Card>
        <CardHeader>
          <CardTitle>Account Groups & Ledgers</CardTitle>
          <CardDescription>
            Click on groups to expand and view sub-groups and ledgers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groupTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No ledger groups found</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first ledger group
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Group
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-1">
                {groupTree.map((group) => (
                  <TreeItem
                    key={group.id}
                    group={group}
                    ledgersByGroup={ledgersByGroup}
                    actions={treeActions}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteGroupTarget}
        onOpenChange={(o) => !o && setDeleteGroupTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ledger group?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteGroupTarget &&
                `"${deleteGroupTarget.name}" will be permanently deleted. This fails if any ledgers or sub-groups still belong to it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performDeleteGroup}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteLedgerTarget}
        onOpenChange={(o) => !o && setDeleteLedgerTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ledger?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteLedgerTarget &&
                `"${deleteLedgerTarget.name}" will be permanently deleted. This fails if any vouchers reference this ledger.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={performDeleteLedger}
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

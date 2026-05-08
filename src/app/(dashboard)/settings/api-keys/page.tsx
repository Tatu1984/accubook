"use client";

import * as React from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  Clock,
  Eye,
  EyeOff,
  Calendar,
  ChevronDown,
  // Sidebar-mirror icons (must stay in sync with app-sidebar.tsx)
  LayoutDashboard,
  BookOpen,
  Package,
  ShoppingCart,
  Receipt,
  Calculator,
  Users,
  Landmark,
  BarChart3,
  Settings,
  FileText,
  CreditCard,
  Wallet,
  Building,
  User,
  Box,
  Truck,
  ClipboardList,
  PiggyBank,
  Scale,
  FileSpreadsheet,
  UserCheck,
  CheckSquare,
  Percent,
  Hammer,
  Repeat,
  Upload,
  Inbox,
  ScrollText,
  PlayCircle,
  Building2,
  type LucideIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/frontend/components/ui/collapsible";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Checkbox } from "@/frontend/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frontend/components/ui/table";
import { ScrollArea } from "@/frontend/components/ui/scroll-area";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { toast } from "sonner";
import { cn } from "@/shared/utils/common.util";

type Action = "read" | "write" | "delete";
const ALL_ACTIONS: Action[] = ["read", "write", "delete"];

/* --------------------------------------------------------------------- *
 * Sidebar-mirror scope tree                                             *
 * --------------------------------------------------------------------- *
 * Mirrors `app-sidebar.tsx` exactly (titles, icons, order, grouping)    *
 * so the API-key permission picker reads the same way the user already  *
 * navigates the app. Each row carries a `scopeKey` ("module:category")  *
 * that ties the checkbox to the canonical backend scope. Multiple rows  *
 * may share a key when several sidebar items hit the same backend       *
 * resource (e.g. Stock Summary / Movements / Adjustment all surface     *
 * the inventory:stock API surface). Toggling any one of them lights up  *
 * its siblings — that's an honest reflection of what the backend can    *
 * grant.                                                                *
 * --------------------------------------------------------------------- */

interface SidebarScopeItem {
  title: string;
  icon: LucideIcon;
  /** Canonical "module:category" key. Multiple items may share. */
  scopeKey: string;
  /** Optional second scope key for items that span two backend resources (e.g. TDS+TCS). */
  scopeKey2?: string;
  /** Note shown next to the row when multiple sidebar items share this key. */
  note?: string;
}

interface SidebarScopeSection {
  title: string;
  icon: LucideIcon;
  items: SidebarScopeItem[];
}

const SIDEBAR_SCOPE: SidebarScopeSection[] = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { title: "Dashboard", icon: LayoutDashboard, scopeKey: "reports:dashboard" },
    ],
  },
  {
    title: "Accounting",
    icon: BookOpen,
    items: [
      { title: "Chart of Accounts", icon: FileText,        scopeKey: "accounting:ledger-groups" },
      { title: "Ledgers",           icon: BookOpen,        scopeKey: "accounting:ledgers" },
      { title: "Vouchers",          icon: Receipt,         scopeKey: "accounting:vouchers" },
      { title: "Journal Entries",   icon: FileSpreadsheet, scopeKey: "accounting:vouchers", note: "shares Vouchers" },
      { title: "Cost Centers",      icon: Building,        scopeKey: "accounting:cost-centers" },
      { title: "Projects",          icon: ClipboardList,   scopeKey: "accounting:projects" },
    ],
  },
  {
    title: "Parties",
    icon: UserCheck,
    items: [
      { title: "Parties (Customers + Vendors)", icon: UserCheck, scopeKey: "parties:parties" },
    ],
  },
  {
    title: "Inventory",
    icon: Package,
    items: [
      { title: "Items",            icon: Box,           scopeKey: "inventory:items" },
      { title: "Categories",       icon: Package,       scopeKey: "inventory:categories" },
      { title: "Warehouses",       icon: Building,      scopeKey: "inventory:warehouses" },
      { title: "Stock Summary",    icon: ClipboardList, scopeKey: "inventory:stock" },
      { title: "Stock Movements",  icon: Truck,         scopeKey: "inventory:stock", note: "shares Stock Summary" },
      { title: "Stock Adjustment", icon: Scale,         scopeKey: "inventory:stock", note: "shares Stock Summary" },
    ],
  },
  {
    title: "Sales",
    icon: ShoppingCart,
    items: [
      { title: "Quotations",         icon: FileText,    scopeKey: "sales:quotations" },
      { title: "Sales Orders",       icon: ClipboardList, scopeKey: "sales:orders" },
      { title: "Invoices",           icon: Receipt,     scopeKey: "sales:invoices" },
      { title: "Recurring Invoices", icon: Repeat,      scopeKey: "sales:recurring" },
      { title: "Credit Notes",       icon: FileText,    scopeKey: "sales:invoices", note: "shares Invoices" },
      { title: "Receipts",           icon: CreditCard,  scopeKey: "sales:receipts" },
    ],
  },
  {
    title: "Purchases",
    icon: Truck,
    items: [
      { title: "Purchase Orders", icon: ClipboardList, scopeKey: "purchases:orders" },
      { title: "Bills",           icon: Receipt,       scopeKey: "purchases:bills" },
      { title: "Debit Notes",     icon: FileText,      scopeKey: "purchases:bills", note: "shares Bills" },
      { title: "Payments",        icon: Wallet,        scopeKey: "purchases:payments" },
    ],
  },
  {
    title: "Banking",
    icon: Landmark,
    items: [
      { title: "Bank Accounts",     icon: Landmark,    scopeKey: "banking:accounts" },
      { title: "Transactions",      icon: CreditCard,  scopeKey: "banking:accounts", note: "shares Bank Accounts" },
      { title: "Statement Import",  icon: Upload,      scopeKey: "banking:import" },
      { title: "Reconciliation",    icon: Scale,       scopeKey: "banking:reconciliation" },
      { title: "Cash Management",   icon: PiggyBank,   scopeKey: "banking:accounts", note: "shares Bank Accounts" },
    ],
  },
  {
    title: "Manufacturing",
    icon: Hammer,
    items: [
      { title: "Work Orders (+ BOMs)", icon: Hammer, scopeKey: "manufacturing:operations" },
    ],
  },
  {
    title: "Taxation",
    icon: Calculator,
    items: [
      { title: "Tax Configuration", icon: Percent,    scopeKey: "taxation:tax-config" },
      { title: "GST Returns",       icon: FileText,   scopeKey: "taxation:gst-returns" },
      { title: "GSTR-2B Reconcile", icon: Scale,      scopeKey: "taxation:gst-returns", note: "shares GST Returns" },
      { title: "TDS / TCS",         icon: Calculator, scopeKey: "taxation:tds", scopeKey2: "taxation:tcs" },
      { title: "Tax Reports",       icon: BarChart3,  scopeKey: "reports:reports", note: "covered by Reports" },
    ],
  },
  {
    title: "Payroll & HR",
    icon: Users,
    items: [
      { title: "Employees",        icon: User,         scopeKey: "hr:employees" },
      { title: "Departments",      icon: Building,     scopeKey: "hr:employees", note: "shares Employees" },
      { title: "Attendance",       icon: ClipboardList, scopeKey: "hr:attendance" },
      { title: "Leave Management", icon: FileText,     scopeKey: "hr:leaves" },
      { title: "Payroll",          icon: Wallet,       scopeKey: "hr:payroll" },
      { title: "Run Payroll",      icon: PlayCircle,   scopeKey: "hr:payroll", note: "shares Payroll" },
      { title: "Expense Claims",   icon: Receipt,      scopeKey: "hr:expense-claims" },
    ],
  },
  {
    title: "Reports",
    icon: BarChart3,
    items: [
      { title: "Financial Reports", icon: FileSpreadsheet, scopeKey: "reports:reports" },
      { title: "Profit & Loss",     icon: BarChart3,       scopeKey: "reports:reports", note: "shares Reports" },
      { title: "Balance Sheet",     icon: Scale,           scopeKey: "reports:reports", note: "shares Reports" },
      { title: "Cash Flow",         icon: PiggyBank,       scopeKey: "reports:reports", note: "shares Reports" },
      { title: "Trial Balance",     icon: BookOpen,        scopeKey: "reports:reports", note: "shares Reports" },
      { title: "Registers",         icon: ScrollText,      scopeKey: "reports:reports", note: "shares Reports" },
      { title: "Custom Reports",    icon: FileText,        scopeKey: "reports:reports", note: "shares Reports" },
    ],
  },
  {
    title: "Approvals",
    icon: Inbox,
    items: [
      { title: "Approvals inbox", icon: Inbox, scopeKey: "organization:approvals" },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    items: [
      { title: "Organization",       icon: Building2,   scopeKey: "organization:branches", note: "Settings → Organization shares Branches scope" },
      { title: "India Tax",          icon: Percent,     scopeKey: "organization:branches", note: "shares Organization" },
      { title: "Branches",           icon: Building,    scopeKey: "organization:branches" },
      { title: "Users & Roles",      icon: Users,       scopeKey: "organization:users", scopeKey2: "organization:roles" },
      { title: "Tax Configuration",  icon: Percent,     scopeKey: "taxation:tax-config", note: "covered by Taxation" },
      { title: "Approval Workflows", icon: CheckSquare, scopeKey: "organization:approvals", note: "shares Approvals inbox" },
      { title: "Tally Migration",    icon: Upload,      scopeKey: "organization:migration" },
      { title: "API Keys",           icon: KeyRound,    scopeKey: "organization:api-keys" },
      { title: "Audit Logs",         icon: ScrollText,  scopeKey: "organization:audit-logs" },
    ],
  },
];

function parseScopeKey(key: string): { module: string; category: string } {
  const [module, category] = key.split(":");
  return { module, category };
}

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: { module: string; category: string; actions: string[] }[];
  isActive: boolean;
  revokedAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string };
}

interface CreatedKey {
  id: string;
  name: string;
  token: string;
  keyPrefix: string;
  expiresAt: string | null;
  createdAt: string;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ApiKeysPage() {
  const { organizationId, isLoading: authLoading } = useOrganization();
  const [keys, setKeys] = React.useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<ApiKeyRow | null>(null);

  // Create form state
  const [name, setName] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [scopeMatrix, setScopeMatrix] = React.useState<Record<string, Record<string, Action[]>>>(
    {}
  );
  const [submitting, setSubmitting] = React.useState(false);

  // Newly-created key (shown ONCE)
  const [newKey, setNewKey] = React.useState<CreatedKey | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const fetchKeys = React.useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/api-keys`);
      if (!r.ok) throw new Error("Failed to load keys");
      const j = await r.json();
      setKeys(j.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) fetchKeys();
  }, [organizationId, fetchKeys]);

  function resetForm() {
    setName("");
    setExpiresAt("");
    setScopeMatrix({});
  }

  function toggleAction(module: string, category: string, action: Action) {
    setScopeMatrix((prev) => {
      const mod = { ...(prev[module] ?? {}) };
      const cur = mod[category] ?? [];
      const next = cur.includes(action)
        ? cur.filter((a) => a !== action)
        : [...cur, action];
      mod[category] = next;
      return { ...prev, [module]: mod };
    });
  }

  function isChecked(module: string, category: string, action: Action) {
    return scopeMatrix[module]?.[category]?.includes(action) ?? false;
  }

  /** Toggle an action across one or two scope keys (sidebar items can span). */
  function toggleSidebarItemAction(item: SidebarScopeItem, action: Action) {
    const keys = [item.scopeKey, item.scopeKey2].filter(Boolean) as string[];
    // Decide on/off based on the FIRST key — keep both keys in sync.
    const first = parseScopeKey(keys[0]);
    const willTurnOn = !isChecked(first.module, first.category, action);
    setScopeMatrix((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        const { module, category } = parseScopeKey(k);
        const mod = { ...(next[module] ?? {}) };
        const cur = mod[category] ?? [];
        if (willTurnOn) {
          mod[category] = cur.includes(action) ? cur : [...cur, action];
        } else {
          mod[category] = cur.filter((a) => a !== action);
        }
        next[module] = mod;
      }
      return next;
    });
  }

  function isSidebarItemChecked(item: SidebarScopeItem, action: Action): boolean {
    const { module, category } = parseScopeKey(item.scopeKey);
    return isChecked(module, category, action);
  }

  function setSectionAccess(
    section: SidebarScopeSection,
    mode: "read-only" | "full" | "clear"
  ) {
    setScopeMatrix((prev) => {
      const next = { ...prev };
      // Collect every unique scopeKey in this section (incl. scopeKey2).
      const keys = new Set<string>();
      for (const it of section.items) {
        keys.add(it.scopeKey);
        if (it.scopeKey2) keys.add(it.scopeKey2);
      }
      for (const k of keys) {
        const { module, category } = parseScopeKey(k);
        const mod = { ...(next[module] ?? {}) };
        if (mode === "clear") {
          delete mod[category];
        } else if (mode === "read-only") {
          mod[category] = ["read"];
        } else {
          mod[category] = [...ALL_ACTIONS];
        }
        next[module] = mod;
        if (Object.keys(mod).length === 0) delete next[module];
      }
      return next;
    });
  }

  function buildScopes() {
    const out: { module: string; category: string; actions: Action[] }[] = [];
    for (const [module, cats] of Object.entries(scopeMatrix)) {
      for (const [category, actions] of Object.entries(cats)) {
        if (actions.length > 0) out.push({ module, category, actions });
      }
    }
    return out;
  }

  async function handleCreate() {
    if (!organizationId) return;
    const scopes = buildScopes();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (scopes.length === 0) {
      toast.error("Select at least one scope");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name: name.trim(), scopes };
      if (expiresAt) {
        body.expiresAt = new Date(expiresAt + "T23:59:59.999Z").toISOString();
      }
      const r = await fetch(`/api/organizations/${organizationId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to create key");
      setCreateOpen(false);
      resetForm();
      setNewKey({
        id: j.id,
        name: j.name,
        token: j.token,
        keyPrefix: j.keyPrefix,
        expiresAt: j.expiresAt,
        createdAt: j.createdAt,
      });
      setRevealed(false);
      setCopied(false);
      fetchKeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke() {
    if (!organizationId || !revokeTarget) return;
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/api-keys/${revokeTarget.id}`,
        { method: "DELETE" }
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to revoke");
      toast.success(`Revoked "${revokeTarget.name}"`);
      fetchKeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke key");
    } finally {
      setRevokeTarget(null);
    }
  }

  async function copyToken() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.token);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select manually and Cmd+C");
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        No organization selected.
      </div>
    );
  }

  const activeKeys = keys.filter((k) => k.isActive).length;
  const revokedKeys = keys.filter((k) => !k.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">
            Connect external systems (e.g. your hospital ERP) to AccuBook with
            scoped, revocable bearer tokens.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          New API Key
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              Active keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeKeys}</div>
            <p className="text-xs text-muted-foreground">In use right now</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Revoked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revokedKeys}</div>
            <p className="text-xs text-muted-foreground">Kept for audit history</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-600" />
              How to use
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              Authorization: Bearer acb_live_…
            </code>
            <p className="text-xs text-muted-foreground mt-1">
              On any /api/organizations/[orgId]/* endpoint
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All keys</CardTitle>
          <CardDescription>
            Full tokens are shown once at creation. The 12-character prefix below
            identifies a key in audit logs and the last-used record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <KeyRound className="h-12 w-12 opacity-30 mb-3" />
              <p>No API keys yet.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => { resetForm(); setCreateOpen(true); }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create your first key
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>
                      <div className="font-medium">{k.name}</div>
                      <div className="text-xs text-muted-foreground">
                        by {k.createdBy.name || k.createdBy.email} ·{" "}
                        {formatDate(k.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        acb_live_{k.keyPrefix}…
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[280px]">
                        {k.scopes.slice(0, 4).map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {s.module}/{s.category}{" "}
                            <span className="text-muted-foreground ml-1">
                              {s.actions.join("·")}
                            </span>
                          </Badge>
                        ))}
                        {k.scopes.length > 4 && (
                          <Badge variant="outline" className="text-xs">
                            +{k.scopes.length - 4} more
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {k.lastUsedAt ? (
                        <div>
                          <div>{formatDate(k.lastUsedAt)}</div>
                          {k.lastUsedIp && (
                            <div className="text-xs text-muted-foreground">
                              {k.lastUsedIp}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {k.expiresAt ? formatDate(k.expiresAt) : "no expiry"}
                    </TableCell>
                    <TableCell>
                      {k.isActive ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                          Revoked
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {k.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Revoke key"
                          onClick={() => setRevokeTarget(k)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* CREATE DIALOG */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Create new API key</DialogTitle>
            <DialogDescription>
              Pick a name, the modules + categories the key should have access to,
              and which actions are allowed in each.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col flex-1 min-h-0 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-shrink-0">
              <div className="space-y-2">
                <Label htmlFor="key-name">Name *</Label>
                <Input
                  id="key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Hospital ERP integration"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="key-expiry">
                  <Calendar className="inline h-3 w-3 mr-1" />
                  Expires (optional)
                </Label>
                <Input
                  id="key-expiry"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm flex-shrink-0">
              <div className="font-medium mb-1 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Permissions — mirrors the sidebar
              </div>
              <p className="text-xs text-muted-foreground">
                Each section below maps to a sidebar group; each row maps to a
                sidebar item. Tick Read / Write / Delete to grant the API key
                that action on that resource. Rows tagged{" "}
                <span className="italic">&ldquo;shares X&rdquo;</span> hit the same backend
                resource as another row, so toggling one will light up its
                siblings &mdash; that&apos;s an honest reflection of what the
                backend can grant.
              </p>
            </div>

            <ScrollArea className="flex-1 min-h-0 -mr-3 pr-3">
              <div className="space-y-3 pb-2">
                {SIDEBAR_SCOPE.map((section) => {
                  const SectionIcon = section.icon;
                  return (
                    <Collapsible
                      key={section.title}
                      defaultOpen
                      className="border rounded-md bg-background"
                    >
                      <div className="flex items-center justify-between px-3 py-2 gap-2">
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-2 flex-1 text-left hover:bg-muted/40 rounded px-1 py-1 -mx-1"
                            aria-label={`Toggle ${section.title}`}
                          >
                            <SectionIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              {section.title}
                            </span>
                            <Badge variant="outline" className="text-[10px] ml-1">
                              {section.items.length} {section.items.length === 1 ? "item" : "items"}
                            </Badge>
                            <ChevronDown className="h-4 w-4 ml-auto transition-transform data-[state=closed]:-rotate-90" />
                          </button>
                        </CollapsibleTrigger>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setSectionAccess(section, "read-only")}
                          >
                            Read-only
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setSectionAccess(section, "full")}
                          >
                            Full
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setSectionAccess(section, "clear")}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <CollapsibleContent>
                        <div className="border-t">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead className="pl-8">Item</TableHead>
                                <TableHead className="text-center w-[70px]">Read</TableHead>
                                <TableHead className="text-center w-[70px]">Write</TableHead>
                                <TableHead className="text-center w-[70px]">Delete</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {section.items.map((item, idx) => {
                                const ItemIcon = item.icon;
                                return (
                                  <TableRow key={`${section.title}-${idx}`}>
                                    <TableCell className="pl-8">
                                      <div className="flex items-center gap-2">
                                        <ItemIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                        <span className="text-sm">{item.title}</span>
                                        {item.note && (
                                          <span className={cn(
                                            "text-[10px] italic text-muted-foreground",
                                            "px-1.5 py-0.5 rounded bg-muted/60"
                                          )}>
                                            {item.note}
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                    {ALL_ACTIONS.map((a) => (
                                      <TableCell key={a} className="text-center">
                                        <Checkbox
                                          checked={isSidebarItemChecked(item, a)}
                                          onCheckedChange={() =>
                                            toggleSidebarItemAction(item, a)
                                          }
                                          aria-label={`${section.title} ${item.title} ${a}`}
                                        />
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHOW-ONCE KEY REVEAL */}
      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              API key created
            </DialogTitle>
            <DialogDescription>
              <strong>{newKey?.name}</strong> is ready. Copy the token now — for
              security it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm dark:bg-yellow-950/20 dark:border-yellow-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-700 flex-shrink-0" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  This is the only time you&apos;ll see this key.
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">
                  Save it in your secrets manager (1Password, Vault, AWS Secrets
                  Manager, …) or wherever your hospital ERP reads its secrets
                  from. If lost, revoke this key and create a new one.
                </p>
              </div>
            </div>

            <div>
              <Label className="text-xs">Bearer token</Label>
              <div className="mt-1 flex items-center gap-2 rounded-md border bg-muted/30 p-3">
                <code className="flex-1 text-xs font-mono break-all">
                  {revealed ? newKey?.token : (newKey?.token || "").replace(/./g, "•")}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={revealed ? "Hide key" : "Reveal key"}
                  onClick={() => setRevealed((v) => !v)}
                >
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyToken}
                >
                  {copied ? (
                    <>
                      <Check className="mr-1 h-3 w-3" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" /> Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium mb-1">How to use</p>
              <p className="text-xs text-muted-foreground mb-2">
                Add this header to every request to{" "}
                <code className="bg-background px-1 rounded">
                  /api/organizations/{organizationId}/...
                </code>
              </p>
              <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
{`curl -H "Authorization: Bearer ${revealed ? newKey?.token : "acb_live_…"}" \\
     https://accubook.tensparrows.com/api/organizations/${organizationId}/invoices`}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REVOKE CONFIRM */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget &&
                `"${revokeTarget.name}" (acb_live_${revokeTarget.keyPrefix}…) will stop working immediately. Any external system using it will get a 401 on the next call. The row stays in the audit log; you cannot un-revoke.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-red-600 hover:bg-red-700"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

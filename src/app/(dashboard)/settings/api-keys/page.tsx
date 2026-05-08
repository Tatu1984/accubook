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
} from "lucide-react";
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
import { SCOPE_TREE } from "@/backend/utils/api-scope";

type Action = "read" | "write" | "delete";
const ALL_ACTIONS: Action[] = ["read", "write", "delete"];

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

  function selectAllForCategory(module: string, category: string) {
    setScopeMatrix((prev) => {
      const mod = { ...(prev[module] ?? {}) };
      const cur = mod[category] ?? [];
      mod[category] = cur.length === ALL_ACTIONS.length ? [] : [...ALL_ACTIONS];
      return { ...prev, [module]: mod };
    });
  }

  function selectReadOnlyForModule(moduleName: string) {
    const mod = SCOPE_TREE.find((m) => m.module === moduleName);
    if (!mod) return;
    setScopeMatrix((prev) => {
      const next = { ...prev };
      next[moduleName] = Object.fromEntries(
        mod.categories.map((c) => [c.category, ["read"] as Action[]])
      );
      return next;
    });
  }

  function selectAllForModule(moduleName: string) {
    const mod = SCOPE_TREE.find((m) => m.module === moduleName);
    if (!mod) return;
    setScopeMatrix((prev) => {
      const next = { ...prev };
      next[moduleName] = Object.fromEntries(
        mod.categories.map((c) => [c.category, [...ALL_ACTIONS] as Action[]])
      );
      return next;
    });
  }

  function clearModule(moduleName: string) {
    setScopeMatrix((prev) => {
      const next = { ...prev };
      delete next[moduleName];
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

          <div className="space-y-4 overflow-hidden flex flex-col">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium mb-1 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Scopes
              </div>
              <p className="text-xs text-muted-foreground">
                Tick the actions this key should have for each (module, category).
                Leave a row empty to deny that resource entirely. The key gets
                only what's checked — no implicit permissions.
              </p>
            </div>

            <ScrollArea className="flex-1 max-h-[400px] pr-3">
              <div className="space-y-4">
                {SCOPE_TREE.map((mod) => (
                  <Card key={mod.module}>
                    <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm">{mod.label}</CardTitle>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => selectReadOnlyForModule(mod.module)}
                        >
                          Read-only
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => selectAllForModule(mod.module)}
                        >
                          Full access
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => clearModule(mod.module)}
                        >
                          Clear
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40%]">Category</TableHead>
                            <TableHead className="text-center">Read</TableHead>
                            <TableHead className="text-center">Write</TableHead>
                            <TableHead className="text-center">Delete</TableHead>
                            <TableHead className="text-center w-[80px]">All</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mod.categories.map((c) => (
                            <TableRow key={c.category}>
                              <TableCell className="text-sm">{c.label}</TableCell>
                              {ALL_ACTIONS.map((a) => (
                                <TableCell key={a} className="text-center">
                                  <Checkbox
                                    checked={isChecked(mod.module, c.category, a)}
                                    onCheckedChange={() =>
                                      toggleAction(mod.module, c.category, a)
                                    }
                                    aria-label={`${mod.label} ${c.label} ${a}`}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() =>
                                    selectAllForCategory(mod.module, c.category)
                                  }
                                >
                                  Toggle
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
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
                  This is the only time you'll see this key.
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

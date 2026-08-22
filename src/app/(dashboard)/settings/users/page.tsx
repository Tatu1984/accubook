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
import { Checkbox } from "@/frontend/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import {
  Plus,
  Search,
  Users,
  Shield,
  MoreHorizontal,
  Edit,
  Trash2,
  Mail,
  Key,
  UserCog,
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
 * Members and roles come from the organization.
 *
 * This page used to render a hardcoded roster (USR001 "System
 * Administrator", invented colleagues, invented last-login times and MFA
 * flags) next to four hardcoded tiles reading 29 / 12 / 5 / 68%. None of
 * it reflected who could actually sign in, which is the one question an
 * administrator opens this page to answer.
 */
/** Rows as the users and roles endpoints return them. */
type OrgUserRow = {
  userId?: string;
  isActive?: boolean;
  createdAt?: string;
  user?: { id?: string; name?: string | null; email?: string; avatar?: string | null; lastLoginAt?: string | null };
  role?: { id?: string; name?: string };
};
type RoleRow = {
  id: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  userCount?: number;
  permissions?: unknown;
};

interface OrgMember {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  roleId: string;
  roleName: string;
  isActive: boolean;
  joinedAt?: string;
  lastLoginAt?: string;
}

interface OrgRole {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  userCount: number;
  /** Stored grants; either the current object form or a legacy string list. */
  permissions: unknown;
}

/** A short, readable summary of what a role grants. */
function permissionLabels(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) return [];
  return permissions.map((p) => {
    if (typeof p === "string") return p.replace(/_/g, " ");
    const g = p as { module?: string; category?: string; actions?: string[] };
    if (!g?.module) return "";
    const scope = g.module === "*" ? "Full Access" : g.category && g.category !== "*" ? `${g.module}/${g.category}` : g.module;
    return scope === "Full Access" ? scope : `${scope}: ${(g.actions ?? []).join(", ")}`;
  }).filter(Boolean);
}


const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  LOCKED: "bg-red-100 text-red-800",
};

const roleColors: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-800",
  MANAGER: "bg-blue-100 text-blue-800",
  ACCOUNTANT: "bg-green-100 text-green-800",
  SALES_REP: "bg-orange-100 text-orange-800",
  VIEWER: "bg-gray-100 text-gray-800",
};

export default function UsersPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [users, setUsers] = React.useState<OrgMember[]>([]);
  const [roles, setRoles] = React.useState<OrgRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadUsersAndRoles = React.useCallback(async (signal?: AbortSignal) => {
    if (!organizationId) return;
    {
      setLoading(true);
      setError(null);
      try {
        const get = async (path: string) => {
          const r = await fetch(`/api/organizations/${organizationId}/${path}`, { signal });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed to load ${path}`);
          return r.json();
        };
        const [uRes, rRes] = await Promise.all([get("users?limit=200"), get("roles?includeUserCount=true")]);
        const rows = (uRes.data ?? []) as OrgUserRow[];
        setUsers(rows.map((ou) => ({
          id: String(ou.user?.id ?? ou.userId),
          name: String(ou.user?.name ?? ou.user?.email ?? "Unknown"),
          email: String(ou.user?.email ?? ""),
          avatar: ou.user?.avatar ?? null,
          roleId: String(ou.role?.id ?? ""),
          roleName: String(ou.role?.name ?? "—"),
          isActive: Boolean(ou.isActive),
          joinedAt: ou.createdAt ? String(ou.createdAt) : undefined,
          lastLoginAt: ou.user?.lastLoginAt ? String(ou.user.lastLoginAt) : undefined,
        })));
        const roleRows = (Array.isArray(rRes) ? rRes : rRes.data ?? []) as RoleRow[];
        setRoles(roleRows.map((r) => ({
          id: String(r.id),
          name: String(r.name),
          description: r.description ? String(r.description) : undefined,
          isSystem: Boolean(r.isSystem),
          userCount: Number(r.userCount ?? 0),
          permissions: r.permissions,
        })));
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
    loadUsersAndRoles(controller.signal);
    return () => controller.abort();
  }, [organizationId, loadUsersAndRoles]);

  const reload = React.useCallback(() => loadUsersAndRoles(), [loadUsersAndRoles]);

  const activeCount = users.filter((u) => u.isActive).length;

  const [searchTerm, setSearchTerm] = useState("");
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    roleId: "",
  });

  const [accessUser, setAccessUser] = useState<OrgMember | null>(null);
  const [accessForm, setAccessForm] = useState({ roleId: "", isActive: true });
  const [resetUser, setResetUser] = useState<OrgMember | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<OrgMember | null>(null);

  const [editingRole, setEditingRole] = useState<OrgRole | null>(null);
  const [deleteRole, setDeleteRole] = useState<OrgRole | null>(null);
  const [roleForm, setRoleForm] = useState<{
    name: string;
    description: string;
    grants: Record<string, string[]>;
  }>({ name: "", description: "", grants: {} });
  const [scopeTree, setScopeTree] = useState<
    { module: string; label: string; categories: { category: string; label: string }[] }[]
  >([]);
  const [availableActions, setAvailableActions] = useState<string[]>([
    "read",
    "write",
    "delete",
    "approve",
    "export",
  ]);

  React.useEffect(() => {
    if (!organizationId) return;
    fetch(`/api/organizations/${organizationId}/roles`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body) return;
        if (Array.isArray(body.availablePermissions))
          setScopeTree(body.availablePermissions);
        if (Array.isArray(body.availableActions))
          setAvailableActions(body.availableActions);
      })
      .catch(() => undefined);
  }, [organizationId]);

  const handleInvite = async () => {
    if (!organizationId) return;
    const name = [inviteForm.firstName, inviteForm.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!name) return toast.error("A name is required");
    if (!inviteForm.email) return toast.error("An email address is required");
    if (!inviteForm.roleId) return toast.error("Select a role");

    setSaving(true);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: inviteForm.email,
          roleId: inviteForm.roleId,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to invite user");
      toast.success(`${name} added to the organization`);
      setIsUserDialogOpen(false);
      setInviteForm({ firstName: "", lastName: "", email: "", roleId: "" });
      reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to invite user");
    } finally {
      setSaving(false);
    }
  };

  const openAccessDialog = (member: OrgMember) => {
    setAccessUser(member);
    setAccessForm({ roleId: member.roleId, isActive: member.isActive });
  };

  const handleSaveAccess = async () => {
    if (!organizationId || !accessUser) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: accessUser.id,
          roleId: accessForm.roleId,
          isActive: accessForm.isActive,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to update user");
      toast.success(`${accessUser.name} updated`);
      setAccessUser(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!organizationId || !resetUser) return;
    setBusyUserId(resetUser.id);
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/users/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: resetUser.id }),
        }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to reset password");

      if (body.delivered) {
        toast.success(`A temporary password was emailed to ${body.email}`);
      } else {
        toast.success(
          `Password reset. No email provider is configured — temporary password: ${body.temporaryPassword}`,
          { duration: 30000 }
        );
      }
      setResetUser(null);
    } catch (e) {
      toast.error((e as Error).message || "Failed to reset password");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeactivate = async () => {
    if (!organizationId || !deactivateUser) return;
    setBusyUserId(deactivateUser.id);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: deactivateUser.id,
          isActive: !deactivateUser.isActive,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to update user");
      toast.success(
        deactivateUser.isActive
          ? `${deactivateUser.name} deactivated`
          : `${deactivateUser.name} reactivated`
      );
      setDeactivateUser(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to update user");
    } finally {
      setBusyUserId(null);
    }
  };

  /** Stored grants are `{module, category, actions}` objects; the editor keys them by "module/category". */
  const grantsToForm = (permissions: unknown): Record<string, string[]> => {
    if (!Array.isArray(permissions)) return {};
    const out: Record<string, string[]> = {};
    for (const p of permissions) {
      if (typeof p !== "object" || p === null) continue;
      const g = p as { module?: string; category?: string; actions?: string[] };
      if (!g.module) continue;
      out[`${g.module}/${g.category ?? "*"}`] = g.actions ?? [];
    }
    return out;
  };

  const formToGrants = (grants: Record<string, string[]>) =>
    Object.entries(grants)
      .filter(([, actions]) => actions.length > 0)
      .map(([key, actions]) => {
        const [module, category] = key.split("/");
        return { module, category, actions };
      });

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm({ name: "", description: "", grants: {} });
    setIsRoleDialogOpen(true);
  };

  const openEditRole = (role: OrgRole) => {
    if (role.isSystem) {
      toast.error("System roles cannot be edited");
      return;
    }
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description ?? "",
      grants: grantsToForm(role.permissions),
    });
    setIsRoleDialogOpen(true);
  };

  const toggleGrant = (key: string, action: string, checked: boolean) => {
    setRoleForm((prev) => {
      const current = prev.grants[key] ?? [];
      const next = checked
        ? [...new Set([...current, action])]
        : current.filter((a) => a !== action);
      return { ...prev, grants: { ...prev.grants, [key]: next } };
    });
  };

  const handleSaveRole = async () => {
    if (!organizationId) return;
    if (!roleForm.name.trim()) return toast.error("A role name is required");
    const permissions = formToGrants(roleForm.grants);
    if (permissions.length === 0)
      return toast.error("Grant the role at least one permission");

    setSaving(true);
    try {
      const r = await fetch(`/api/organizations/${organizationId}/roles`, {
        method: editingRole ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingRole ? { roleId: editingRole.id } : {}),
          name: roleForm.name.trim(),
          description: roleForm.description || undefined,
          permissions,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to save role");
      toast.success(editingRole ? "Role updated" : "Role created");
      setIsRoleDialogOpen(false);
      setEditingRole(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!organizationId || !deleteRole) return;
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/roles?roleId=${deleteRole.id}`,
        { method: "DELETE" }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to delete role");
      toast.success(`Role "${deleteRole.name}" deleted`);
      setDeleteRole(null);
      reload();
    } catch (e) {
      toast.error((e as Error).message || "Failed to delete role");
    }
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
          <h1 className="text-3xl font-bold tracking-tight">Users & Roles</h1>
          <p className="text-muted-foreground">
            Manage user accounts and access permissions
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">In this organization</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <div className="h-2 w-2 rounded-full bg-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground">
              {users.length - activeCount} deactivated
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roles.length}</div>
            <p className="text-xs text-muted-foreground">
              {roles.filter((r) => r.isSystem).length} system,{" "}
              {roles.filter((r) => !r.isSystem).length} custom
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Signed in before</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.lastLoginAt).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {users.filter((u) => !u.lastLoginAt).length} have never signed in
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>User Accounts</CardTitle>
                  <CardDescription>
                    Manage user access to the platform
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      className="pl-8 w-[250px]"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Invite User
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invite New User</DialogTitle>
                        <DialogDescription>
                          Send an invitation to add a new user
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="invite-first">First Name *</Label>
                            <Input
                              id="invite-first"
                              placeholder="John"
                              value={inviteForm.firstName}
                              onChange={(e) =>
                                setInviteForm({ ...inviteForm, firstName: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="invite-last">Last Name</Label>
                            <Input
                              id="invite-last"
                              placeholder="Doe"
                              value={inviteForm.lastName}
                              onChange={(e) =>
                                setInviteForm({ ...inviteForm, lastName: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="invite-email">Email Address *</Label>
                          <Input
                            id="invite-email"
                            type="email"
                            placeholder="john@company.com"
                            value={inviteForm.email}
                            onChange={(e) =>
                              setInviteForm({ ...inviteForm, email: e.target.value })
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Role *</Label>
                            <Select
                              value={inviteForm.roleId}
                              onValueChange={(value) =>
                                setInviteForm({ ...inviteForm, roleId: value })
                              }
                            >
                              <SelectTrigger>
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
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          The user is created with a random temporary password.
                          Use Reset Password from their row menu to email them a
                          fresh one once the email provider is configured.
                        </p>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleInvite} disabled={saving}>
                          {saving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="mr-2 h-4 w-4" />
                          )}
                          Send Invitation
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No members yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar ?? undefined} />
                            <AvatarFallback>
                              {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{user.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={roleColors[user.roleName] ?? "bg-gray-100 text-gray-800"}>
                          {user.roleName}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString("en-IN", {
                              day: "2-digit", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        <Badge className={user.isActive ? statusColors.ACTIVE : statusColors.INACTIVE}>
                          {user.isActive ? "ACTIVE" : "INACTIVE"}
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
                            <DropdownMenuItem onClick={() => openAccessDialog(user)}>
                              <UserCog className="mr-2 h-4 w-4" />
                              Change Role &amp; Access
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={busyUserId === user.id}
                              onClick={() => setResetUser(user)}
                            >
                              <Key className="mr-2 h-4 w-4" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              disabled={busyUserId === user.id}
                              onClick={() => setDeactivateUser(user)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {user.isActive ? "Deactivate" : "Reactivate"}
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

        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Roles & Permissions</CardTitle>
                  <CardDescription>
                    Define access levels and permissions for each role
                  </CardDescription>
                </div>
                <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={openCreateRole}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Role
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>
                        {editingRole ? `Edit ${editingRole.name}` : "Create New Role"}
                      </DialogTitle>
                      <DialogDescription>
                        Grant permissions per module and category. These are the
                        same scopes the API enforces on every request.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="role-name">Role Name *</Label>
                          <Input
                            id="role-name"
                            placeholder="e.g., Inventory Manager"
                            value={roleForm.name}
                            onChange={(e) =>
                              setRoleForm({ ...roleForm, name: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="role-description">Description</Label>
                          <Input
                            id="role-description"
                            placeholder="Brief description"
                            value={roleForm.description}
                            onChange={(e) =>
                              setRoleForm({ ...roleForm, description: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Permissions</Label>
                        <div className="border rounded-lg divide-y max-h-[300px] overflow-auto">
                          {scopeTree.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground">
                              Loading the permission vocabulary…
                            </div>
                          ) : (
                            scopeTree.map((group) => (
                              <div key={group.module} className="p-3 space-y-3">
                                <div className="font-medium">{group.label}</div>
                                {group.categories.map((category) => {
                                  const key = `${group.module}/${category.category}`;
                                  const selected = roleForm.grants[key] ?? [];
                                  return (
                                    <div key={key} className="pl-2">
                                      <div className="text-sm text-muted-foreground mb-1">
                                        {category.label}
                                      </div>
                                      <div className="flex flex-wrap gap-3">
                                        {availableActions.map((action) => (
                                          <div
                                            key={action}
                                            className="flex items-center space-x-2"
                                          >
                                            <Checkbox
                                              id={`${key}-${action}`}
                                              checked={selected.includes(action)}
                                              onCheckedChange={(checked) =>
                                                toggleGrant(key, action, !!checked)
                                              }
                                            />
                                            <Label
                                              htmlFor={`${key}-${action}`}
                                              className="text-sm capitalize"
                                            >
                                              {action}
                                            </Label>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveRole} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingRole ? "Save Changes" : "Create Role"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {roles.map((role) => (
                  <Card key={role.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{role.name}</CardTitle>
                        {role.isSystem && (
                          <Badge variant="secondary" className="text-xs">
                            System
                          </Badge>
                        )}
                      </div>
                      <CardDescription>{role.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Users</span>
                        <span className="font-medium">{role.userCount}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {permissionLabels(role.permissions).slice(0, 3).map((perm) => (
                          <Badge key={perm} variant="outline" className="text-xs">
                            {perm}
                          </Badge>
                        ))}
                        {permissionLabels(role.permissions).length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{permissionLabels(role.permissions).length - 3} more
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={role.isSystem}
                          onClick={() => openEditRole(role)}
                        >
                          <Edit className="mr-2 h-3 w-3" />
                          {role.isSystem ? "System role" : "Edit"}
                        </Button>
                        {!role.isSystem && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600"
                            aria-label={`Delete role ${role.name}`}
                            onClick={() => setDeleteRole(role)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!accessUser} onOpenChange={(open) => !open && setAccessUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role &amp; Access</DialogTitle>
            <DialogDescription>
              {accessUser?.name} ({accessUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={accessForm.roleId}
                onValueChange={(value) =>
                  setAccessForm({ ...accessForm, roleId: value })
                }
              >
                <SelectTrigger>
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
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="access-active"
                checked={accessForm.isActive}
                onCheckedChange={(checked) =>
                  setAccessForm({ ...accessForm, isActive: checked })
                }
              />
              <Label htmlFor="access-active">Active member</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAccessUser(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveAccess} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Issue a new temporary password for {resetUser?.name} and sign out
              every session they currently hold. The credential is emailed to
              them when an email provider is configured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword}>
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deactivateUser}
        onOpenChange={(open) => !open && setDeactivateUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deactivateUser?.isActive ? "Deactivate" : "Reactivate"} user
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateUser?.isActive
                ? `${deactivateUser?.name} will lose access to this organization immediately.`
                : `${deactivateUser?.name} will regain access to this organization.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className={deactivateUser?.isActive ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {deactivateUser?.isActive ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteRole} onOpenChange={(open) => !open && setDeleteRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the role &quot;{deleteRole?.name}&quot;? Users still holding
              it must be reassigned first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
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

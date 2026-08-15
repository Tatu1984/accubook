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

const modules = [
  { id: "dashboard", name: "Dashboard", actions: ["view"] },
  { id: "accounting", name: "Accounting", actions: ["view", "create", "edit", "delete", "approve"] },
  { id: "inventory", name: "Inventory", actions: ["view", "create", "edit", "delete"] },
  { id: "sales", name: "Sales", actions: ["view", "create", "edit", "delete", "approve"] },
  { id: "purchases", name: "Purchases", actions: ["view", "create", "edit", "delete", "approve"] },
  { id: "banking", name: "Banking", actions: ["view", "create", "edit", "reconcile"] },
  { id: "hr", name: "HR & Payroll", actions: ["view", "create", "edit", "delete", "approve"] },
  { id: "reports", name: "Reports", actions: ["view", "export"] },
  { id: "settings", name: "Settings", actions: ["view", "edit"] },
];

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

  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const get = async (path: string) => {
          const r = await fetch(`/api/organizations/${organizationId}/${path}`, { signal: controller.signal });
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
    })();
    return () => controller.abort();
  }, [organizationId]);

  const activeCount = users.filter((u) => u.isActive).length;

  const [searchTerm, setSearchTerm] = useState("");
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);

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
                            <Label>First Name</Label>
                            <Input placeholder="John" />
                          </div>
                          <div className="space-y-2">
                            <Label>Last Name</Label>
                            <Input placeholder="Doe" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Email Address</Label>
                          <Input type="email" placeholder="john@company.com" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Role</Label>
                            <Select>
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
                          <div className="space-y-2">
                            <Label>Department</Label>
                            <Select>
                              <SelectTrigger>
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="finance">Finance</SelectItem>
                                <SelectItem value="sales">Sales</SelectItem>
                                <SelectItem value="hr">HR</SelectItem>
                                <SelectItem value="it">IT</SelectItem>
                                <SelectItem value="operations">Operations</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch id="require-mfa" />
                          <Label htmlFor="require-mfa">Require MFA on first login</Label>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={() => setIsUserDialogOpen(false)}>
                          <Mail className="mr-2 h-4 w-4" />
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
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <UserCog className="mr-2 h-4 w-4" />
                              Change Role
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Key className="mr-2 h-4 w-4" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Deactivate
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
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Role
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Create New Role</DialogTitle>
                      <DialogDescription>
                        Define a new role with specific permissions
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Role Name</Label>
                          <Input placeholder="e.g., Inventory Manager" />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input placeholder="Brief description" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Permissions</Label>
                        <div className="border rounded-lg divide-y max-h-[300px] overflow-auto">
                          {modules.map((module) => (
                            <div key={module.id} className="p-3">
                              <div className="font-medium mb-2">{module.name}</div>
                              <div className="flex flex-wrap gap-3">
                                {module.actions.map((action) => (
                                  <div key={action} className="flex items-center space-x-2">
                                    <Checkbox id={`${module.id}-${action}`} />
                                    <Label
                                      htmlFor={`${module.id}-${action}`}
                                      className="text-sm capitalize"
                                    >
                                      {action}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => setIsRoleDialogOpen(false)}>Create Role</Button>
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
                        <Button variant="outline" size="sm" className="flex-1">
                          <Edit className="mr-2 h-3 w-3" />
                          Edit
                        </Button>
                        {!role.isSystem && (
                          <Button variant="outline" size="sm" className="text-red-600">
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
    </div>
  );
}

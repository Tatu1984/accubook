"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  Download,
  Clock,
  FileText,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  Eye,
  Loader2,
  AlertCircle,
  BookCheck,
  Undo2,
  PackageMinus,
  CheckCircle2,
} from "lucide-react";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { Label } from "@/frontend/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/frontend/components/ui/dialog";
import { DataTable } from "@/frontend/components/ui/data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import { ScrollArea } from "@/frontend/components/ui/scroll-area";
import { cn } from "@/shared/utils/common.util";

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

/**
 * Shape returned by GET /api/organizations/[orgId]/audit-logs, which nests
 * the actor. The table above wants it flat.
 */
interface AuditLogResponse {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: { id: string; name: string | null; email: string; avatar?: string | null } | null;
}

function toAuditLog(row: AuditLogResponse): AuditLog {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name || row.user?.email || "Unknown user",
    userEmail: row.user?.email || "",
    userAvatar: row.user?.avatar ?? undefined,
    action: row.action as AuditLog["action"],
    entityType: row.entityType,
    entityId: row.entityId ?? undefined,
    oldData: row.oldData ?? undefined,
    newData: row.newData ?? undefined,
    ipAddress: row.ipAddress ?? undefined,
    userAgent: row.userAgent ?? undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Must cover every member of `AuditAction` in backend/utils/audit.ts. The
 * ledger-side actions were missing while this page rendered mock rows that
 * never contained them — on real data the `POST` entries already in the log
 * resolved to `undefined` here and crashed the table on `config.icon`.
 */
const actionConfig: Record<string, { color: string; icon: typeof Plus }> = {
  CREATE: { color: "bg-green-100 text-green-800", icon: Plus },
  UPDATE: { color: "bg-blue-100 text-blue-800", icon: Pencil },
  DELETE: { color: "bg-red-100 text-red-800", icon: Trash2 },
  LOGIN: { color: "bg-purple-100 text-purple-800", icon: LogIn },
  LOGOUT: { color: "bg-gray-100 text-gray-800", icon: LogOut },
  EXPORT: { color: "bg-orange-100 text-orange-800", icon: Download },
  VIEW: { color: "bg-cyan-100 text-cyan-800", icon: Eye },
  POST: { color: "bg-emerald-100 text-emerald-800", icon: BookCheck },
  REVERSE: { color: "bg-amber-100 text-amber-800", icon: Undo2 },
  ISSUE: { color: "bg-indigo-100 text-indigo-800", icon: PackageMinus },
  COMPLETE: { color: "bg-teal-100 text-teal-800", icon: CheckCircle2 },
};

/** Anything a future release starts writing still renders, just plainly. */
const UNKNOWN_ACTION = { color: "bg-slate-100 text-slate-800", icon: FileText };

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function DataChangeViewer({ oldData, newData }: { oldData?: Record<string, unknown>; newData?: Record<string, unknown> }) {
  if (!oldData && !newData) return <span className="text-muted-foreground">No data changes</span>;

  const allKeys = new Set([
    ...(oldData ? Object.keys(oldData) : []),
    ...(newData ? Object.keys(newData) : []),
  ]);

  return (
    <div className="space-y-2">
      {Array.from(allKeys).map((key) => {
        const oldValue = oldData?.[key];
        const newValue = newData?.[key];
        const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);

        return (
          <div key={key} className="grid grid-cols-3 gap-2 text-sm">
            <span className="font-medium">{key}</span>
            <span className={cn("text-muted-foreground", changed && oldValue !== undefined && "line-through text-red-600")}>
              {oldValue !== undefined ? JSON.stringify(oldValue) : "-"}
            </span>
            <span className={cn(changed && newValue !== undefined ? "text-green-600 font-medium" : "")}>
              {newValue !== undefined ? JSON.stringify(newValue) : "-"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const columns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Timestamp
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-muted-foreground" />
        {formatDateTime(row.getValue("createdAt"))}
      </div>
    ),
  },
  {
    accessorKey: "userName",
    header: "User",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={row.original.userAvatar} />
          <AvatarFallback className="text-xs">
            {getInitials(row.getValue("userName"))}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.getValue("userName")}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.userEmail}
          </span>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => {
      const action = row.getValue("action") as string;
      const config = actionConfig[action] ?? UNKNOWN_ACTION;
      const Icon = config.icon;
      return (
        <Badge variant="secondary" className={cn("text-xs gap-1", config.color)}>
          <Icon className="h-3 w-3" />
          {action}
        </Badge>
      );
    },
  },
  {
    accessorKey: "entityType",
    header: "Entity",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium">{row.getValue("entityType")}</span>
        {row.original.entityId && (
          <span className="text-xs text-muted-foreground">
            {row.original.entityId}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "ipAddress",
    header: "IP Address",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground font-mono">
        {row.getValue("ipAddress") || "-"}
      </span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const log = row.original;
      return (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Eye className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Audit Log Details</DialogTitle>
              <DialogDescription>
                Full details of the audit log entry
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Timestamp</Label>
                    <p className="font-medium">{formatDateTime(log.createdAt)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Action</Label>
                    <p className="font-medium">{log.action}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">User</Label>
                    <p className="font-medium">{log.userName}</p>
                    <p className="text-sm text-muted-foreground">{log.userEmail}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">IP Address</Label>
                    <p className="font-medium font-mono">{log.ipAddress || "N/A"}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Entity</Label>
                  <p className="font-medium">{log.entityType}</p>
                  {log.entityId && (
                    <p className="text-sm text-muted-foreground">{log.entityId}</p>
                  )}
                </div>
                {(log.oldData || log.newData) && (
                  <div>
                    <Label className="text-muted-foreground mb-2 block">Data Changes</Label>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="grid grid-cols-3 gap-2 text-xs font-medium mb-2 text-muted-foreground">
                        <span>Field</span>
                        <span>Old Value</span>
                        <span>New Value</span>
                      </div>
                      <DataChangeViewer oldData={log.oldData} newData={log.newData} />
                    </div>
                  </div>
                )}
                {log.userAgent && (
                  <div>
                    <Label className="text-muted-foreground">User Agent</Label>
                    <p className="text-sm text-muted-foreground break-all">
                      {log.userAgent}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      );
    },
  },
];

export default function AuditLogsPage() {
  const { organizationId, isLoading: authLoading } = useOrganization();
  const [actionFilter, setActionFilter] = React.useState<string>("all");
  const [entityFilter, setEntityFilter] = React.useState<string>("all");

  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [entityTypes, setEntityTypes] = React.useState<string[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * This page previously rendered a hard-coded array of eight sample rows,
   * so it showed invented users and invented 192.168.x addresses and never
   * once contacted the server. Nothing a user actually did appeared here.
   *
   * Filtering runs server-side so the counts describe the whole log rather
   * than whatever slice was fetched.
   */
  React.useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "200" });
        if (actionFilter !== "all") params.set("action", actionFilter);
        if (entityFilter !== "all") params.set("entityType", entityFilter);

        const res = await fetch(
          `/api/organizations/${organizationId}/audit-logs?${params}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load audit logs (${res.status})`);
        }
        const json = await res.json();
        setLogs((json.data as AuditLogResponse[]).map(toAuditLog));
        setTotal(json.pagination?.total ?? json.data.length);
        // Options come from the whole log, not the filtered page, so
        // choosing one filter cannot empty the other dropdown.
        if (json.filters?.entityTypes) setEntityTypes(json.filters.entityTypes);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [organizationId, actionFilter, entityFilter]);

  const filteredLogs = logs;

  const stats = React.useMemo(() => {
    const today = new Date().toDateString();
    return {
      total,
      today: logs.filter((l) => new Date(l.createdAt).toDateString() === today).length,
      creates: logs.filter((l) => l.action === "CREATE").length,
      updates: logs.filter((l) => l.action === "UPDATE").length,
      deletes: logs.filter((l) => l.action === "DELETE").length,
    };
  }, [logs, total]);

  if (authLoading || (loading && logs.length === 0 && !error)) {
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
          <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">
            Track all system activities and changes
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Logs
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.today}</div>
            <p className="text-xs text-muted-foreground">Activities</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Creates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.creates}</div>
            <p className="text-xs text-muted-foreground">New records</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.updates}</div>
            <p className="text-xs text-muted-foreground">Modifications</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deletes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.deletes}</div>
            <p className="text-xs text-muted-foreground">Removals</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Activity Log
              </CardTitle>
              <CardDescription>
                {filteredLogs.length} log entries
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="LOGIN">Login</SelectItem>
                  <SelectItem value="LOGOUT">Logout</SelectItem>
                  <SelectItem value="POST">Post to ledger</SelectItem>
                  <SelectItem value="REVERSE">Reverse</SelectItem>
                  <SelectItem value="EXPORT">Export</SelectItem>
                </SelectContent>
              </Select>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Entities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {entityTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredLogs}
            searchKey="userName"
            searchPlaceholder="Search by user..."
          />
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  Download,
  Filter,
  Search,
  User,
  Clock,
  FileText,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "EXPORT" | "VIEW";
  entityType: string;
  entityId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

const auditLogs: AuditLog[] = [
  {
    id: "1",
    userId: "1",
    userName: "Admin User",
    userEmail: "admin@accubooks.com",
    action: "CREATE",
    entityType: "INVOICE",
    entityId: "INV/2024-25/007",
    newData: { customerName: "New Customer", amount: 50000 },
    ipAddress: "192.168.1.100",
    createdAt: "2024-12-09T14:30:00",
  },
  {
    id: "2",
    userId: "1",
    userName: "Admin User",
    userEmail: "admin@accubooks.com",
    action: "UPDATE",
    entityType: "PARTY",
    entityId: "Acme Corporation",
    oldData: { phone: "9876543210" },
    newData: { phone: "9876543211" },
    ipAddress: "192.168.1.100",
    createdAt: "2024-12-09T14:15:00",
  },
  {
    id: "3",
    userId: "2",
    userName: "Finance Manager",
    userEmail: "finance@accubooks.com",
    action: "EXPORT",
    entityType: "REPORT",
    entityId: "Balance Sheet FY 2024-25",
    ipAddress: "192.168.1.101",
    createdAt: "2024-12-09T13:45:00",
  },
  {
    id: "4",
    userId: "3",
    userName: "Sales User",
    userEmail: "sales@accubooks.com",
    action: "CREATE",
    entityType: "QUOTATION",
    entityId: "QT-000007",
    newData: { customerName: "Prospect Ltd", amount: 125000 },
    ipAddress: "192.168.1.102",
    createdAt: "2024-12-09T12:30:00",
  },
  {
    id: "5",
    userId: "1",
    userName: "Admin User",
    userEmail: "admin@accubooks.com",
    action: "DELETE",
    entityType: "VOUCHER",
    entityId: "JV/2024-25/089",
    oldData: { amount: 15000, narration: "Test entry" },
    ipAddress: "192.168.1.100",
    createdAt: "2024-12-09T11:00:00",
  },
  {
    id: "6",
    userId: "2",
    userName: "Finance Manager",
    userEmail: "finance@accubooks.com",
    action: "LOGIN",
    entityType: "USER",
    ipAddress: "192.168.1.101",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
    createdAt: "2024-12-09T09:00:00",
  },
  {
    id: "7",
    userId: "3",
    userName: "Sales User",
    userEmail: "sales@accubooks.com",
    action: "VIEW",
    entityType: "REPORT",
    entityId: "Profit & Loss Statement",
    ipAddress: "192.168.1.102",
    createdAt: "2024-12-08T16:30:00",
  },
  {
    id: "8",
    userId: "1",
    userName: "Admin User",
    userEmail: "admin@accubooks.com",
    action: "UPDATE",
    entityType: "SETTINGS",
    entityId: "Organization Settings",
    oldData: { fiscalYearStart: 4 },
    newData: { fiscalYearStart: 4, dateFormat: "DD/MM/YYYY" },
    ipAddress: "192.168.1.100",
    createdAt: "2024-12-08T15:00:00",
  },
];

const actionConfig = {
  CREATE: { color: "bg-green-100 text-green-800", icon: Plus },
  UPDATE: { color: "bg-blue-100 text-blue-800", icon: Pencil },
  DELETE: { color: "bg-red-100 text-red-800", icon: Trash2 },
  LOGIN: { color: "bg-purple-100 text-purple-800", icon: LogIn },
  LOGOUT: { color: "bg-gray-100 text-gray-800", icon: LogOut },
  EXPORT: { color: "bg-orange-100 text-orange-800", icon: Download },
  VIEW: { color: "bg-cyan-100 text-cyan-800", icon: Eye },
};

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
      const action = row.getValue("action") as keyof typeof actionConfig;
      const config = actionConfig[action];
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
  const [actionFilter, setActionFilter] = React.useState<string>("all");
  const [entityFilter, setEntityFilter] = React.useState<string>("all");

  const filteredLogs = React.useMemo(() => {
    return auditLogs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (entityFilter !== "all" && log.entityType !== entityFilter) return false;
      return true;
    });
  }, [actionFilter, entityFilter]);

  const entityTypes = React.useMemo(() => {
    return Array.from(new Set(auditLogs.map((l) => l.entityType)));
  }, []);

  const stats = React.useMemo(() => {
    const today = new Date().toDateString();
    const todayLogs = auditLogs.filter(
      (l) => new Date(l.createdAt).toDateString() === today
    );
    return {
      total: auditLogs.length,
      today: todayLogs.length,
      creates: auditLogs.filter((l) => l.action === "CREATE").length,
      updates: auditLogs.filter((l) => l.action === "UPDATE").length,
      deletes: auditLogs.filter((l) => l.action === "DELETE").length,
    };
  }, []);

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

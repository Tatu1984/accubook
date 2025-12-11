"use client";

import * as React from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Clock,
  AlertCircle,
  Info,
  FileText,
  IndianRupee,
  Package,
  Users,
  Settings,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "APPROVAL_REQUEST" | "PAYMENT_DUE" | "STOCK_LOW" | "SYSTEM" | "INFO";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

const notifications: Notification[] = [
  {
    id: "1",
    type: "APPROVAL_REQUEST",
    title: "Expense Claim Pending Approval",
    message: "Rahul Sharma has submitted an expense claim for Rs. 12,500 for client visit travel expenses.",
    isRead: false,
    createdAt: "2024-12-09T10:30:00",
  },
  {
    id: "2",
    type: "PAYMENT_DUE",
    title: "Invoice Payment Overdue",
    message: "Invoice INV/2024-25/003 for Global Industries is 4 days overdue. Amount: Rs. 2,76,120",
    isRead: false,
    createdAt: "2024-12-09T09:15:00",
  },
  {
    id: "3",
    type: "STOCK_LOW",
    title: "Low Stock Alert",
    message: "Product 'Laptop Stand XL' is running low. Current stock: 5 units. Reorder level: 10 units.",
    isRead: false,
    createdAt: "2024-12-09T08:00:00",
  },
  {
    id: "4",
    type: "APPROVAL_REQUEST",
    title: "Purchase Order Approval Required",
    message: "New purchase order PO-000156 requires your approval. Total amount: Rs. 1,85,000",
    isRead: true,
    createdAt: "2024-12-08T16:45:00",
  },
  {
    id: "5",
    type: "SYSTEM",
    title: "GST Return Due Soon",
    message: "GSTR-3B for November 2024 is due on December 20, 2024. Please file before the deadline.",
    isRead: true,
    createdAt: "2024-12-08T12:00:00",
  },
  {
    id: "6",
    type: "INFO",
    title: "New Feature Available",
    message: "Bank reconciliation auto-matching is now available. Check it out in Banking > Reconciliation.",
    isRead: true,
    createdAt: "2024-12-07T10:00:00",
  },
  {
    id: "7",
    type: "PAYMENT_DUE",
    title: "Bill Payment Due",
    message: "Bill BILL/2024-25/089 from Supplier Corp is due in 3 days. Amount: Rs. 45,000",
    isRead: true,
    createdAt: "2024-12-06T14:30:00",
  },
  {
    id: "8",
    type: "APPROVAL_REQUEST",
    title: "Leave Request",
    message: "Priya Patel has requested casual leave for December 15-16, 2024.",
    isRead: true,
    createdAt: "2024-12-05T11:20:00",
  },
];

const typeConfig = {
  APPROVAL_REQUEST: {
    color: "bg-blue-100 text-blue-800",
    icon: FileText,
    bgColor: "bg-blue-50",
  },
  PAYMENT_DUE: {
    color: "bg-orange-100 text-orange-800",
    icon: IndianRupee,
    bgColor: "bg-orange-50",
  },
  STOCK_LOW: {
    color: "bg-yellow-100 text-yellow-800",
    icon: Package,
    bgColor: "bg-yellow-50",
  },
  SYSTEM: {
    color: "bg-purple-100 text-purple-800",
    icon: Settings,
    bgColor: "bg-purple-50",
  },
  INFO: {
    color: "bg-gray-100 text-gray-800",
    icon: Info,
    bgColor: "bg-gray-50",
  },
};

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const config = typeConfig[notification.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex gap-4 p-4 rounded-lg transition-colors",
        !notification.isRead && config.bgColor,
        notification.isRead && "hover:bg-muted/50"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
          config.color
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={cn("text-sm font-medium", !notification.isRead && "font-semibold")}>
              {notification.title}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
          </div>
          {!notification.isRead && (
            <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-2" />
          )}
        </div>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTimeAgo(notification.createdAt)}
          </span>
          <div className="flex items-center gap-1">
            {!notification.isRead && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onMarkRead(notification.id)}
              >
                <Check className="h-3 w-3 mr-1" />
                Mark read
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
              onClick={() => onDelete(notification.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [localNotifications, setLocalNotifications] = React.useState(notifications);
  const [selectedTab, setSelectedTab] = React.useState("all");

  const unreadCount = localNotifications.filter((n) => !n.isRead).length;

  const filteredNotifications = React.useMemo(() => {
    if (selectedTab === "all") return localNotifications;
    if (selectedTab === "unread") return localNotifications.filter((n) => !n.isRead);
    return localNotifications.filter((n) => n.type === selectedTab);
  }, [localNotifications, selectedTab]);

  const handleMarkRead = (id: string) => {
    setLocalNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const handleMarkAllRead = () => {
    setLocalNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleDelete = (id: string) => {
    setLocalNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClearRead = () => {
    setLocalNotifications((prev) => prev.filter((n) => !n.isRead));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Stay updated with important alerts and messages
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all as read
            </Button>
          )}
          <Button variant="outline" onClick={handleClearRead}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear read
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unread</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{unreadCount}</div>
            <p className="text-xs text-muted-foreground">Notifications</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {localNotifications.filter((n) => n.type === "APPROVAL_REQUEST" && !n.isRead).length}
            </div>
            <p className="text-xs text-muted-foreground">Pending action</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {localNotifications.filter((n) => n.type === "PAYMENT_DUE" && !n.isRead).length}
            </div>
            <p className="text-xs text-muted-foreground">Due reminders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {localNotifications.filter((n) => n.type === "STOCK_LOW" && !n.isRead).length}
            </div>
            <p className="text-xs text-muted-foreground">Stock alerts</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                All Notifications
              </CardTitle>
              <CardDescription>
                {filteredNotifications.length} notifications
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">
                Unread
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="APPROVAL_REQUEST">Approvals</TabsTrigger>
              <TabsTrigger value="PAYMENT_DUE">Payments</TabsTrigger>
              <TabsTrigger value="STOCK_LOW">Alerts</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Bell className="h-12 w-12 mb-4 opacity-50" />
                    <p>No notifications</p>
                  </div>
                ) : (
                  filteredNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkRead={handleMarkRead}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  Bell,
  Loader2,
  Check,
  Trash2,
  Settings,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
} from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const { organizationId, isLoading: orgLoading } = useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);

  /**
   * The list was never fetched — the effect only flipped the loading flag with
   * a "// In real implementation, fetch notifications" note, so this screen
   * always claimed the user was all caught up.
   */
  const fetchNotifications = React.useCallback(async () => {
    if (!organizationId) return;
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/notifications?limit=100`
      );
      if (!r.ok) throw new Error("Failed to load notifications");
      const body = await r.json();
      type Row = {
        id: string;
        title: string;
        message: string;
        type: string;
        isRead?: boolean;
        createdAt: string;
      };
      setNotifications(
        ((body.data ?? []) as Row[]).map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          read: Boolean(n.isRead),
          createdAt: n.createdAt,
        }))
      );
    } catch (e) {
      toast.error((e as Error).message || "Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    if (organizationId) {
      setIsLoading(true);
      fetchNotifications();
    }
  }, [organizationId, fetchNotifications]);

  const handleMarkAllRead = async () => {
    if (!organizationId) return;
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/notifications`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markAllRead" }),
        }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to mark as read");
      toast.success("All notifications marked as read");
      fetchNotifications();
    } catch (e) {
      toast.error((e as Error).message || "Failed to mark as read");
    }
  };

  const handleDelete = async (notification: Notification) => {
    if (!organizationId) return;
    try {
      const r = await fetch(
        `/api/organizations/${organizationId}/notifications?notificationId=${notification.id}`,
        { method: "DELETE" }
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to delete notification");
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    } catch (e) {
      toast.error((e as Error).message || "Failed to delete notification");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Stay updated with your activities
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={notifications.length === 0 || notifications.every((n) => n.read)}
          >
            <Check className="mr-2 h-4 w-4" />
            Mark All Read
          </Button>
          <Button variant="outline" onClick={() => window.location.href = "/settings/preferences"}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No notifications</h3>
              <p className="text-muted-foreground">
                You&apos;re all caught up! Check back later for updates.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 p-4 border rounded-lg ${
                    !notification.read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{notification.title}</p>
                      {!notification.read && (
                        <Badge variant="default" className="text-xs">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDate(notification.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete notification"
                    onClick={() => handleDelete(notification)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

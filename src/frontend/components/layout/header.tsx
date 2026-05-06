"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Search, Building, ChevronDown, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/frontend/components/ui/sidebar";
import { Separator } from "@/frontend/components/ui/separator";
import { Badge } from "@/frontend/components/ui/badge";

interface Branch {
  id: string;
  name: string;
  code: string;
  isHeadOffice: boolean;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string | null;
}

const SEARCH_TARGETS: { label: string; href: string; keywords: string[] }[] = [
  { label: "Dashboard", href: "/dashboard", keywords: ["dashboard", "home", "overview"] },
  { label: "Invoices", href: "/sales/invoices", keywords: ["invoice", "invoices", "sales"] },
  { label: "Quotations", href: "/sales/quotations", keywords: ["quotation", "quote"] },
  { label: "Sales Orders", href: "/sales/orders", keywords: ["sales order", "so"] },
  { label: "Receipts", href: "/sales/receipts", keywords: ["receipt", "receipts"] },
  { label: "Credit Notes", href: "/sales/credit-notes", keywords: ["credit note", "cn"] },
  { label: "Bills", href: "/purchases/bills", keywords: ["bill", "bills", "purchase"] },
  { label: "Purchase Orders", href: "/purchases/orders", keywords: ["purchase order", "po"] },
  { label: "Payments", href: "/purchases/payments", keywords: ["payment", "payments"] },
  { label: "Debit Notes", href: "/purchases/debit-notes", keywords: ["debit note", "dn"] },
  { label: "Parties", href: "/parties", keywords: ["party", "parties", "customer", "vendor", "supplier"] },
  { label: "Items", href: "/inventory/items", keywords: ["item", "items", "product"] },
  { label: "Stock Summary", href: "/inventory/stock", keywords: ["stock"] },
  { label: "Stock Movements", href: "/inventory/movements", keywords: ["stock movement", "movement"] },
  { label: "Warehouses", href: "/inventory/warehouses", keywords: ["warehouse"] },
  { label: "Vouchers", href: "/accounting/vouchers", keywords: ["voucher", "vouchers", "journal"] },
  { label: "Ledgers", href: "/accounting/ledgers", keywords: ["ledger"] },
  { label: "Chart of Accounts", href: "/accounting/chart-of-accounts", keywords: ["chart", "accounts", "coa"] },
  { label: "Bank Accounts", href: "/banking/accounts", keywords: ["bank"] },
  { label: "Bank Reconciliation", href: "/banking/reconciliation", keywords: ["reconcile", "reconciliation"] },
  { label: "GST Returns", href: "/taxation/gst", keywords: ["gst", "gstr"] },
  { label: "TDS / TCS", href: "/taxation/tds-tcs", keywords: ["tds", "tcs"] },
  { label: "Trial Balance", href: "/reports/trial-balance", keywords: ["trial balance"] },
  { label: "Profit & Loss", href: "/reports/profit-loss", keywords: ["profit", "loss", "p&l", "pnl"] },
  { label: "Balance Sheet", href: "/reports/balance-sheet", keywords: ["balance sheet"] },
  { label: "Employees", href: "/hr/employees", keywords: ["employee", "staff"] },
  { label: "Payroll", href: "/hr/payroll", keywords: ["payroll", "salary"] },
  { label: "Approvals", href: "/approvals", keywords: ["approval", "approve"] },
  { label: "Settings", href: "/settings/organization", keywords: ["settings", "organization", "org"] },
];

function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function Header() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const organizationId = session?.user?.organizationId;
  const currentBranchId = session?.user?.branchId;

  useEffect(() => {
    if (!organizationId) return;

    const fetchBranches = async () => {
      try {
        const response = await fetch(`/api/organizations/${organizationId}/branches`);
        if (response.ok) {
          const data = await response.json();
          setBranches(data);
        }
      } catch (error) {
        console.error("Error fetching branches:", error);
      }
    };

    fetchBranches();
  }, [organizationId]);

  const fetchNotifications = async () => {
    if (!organizationId) return;
    setNotifLoading(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/notifications?limit=10`);
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data || []);
        setUnreadCount(json.unreadCount || 0);
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const handleMarkAllRead = async () => {
    if (!organizationId || unreadCount === 0) return;
    try {
      const res = await fetch(`/api/organizations/${organizationId}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        toast.success("All notifications marked as read");
      }
    } catch {
      toast.error("Failed to mark notifications as read");
    }
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!organizationId) return;
    if (!n.isRead) {
      fetch(`/api/organizations/${organizationId}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: n.id }),
      }).catch(() => {});
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (n.link) router.push(n.link);
  };

  const handleBranchSwitch = async (branch: Branch) => {
    if (branch.id === currentBranchId) return;

    setLoading(true);
    try {
      await update({
        branchId: branch.id,
        branchName: branch.name,
      });
      window.location.reload();
    } catch (error) {
      console.error("Error switching branch:", error);
    } finally {
      setLoading(false);
    }
  };

  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as typeof SEARCH_TARGETS;
    return SEARCH_TARGETS.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.includes(q))
    ).slice(0, 8);
  }, [searchQuery]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (matches.length > 0) {
      router.push(matches[0].href);
      setSearchQuery("");
      setSearchOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {session?.user?.organizationName || "Dashboard"}
          </span>
          {session?.user?.branchName && (
            <>
              <span>/</span>
              <span>{session.user.branchName}</span>
            </>
          )}
        </div>

        {/* Search with jump-nav */}
        <div ref={searchRef} className="flex-1 max-w-md ml-auto relative">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Jump to invoices, parties, GST returns…"
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
              />
            </div>
          </form>
          {searchOpen && searchQuery.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-md z-50 max-h-80 overflow-y-auto">
              {matches.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
              ) : (
                matches.map((m) => (
                  <Link
                    key={m.href}
                    href={m.href}
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="flex items-center px-3 py-2 text-sm hover:bg-accent cursor-pointer"
                  >
                    <Search className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    {m.label}
                    <span className="ml-auto text-xs text-muted-foreground">{m.href}</span>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* Branch Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" disabled={loading}>
              <Building className="h-4 w-4" />
              <span className="hidden sm:inline-block max-w-[100px] truncate">
                {session?.user?.branchName || "Select Branch"}
              </span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Switch Branch</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {branches.length === 0 ? (
              <DropdownMenuItem disabled>No branches found</DropdownMenuItem>
            ) : (
              branches.map((branch) => (
                <DropdownMenuItem
                  key={branch.id}
                  onClick={() => handleBranchSwitch(branch)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    <span>{branch.name}</span>
                    {branch.isHeadOffice && (
                      <Badge variant="outline" className="text-xs">
                        HQ
                      </Badge>
                    )}
                  </div>
                  {branch.id === currentBranchId && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs"
                disabled={unreadCount === 0}
                onClick={handleMarkAllRead}
              >
                Mark all read
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              {notifLoading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              ) : (
                notifications.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onSelect={() => handleNotificationClick(n)}
                    className="flex flex-col items-start gap-1 py-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          n.isRead ? "bg-muted-foreground/30" : "bg-blue-500"
                        }`}
                      />
                      <span className={`text-sm flex-1 truncate ${n.isRead ? "" : "font-medium"}`}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTimeAgo(n.createdAt)}
                      </span>
                    </div>
                    {n.message && (
                      <span className="text-xs text-muted-foreground pl-4 line-clamp-2">
                        {n.message}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="justify-center text-sm cursor-pointer">
              <Link href="/notifications">View all notifications</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Building2,
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
  LogOut,
  ChevronDown,
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
  Bell,
  HelpCircle,
  UserCheck,
  CheckSquare,
  Percent,
  Plus,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const navigation = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    title: "Accounting",
    icon: BookOpen,
    children: [
      { title: "Chart of Accounts", href: "/accounting/chart-of-accounts", icon: FileText },
      { title: "Ledgers", href: "/accounting/ledgers", icon: BookOpen },
      { title: "Vouchers", href: "/accounting/vouchers", icon: Receipt },
      { title: "Journal Entries", href: "/accounting/vouchers?type=JOURNAL", icon: FileSpreadsheet },
      { title: "Cost Centers", href: "/accounting/cost-centers", icon: Building },
      { title: "Projects", href: "/accounting/projects", icon: ClipboardList },
    ],
  },
  {
    title: "Parties",
    icon: UserCheck,
    href: "/parties",
  },
  {
    title: "Inventory",
    icon: Package,
    children: [
      { title: "Items", href: "/inventory/items", icon: Box },
      { title: "Categories", href: "/inventory/categories", icon: Package },
      { title: "Warehouses", href: "/inventory/warehouses", icon: Building },
      { title: "Stock Summary", href: "/inventory/stock", icon: ClipboardList },
      { title: "Stock Movements", href: "/inventory/movements", icon: Truck },
      { title: "Stock Adjustment", href: "/inventory/adjustment", icon: Scale },
    ],
  },
  {
    title: "Sales",
    icon: ShoppingCart,
    children: [
      { title: "Quotations", href: "/sales/quotations", icon: FileText },
      { title: "Sales Orders", href: "/sales/orders", icon: ClipboardList },
      { title: "Invoices", href: "/sales/invoices", icon: Receipt },
      { title: "Credit Notes", href: "/sales/credit-notes", icon: FileText },
      { title: "Receipts", href: "/sales/receipts", icon: CreditCard },
    ],
  },
  {
    title: "Purchases",
    icon: Truck,
    children: [
      { title: "Purchase Orders", href: "/purchases/orders", icon: ClipboardList },
      { title: "Bills", href: "/purchases/bills", icon: Receipt },
      { title: "Debit Notes", href: "/purchases/debit-notes", icon: FileText },
      { title: "Payments", href: "/purchases/payments", icon: Wallet },
    ],
  },
  {
    title: "Banking",
    icon: Landmark,
    children: [
      { title: "Bank Accounts", href: "/banking/accounts", icon: Landmark },
      { title: "Transactions", href: "/banking/transactions", icon: CreditCard },
      { title: "Reconciliation", href: "/banking/reconciliation", icon: Scale },
      { title: "Cash Management", href: "/banking/cash", icon: PiggyBank },
    ],
  },
  {
    title: "Taxation",
    icon: Calculator,
    children: [
      { title: "Tax Configuration", href: "/settings/taxes", icon: Percent },
      { title: "GST Returns", href: "/taxation/gst", icon: FileText },
      { title: "TDS/TCS", href: "/taxation/tds-tcs", icon: Calculator },
      { title: "Tax Reports", href: "/taxation/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Payroll & HR",
    icon: Users,
    children: [
      { title: "Employees", href: "/hr/employees", icon: User },
      { title: "Departments", href: "/hr/departments", icon: Building },
      { title: "Attendance", href: "/hr/attendance", icon: ClipboardList },
      { title: "Leave Management", href: "/hr/leaves", icon: FileText },
      { title: "Payroll", href: "/hr/payroll", icon: Wallet },
      { title: "Expense Claims", href: "/hr/expense-claims", icon: Receipt },
    ],
  },
  {
    title: "Reports",
    icon: BarChart3,
    children: [
      { title: "Financial Reports", href: "/reports/financial", icon: FileSpreadsheet },
      { title: "Profit & Loss", href: "/reports/profit-loss", icon: BarChart3 },
      { title: "Balance Sheet", href: "/reports/balance-sheet", icon: Scale },
      { title: "Cash Flow", href: "/reports/cash-flow", icon: PiggyBank },
      { title: "Trial Balance", href: "/reports/trial-balance", icon: BookOpen },
      { title: "Custom Reports", href: "/reports/custom", icon: FileText },
    ],
  },
];

const settingsNav = [
  { title: "Organization", href: "/settings/organization", icon: Building2 },
  { title: "Branches", href: "/settings/branches", icon: Building },
  { title: "Users & Roles", href: "/settings/users", icon: Users },
  { title: "Tax Configuration", href: "/settings/taxes", icon: Percent },
  { title: "Approval Workflows", href: "/settings/approvals", icon: CheckSquare },
  { title: "Preferences", href: "/settings/preferences", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "U";

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="p-1.5 bg-primary rounded-lg">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm">AccuBooks</span>
            <span className="text-xs text-muted-foreground truncate max-w-[140px]">
              {session?.user?.organizationName || "No Organization"}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) =>
                item.children ? (
                  <Collapsible
                    key={item.title}
                    defaultOpen={item.children.some((child) =>
                      pathname.startsWith(child.href)
                    )}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === child.href}
                              >
                                <Link href={child.href}>
                                  <child.icon className="h-4 w-4" />
                                  <span>{child.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={pathname === item.href}>
                      <Link href={item.href!}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-auto py-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={session?.user?.image || undefined} />
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium truncate max-w-[120px]">
                      {session?.user?.name || "User"}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {session?.user?.email}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notifications">
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/help">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Help & Support
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/setup">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Organization
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="text-red-600"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

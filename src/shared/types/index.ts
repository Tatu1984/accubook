// Core Types for the Accounting Platform

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "ACCOUNTANT" | "MANAGER" | "VIEWER";

export interface Permission {
  module: string;
  actions: ("create" | "read" | "update" | "delete" | "approve" | "export")[];
}

export interface UserSession {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  organizationId: string | null;
  organizationName: string | null;
  branchId: string | null;
  branchName: string | null;
  role: UserRole;
  permissions: Permission[];
}

export interface Organization {
  id: string;
  name: string;
  legalName: string | null;
  logo: string | null;
  baseCurrencyCode: string;
  fiscalYearStart: number;
  country: string;
  timezone: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  isHeadOffice: boolean;
}

// Financial Types
export type AccountNature = "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES" | "EQUITY";

export type VoucherStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";

export type VoucherNature =
  | "PAYMENT"
  | "RECEIPT"
  | "CONTRA"
  | "JOURNAL"
  | "SALES"
  | "PURCHASE"
  | "DEBIT_NOTE"
  | "CREDIT_NOTE";

export interface LedgerBalance {
  ledgerId: string;
  ledgerName: string;
  groupName: string;
  nature: AccountNature;
  openingBalance: number;
  debitAmount: number;
  creditAmount: number;
  closingBalance: number;
}

export interface VoucherEntry {
  id?: string;
  ledgerId: string;
  ledgerName?: string;
  debitAmount: number;
  creditAmount: number;
  narration?: string;
  costCenterId?: string;
  projectId?: string;
}

export interface Voucher {
  id: string;
  voucherNumber: string;
  voucherType: string;
  date: Date;
  narration?: string;
  totalDebit: number;
  totalCredit: number;
  status: VoucherStatus;
  entries: VoucherEntry[];
}

// Inventory Types
export type ItemType = "GOODS" | "SERVICES";
export type ValuationMethod = "FIFO" | "LIFO" | "WEIGHTED_AVG";

export interface StockSummary {
  itemId: string;
  itemName: string;
  sku: string | null;
  categoryName: string | null;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  avgCost: number;
  totalValue: number;
  reorderLevel: number | null;
  isLowStock: boolean;
}

// Invoice Types
export type InvoiceStatus = "DRAFT" | "SENT" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";
export type BillStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

export interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  partyName: string;
  date: Date;
  dueDate: Date;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  isOverdue: boolean;
  daysOverdue: number;
}

// Dashboard KPI Types
export interface DashboardKPIs {
  // Financial KPIs
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  cashBalance: number;
  bankBalance: number;

  // Receivables & Payables
  totalReceivables: number;
  totalPayables: number;
  overdueReceivables: number;
  overduePayables: number;

  // Inventory
  totalStockValue: number;
  lowStockItems: number;

  // Orders
  pendingSalesOrders: number;
  pendingPurchaseOrders: number;

  // Trends
  revenueGrowth: number;
  expenseGrowth: number;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
  }[];
}

// Pagination Types
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
  filters?: Record<string, string | number | boolean | null>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Form Types
export interface SelectOption {
  value: string;
  label: string;
}

// Navigation Types
export interface NavItem {
  title: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  children?: NavItem[];
  permission?: string;
}

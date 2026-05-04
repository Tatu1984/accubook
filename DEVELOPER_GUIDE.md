# Developer Guide - Enterprise Accounting Platform

> **For current project status and roadmap, read [`update.md`](./update.md) first.** It tracks active phase, decisions log, completed work, and what's next. This file is the deeper architecture/onboarding reference and is partially stale where it pre-dates the `src/backend` ↔ `src/frontend` ↔ `src/shared` restructure (paths have been mechanically updated, but examples and prose may still mention the old layout).

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Database Schema](#database-schema)
4. [API Routes](#api-routes)
5. [UI Pages](#ui-pages)
6. [Authentication & Authorization](#authentication--authorization)
7. [Key Flows](#key-flows)
8. [Development Setup](#development-setup)

---

## Architecture Overview

### Tech Stack
| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 16.0.8 |
| Language | TypeScript | 5.x |
| Database | PostgreSQL | 16+ |
| ORM | Prisma | 7.1.0 |
| Auth | NextAuth.js | v5 |
| UI Components | Radix UI | Latest |
| Styling | TailwindCSS | 4.x |
| State | Zustand | 5.0.9 |
| Data Fetching | TanStack Query | 5.90.12 |
| Charts | Recharts | 2.15.4 |
| Forms | React Hook Form + Zod | 7.68.0 / 4.1.13 |

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Pages      │  │  Components │  │  State (Zustand)        │  │
│  │  (App Dir)  │  │  (Radix UI) │  │  + React Query Cache    │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┴──────────────────────┘                │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │ HTTP (REST API)
┌──────────────────────────┼───────────────────────────────────────┐
│                    API LAYER                                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  /api/organizations/[orgId]/*  (50 endpoints)               │ │
│  │  - Zod validation                                            │ │
│  │  - Session auth check                                        │ │
│  │  - Organization isolation                                    │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              │ Prisma Client
┌─────────────────────────────┼────────────────────────────────────┐
│                    DATABASE LAYER                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL (57 tables)                                     │ │
│  │  - Multi-tenant via organizationId                          │ │
│  │  - Soft deletes via isActive flags                          │ │
│  │  - Audit via AuditLog table                                 │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
/accounting
├── /prisma
│   ├── schema.prisma          # Database schema (57 models, 1685 lines)
│   └── seed.ts                # Database seeding script
│
├── /src
│   ├── /app                   # Next.js App Router
│   │   ├── /(auth)            # Public auth pages
│   │   │   ├── /login         # Login page
│   │   │   └── /register      # Registration page
│   │   │
│   │   ├── /(dashboard)       # Protected dashboard pages
│   │   │   ├── /accounting    # GL, vouchers, budgets
│   │   │   ├── /banking       # Bank accounts, reconciliation
│   │   │   ├── /dashboard     # Main dashboard
│   │   │   ├── /hr            # Employees, payroll, leaves
│   │   │   ├── /inventory     # Items, stock, warehouses
│   │   │   ├── /parties       # Customers & vendors
│   │   │   ├── /purchases     # Bills, POs, payments
│   │   │   ├── /reports       # Financial reports
│   │   │   ├── /sales         # Invoices, orders, receipts
│   │   │   ├── /settings      # Configuration
│   │   │   └── /taxation      # GST, TDS management
│   │   │
│   │   ├── /api               # REST API endpoints
│   │   │   ├── /auth          # Authentication endpoints
│   │   │   ├── /currencies    # Global currencies
│   │   │   ├── /organizations # Org-scoped endpoints
│   │   │   │   └── /[orgId]   # 35+ resource routes
│   │   │   └── /units         # Global units of measure
│   │   │
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Landing page
│   │
│   ├── /components
│   │   ├── /layout            # Header, Sidebar
│   │   ├── /transactions      # Business dialogs
│   │   ├── /ui                # 35+ Radix UI components
│   │   └── providers.tsx      # Context providers
│   │
│   ├── /generated             # Prisma generated types
│   │   └── /prisma
│   │
│   ├── /hooks
│   │   ├── use-mobile.ts      # Mobile detection
│   │   └── use-organization.ts # Org context hook
│   │
│   ├── /lib
│   │   ├── /auth
│   │   │   └── config.ts      # NextAuth configuration
│   │   ├── prisma.ts          # Prisma client singleton
│   │   └── utils.ts           # Utility functions
│   │
│   ├── /store                 # Zustand stores
│   │
│   ├── /types
│   │   ├── index.ts           # Core types
│   │   └── next-auth.d.ts     # Auth type extensions
│   │
│   └── globals.css            # Global styles
│
├── middleware.ts              # NextAuth middleware
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
└── ProjectD.docx              # Feature requirements doc
```

---

## Database Schema

### Entity Relationship Summary

#### Core Entities (Multi-Tenant)
```
Organization (1) ──┬── (*) Branch
                   ├── (*) OrganizationUser ── User
                   ├── (*) LedgerGroup ── (*) Ledger
                   ├── (*) Voucher ── (*) VoucherEntry
                   ├── (*) Party (Customer/Vendor)
                   ├── (*) Item ── Stock, Batch
                   ├── (*) Warehouse
                   ├── (*) Employee ── Payslip, Attendance
                   ├── (*) TaxConfig
                   └── (*) BankAccount
```

### Key Models by Module

#### 1. Authentication & Users
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `User` | User accounts | email, passwordHash, mfaEnabled |
| `Account` | OAuth accounts | provider, access_token |
| `Session` | Active sessions | sessionToken, expires |
| `Role` | Permission roles | name, permissions (JSON) |
| `OrganizationUser` | User-org mapping | roleId, branchIds[] |

#### 2. Organization & Structure
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Organization` | Tenant/Company | name, gstNo, baseCurrencyId |
| `Branch` | Branch offices | code, isHeadOffice, gstNo |
| `FiscalYear` | Financial years | startDate, endDate, isClosed |
| `FiscalPeriod` | Monthly/quarterly periods | periodType, isClosed |

#### 3. Chart of Accounts
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `LedgerGroup` | Account groups | nature (ASSETS/LIABILITIES/etc), parentId |
| `Ledger` | Individual accounts | groupId, openingBalance, creditLimit |

#### 4. Vouchers (Journal Entries)
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `VoucherType` | Entry types | nature (PAYMENT/RECEIPT/JOURNAL/etc) |
| `Voucher` | Journal header | voucherNumber, totalDebit, totalCredit, status |
| `VoucherEntry` | Line items | ledgerId, debitAmount, creditAmount |

#### 5. Inventory
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Item` | Products/services | sku, hsnCode, valuationMethod |
| `ItemCategory` | Categories | parentId (hierarchical) |
| `Warehouse` | Storage locations | branchId, isDefault |
| `Stock` | Current inventory | itemId, warehouseId, quantity, avgCost |
| `Batch` | Batch tracking | batchNumber, expiryDate |
| `StockMovement` | Inventory changes | movementType, quantity, rate |

#### 6. Sales & Purchase
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Party` | Customers/vendors | type (CUSTOMER/VENDOR/BOTH), creditLimit |
| `SalesOrder` | Sales orders | status (DRAFT→FULFILLED) |
| `PurchaseOrder` | Purchase orders | status (DRAFT→RECEIVED) |
| `Quotation` | Quotes | validUntil, convertedToOrder |
| `Invoice` | Customer invoices | type, amountPaid, amountDue |
| `Bill` | Vendor bills | vendorBillNo, tdsAmount |

#### 7. Payments
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Receipt` | Customer payments | paymentMode, bankAccountId |
| `Payment` | Vendor payments | paymentMode (NEFT/RTGS/etc) |
| `BankAccount` | Bank accounts | accountNumber, currentBalance |
| `BankTransaction` | Bank statement | isReconciled, matchedVoucherId |

#### 8. HR & Payroll
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Employee` | Employee master | employeeCode, ctc, salaryStructureId |
| `Department` | Departments | name, headId |
| `Designation` | Job titles | level |
| `Attendance` | Daily attendance | checkIn, checkOut, workHours |
| `Leave` | Leave requests | leaveTypeId, status |
| `Payslip` | Salary slips | earnings (JSON), deductions (JSON) |
| `PayrollStructure` | Salary components | components (JSON with formulas) |

#### 9. Taxation
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `TaxConfig` | Tax rates | taxType (GST/VAT/TDS), rate |
| `GSTReturn` | GST filings | returnType (GSTR1/GSTR3B), arn |

#### 10. Approvals & Audit
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `ApprovalWorkflow` | Workflow definitions | entityType, conditions (JSON) |
| `ApprovalWorkflowStep` | Approval steps | approverType, amountLimit |
| `Approval` | Approval instances | status, comments |
| `AuditLog` | Audit trail | action, oldData, newData |

---

## API Routes

### Base URL Pattern
All organization-scoped routes follow: `/api/organizations/[orgId]/[resource]`

### Authentication
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handlers |
| `/api/auth/register` | POST | User registration |

### Organization Resources

#### Masters
| Endpoint | Methods | Model |
|----------|---------|-------|
| `/api/organizations/[orgId]/ledger-groups` | GET, POST | LedgerGroup |
| `/api/organizations/[orgId]/ledgers` | GET, POST | Ledger |
| `/api/organizations/[orgId]/ledgers/[ledgerId]` | GET, PUT | Ledger |
| `/api/organizations/[orgId]/parties` | GET, POST | Party |
| `/api/organizations/[orgId]/parties/[partyId]` | GET, PUT | Party |
| `/api/organizations/[orgId]/cost-centers` | GET, POST | CostCenter |
| `/api/organizations/[orgId]/projects` | GET, POST | Project |

#### Inventory
| Endpoint | Methods | Model |
|----------|---------|-------|
| `/api/organizations/[orgId]/items` | GET, POST | Item |
| `/api/organizations/[orgId]/items/[itemId]` | GET, PUT | Item |
| `/api/organizations/[orgId]/item-categories` | GET, POST | ItemCategory |
| `/api/organizations/[orgId]/warehouses` | GET, POST | Warehouse |
| `/api/organizations/[orgId]/stock` | GET, POST | Stock, StockMovement |

#### Transactions
| Endpoint | Methods | Model |
|----------|---------|-------|
| `/api/organizations/[orgId]/vouchers` | GET, POST | Voucher |
| `/api/organizations/[orgId]/vouchers/[voucherId]` | GET, PUT | Voucher |
| `/api/organizations/[orgId]/voucher-types` | GET, POST | VoucherType |
| `/api/organizations/[orgId]/sales-orders` | GET, POST | SalesOrder |
| `/api/organizations/[orgId]/purchase-orders` | GET, POST | PurchaseOrder |
| `/api/organizations/[orgId]/quotations` | GET, POST | Quotation |
| `/api/organizations/[orgId]/invoices` | GET, POST | Invoice |
| `/api/organizations/[orgId]/bills` | GET, POST | Bill |
| `/api/organizations/[orgId]/receipts` | GET, POST | Receipt |
| `/api/organizations/[orgId]/payments` | GET, POST | Payment |

#### HR & Payroll
| Endpoint | Methods | Model |
|----------|---------|-------|
| `/api/organizations/[orgId]/employees` | GET, POST | Employee |
| `/api/organizations/[orgId]/attendance` | GET, POST | Attendance |
| `/api/organizations/[orgId]/leaves` | GET, POST, PATCH | Leave |
| `/api/organizations/[orgId]/payroll` | GET, POST | Payslip |
| `/api/organizations/[orgId]/payroll/post-month` | POST | (books salary JV) |
| `/api/organizations/[orgId]/payroll/pay-month` | POST | (settles Salaries Payable) |
| `/api/organizations/[orgId]/expense-claims` | GET, POST, PATCH | ExpenseClaim |

#### Configuration
| Endpoint | Methods | Model |
|----------|---------|-------|
| `/api/organizations/[orgId]/branches` | GET, POST | Branch |
| `/api/organizations/[orgId]/users` | GET, POST | OrganizationUser |
| `/api/organizations/[orgId]/roles` | GET, POST | Role |
| `/api/organizations/[orgId]/tax-config` | GET, POST | TaxConfig |
| `/api/organizations/[orgId]/fiscal-years` | GET, POST | FiscalYear |
| `/api/organizations/[orgId]/budgets` | GET, POST | Budget |
| `/api/organizations/[orgId]` | GET, PATCH | Organization (incl. composition scheme) |
| `/api/organizations/[orgId]/approvals` | GET, POST, PATCH, DELETE | Approval (workflow + inbox; auto-routes voucher/bill/expense/leave; auto-promotes entity to GL on full approval) |

#### Banking
| Endpoint | Methods | Model |
|----------|---------|-------|
| `/api/organizations/[orgId]/bank-accounts` | GET, POST | BankAccount |

#### Reporting
| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/organizations/[orgId]/dashboard` | GET | Dashboard KPIs |
| `/api/organizations/[orgId]/reports/profit-loss` | GET | P&L Report |
| `/api/organizations/[orgId]/reports/balance-sheet` | GET | Balance Sheet |
| `/api/organizations/[orgId]/reports/trial-balance` | GET | Trial Balance |
| `/api/organizations/[orgId]/reports/cash-flow` | GET | Cash Flow |
| `/api/organizations/[orgId]/reports/aging` | GET | AR/AP Aging |

#### Global Resources
| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/currencies` | GET | All currencies |
| `/api/units` | GET | Units of measure |

---

## UI Pages

### Dashboard Module
| Page | Path | Purpose |
|------|------|---------|
| Main Dashboard | `/dashboard` | KPIs, charts, quick actions |

### Accounting Module
| Page | Path | Purpose |
|------|------|---------|
| Chart of Accounts | `/accounting/chart-of-accounts` | Ledger groups view |
| Ledgers | `/accounting/ledgers` | Account master |
| Vouchers | `/accounting/vouchers` | Journal entries list |
| New Voucher | `/accounting/vouchers/new` | Create journal entry |
| Cost Centers | `/accounting/cost-centers` | Cost center master |
| Projects | `/accounting/projects` | Project accounting |
| Budgets | `/accounting/budgets` | Budget management |

### Sales Module
| Page | Path | Purpose |
|------|------|---------|
| Invoices | `/sales/invoices` | Invoice list |
| New Invoice | `/sales/invoices/new` | Create invoice |
| Sales Orders | `/sales/orders` | Order management |
| Quotations | `/sales/quotations` | Quote management |
| Receipts | `/sales/receipts` | Customer payments |
| Credit Notes | `/sales/credit-notes` | Credit notes |

### Purchase Module
| Page | Path | Purpose |
|------|------|---------|
| Bills | `/purchases/bills` | Vendor bills |
| Purchase Orders | `/purchases/orders` | PO management |
| Payments | `/purchases/payments` | Vendor payments |
| Debit Notes | `/purchases/debit-notes` | Debit notes |

### Inventory Module
| Page | Path | Purpose |
|------|------|---------|
| Items | `/inventory/items` | Product master |
| Categories | `/inventory/categories` | Item categories |
| Stock | `/inventory/stock` | Stock levels |
| Warehouses | `/inventory/warehouses` | Warehouse master |
| Stock Movements | `/inventory/movements` | Movement history |
| Adjustments | `/inventory/adjustment` | Stock adjustments |

### HR Module
| Page | Path | Purpose |
|------|------|---------|
| Employees | `/hr/employees` | Employee master |
| Departments | `/hr/departments` | Department master |
| Attendance | `/hr/attendance` | Attendance tracking |
| Leaves | `/hr/leaves` | Leave management |
| Payroll | `/hr/payroll` | Payslips, structures |
| Expense Claims | `/hr/expense-claims` | Expense tracking |

### Banking Module
| Page | Path | Purpose |
|------|------|---------|
| Bank Accounts | `/banking/accounts` | Account master |
| Transactions | `/banking/transactions` | Transaction list |
| Reconciliation | `/banking/reconciliation` | Bank recon |
| Cash | `/banking/cash` | Cash transactions |

### Reports Module
| Page | Path | Purpose |
|------|------|---------|
| Financial Reports | `/reports/financial` | Combined reports |
| Profit & Loss | `/reports/profit-loss` | P&L statement |
| Balance Sheet | `/reports/balance-sheet` | Balance sheet |
| Cash Flow | `/reports/cash-flow` | Cash flow statement |
| Trial Balance | `/reports/trial-balance` | Trial balance |
| Custom Reports | `/reports/custom` | Custom reports |

### Taxation Module
| Page | Path | Purpose |
|------|------|---------|
| GST | `/taxation/gst` | Compute GSTR-1/3B/9 + CMP-08; download portal JSON |
| GSTR-2B | `/taxation/gstr2b` | Reconcile GSTN GSTR-2B against purchase register |
| TDS/TCS | `/taxation/tds-tcs` | Quarterly Form 16A / 27D + register |
| Tax Reports | `/taxation/reports` | Tax reports |

### Approvals
| Page | Path | Purpose |
|------|------|---------|
| Approvals Inbox | `/approvals` | Pending decisions + history |

### Billing
| Page | Path | Purpose |
|------|------|---------|
| Recurring Invoices | `/billing/recurring` | Subscription billing templates + manual run |

### Manufacturing
| Page | Path | Purpose |
|------|------|---------|
| Work Orders | `/manufacturing/work-orders` | Issue + Complete state transitions |

### Banking
| Page | Path | Purpose |
|------|------|---------|
| Statement Import | `/banking/import` | CSV import + auto-reconcile |

### Settings Module
| Page | Path | Purpose |
|------|------|---------|
| Organization | `/settings/organization` | Org settings (placeholder; some fields not yet wired) |
| India Tax | `/settings/india-tax` | GSTIN, supplier state, composition scheme toggle |
| Branches | `/settings/branches` | Branch management |
| Users | `/settings/users` | User management |
| Taxes | `/settings/taxes` | Tax configuration |
| Approvals | `/settings/approvals` | Workflow setup |
| Notifications | `/settings/notifications` | In-app notifications inbox |
| GST Returns | `/settings/gst-returns` | GST filing status |
| Audit Logs | `/settings/audit-logs` | Audit trail |
| Tally Migration | `/setup/migrate` | Import masters + vouchers from Tally XML |

---

## Authentication & Authorization

### Auth Flow
```
1. User submits credentials at /login
2. NextAuth validates via CredentialsProvider
3. JWT session created (30-day expiry)
4. Session stored in cookie (authjs.session-token)
5. Middleware validates session on protected routes
6. API routes check session + organization membership
```

### Session Structure
```typescript
interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    organizationId?: string;
    branchId?: string;
  }
}
```

### Permission System
```typescript
// 70+ permissions available
const AVAILABLE_PERMISSIONS = [
  // Dashboard
  "view_dashboard",

  // Accounting
  "manage_chart_of_accounts",
  "create_vouchers",
  "approve_vouchers",
  "view_vouchers",

  // Sales
  "create_invoices",
  "view_invoices",
  "create_sales_orders",

  // Purchases
  "create_bills",
  "approve_bills",
  "create_purchase_orders",

  // Inventory
  "manage_items",
  "manage_stock",
  "view_stock",

  // HR
  "manage_employees",
  "manage_payroll",
  "approve_leaves",

  // Settings
  "manage_users",
  "manage_roles",
  "view_settings",
  "view_audit_logs",
];
```

### Checking Permissions (API)
```typescript
// Example from /api/organizations/[orgId]/users/route.ts
const orgUser = await prisma.organizationUser.findFirst({
  where: { organizationId: orgId, userId: session.user.id },
  include: { role: true }
});

const permissions = orgUser?.role?.permissions as string[] | undefined;

if (!permissions?.includes("manage_users") && orgUser?.role?.name !== "Owner") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

---

## Key Flows

### 1. Double-Entry Voucher Creation
```
POST /api/organizations/[orgId]/vouchers
├── Validate: totalDebit === totalCredit
├── Generate: voucherNumber (auto-increment)
├── Create: Voucher record
├── Create: VoucherEntry records (debit/credit lines)
├── Update: Ledger.currentBalance for each ledger
└── Return: Created voucher with entries
```

### 2. Invoice Creation
```
POST /api/organizations/[orgId]/invoices
├── Validate: Party exists, items valid
├── Generate: invoiceNumber (INV/{FY}/{NUM})
├── Calculate: subtotal, taxAmount, totalAmount
├── Create: Invoice record
├── Create: InvoiceItem records
├── Create: InvoiceTax records (tax breakdown)
├── Update: Party outstanding balance
└── Return: Created invoice
```

### 3. Stock Movement
```
POST /api/organizations/[orgId]/stock
├── Validate: Item, warehouse exist
├── Create: StockMovement record
├── Update: Stock.quantity (upsert)
│   ├── PURCHASE/GRN: increase toWarehouse
│   ├── SALE/ISSUE: decrease fromWarehouse
│   └── TRANSFER: decrease from, increase to
├── Update: Stock.avgCost (weighted average)
└── Return: Movement record
```

### 4. Financial Report Calculation
```
GET /api/organizations/[orgId]/reports/profit-loss
├── Get: FiscalYear dates
├── Query: VoucherEntry grouped by Ledger.group.nature
│   ├── INCOME: Sum creditAmount - debitAmount
│   └── EXPENSES: Sum debitAmount - creditAmount
├── Calculate: Gross Profit = Income - Direct Expenses
├── Calculate: Net Profit = Gross Profit - Indirect Expenses
└── Return: Hierarchical P&L structure
```

---

## Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 16+
- npm or yarn

### Installation
```bash
# Clone repository
git clone <repo-url>
cd accounting

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database (optional)
npx prisma db seed

# Start development server
npm run dev
```

### Environment Variables
```env
DATABASE_URL="postgresql://user:password@localhost:5432/accounting"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

### Common Commands
```bash
# Development
npm run dev              # Start dev server (port 3000)
npm run build            # Production build
npm run start            # Start production server

# Database
npx prisma studio        # Open Prisma Studio
npx prisma migrate dev   # Run migrations
npx prisma db push       # Push schema changes
npx prisma generate      # Regenerate client

# Type checking
npx tsc --noEmit         # Check types
```

---

## Code Patterns

### API Route Pattern
```typescript
// src/app/api/organizations/[orgId]/[resource]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/backend/services/auth.service";
import { prisma } from "@/backend/database/client";
import { z } from "zod";

// Validation schema
const createSchema = z.object({
  name: z.string().min(1),
  // ... fields
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  // Check organization membership
  const orgUser = await prisma.organizationUser.findFirst({
    where: { organizationId: orgId, userId: session.user.id },
  });

  if (!orgUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch data
  const data = await prisma.resource.findMany({
    where: { organizationId: orgId },
  });

  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  const body = await request.json();

  // Validate
  const validationResult = createSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validationResult.error.errors },
      { status: 400 }
    );
  }

  // Create
  const created = await prisma.resource.create({
    data: {
      organizationId: orgId,
      ...validationResult.data,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
```

### Page Component Pattern
```typescript
// src/app/(dashboard)/[module]/page.tsx

"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { DataTable } from "@/frontend/components/ui/data-table";
import { Button } from "@/frontend/components/ui/button";
import { Plus } from "lucide-react";

export default function ResourcePage() {
  const params = useParams();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/organizations/${params.orgId}/resource`);
      const json = await response.json();
      setData(json);
    } catch (error) {
      console.error("Failed to fetch:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Resources</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add New
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
      />
    </div>
  );
}
```

---

## Testing Checklist

### Before Deployment
- [ ] All API routes return proper error codes
- [ ] Double-entry validation works (debit = credit)
- [ ] Organization isolation is enforced
- [ ] Permissions are checked on all routes
- [ ] Financial calculations are accurate
- [ ] Stock movements update quantities correctly
- [ ] Audit logs are created for all changes

---

## File Quick Reference

| Need to... | Look in... |
|------------|------------|
| Add new database model | `prisma/schema.prisma` |
| Add new API endpoint | `src/app/api/organizations/[orgId]/` |
| Add new dashboard page | `src/app/(dashboard)/` |
| Add UI component | `src/frontend/components/ui/` |
| Modify auth logic | `src/backend/services/auth.service.ts` |
| Add new permission | `src/app/api/organizations/[orgId]/roles/route.ts` |
| Check session handling | `middleware.ts` |

---

## Contact & Support

For questions about this codebase, refer to:
- Feature requirements: `ProjectD.docx`
- This guide: `DEVELOPER_GUIDE.md`

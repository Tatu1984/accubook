---
title: "AccuBook User Manual"
subtitle: "Enterprise Accounting Platform — End-User Guide"
author: "AccuBook"
date: "2026-05-06"
---

# Chapter 1 — Welcome to AccuBook

AccuBook is a multi-tenant accounting and ERP platform built for Indian small and mid-sized businesses. It covers the full operational stack: general ledger, sales, purchases, inventory, banking, manufacturing, GST/TDS compliance, payroll & HR, approvals, and reporting — all inside a single web application.

This manual walks an end-user (business owner, accountant, store-keeper, payroll admin, finance manager, or auditor) through every feature available in the product, in the order you will typically encounter them.

## Who should read this

- **Owners & directors** — read Chapters 1–5 and Chapter 16 (Reports) to understand the dashboard and what numbers the system gives you.
- **Accountants** — read everything in Part 2 (Modules). Pay extra attention to the chapters on Accounting, Sales, Purchases, Banking, and Taxation.
- **Store-keepers / inventory staff** — Chapter 9 (Inventory), Chapter 13 (Manufacturing).
- **HR / Payroll admins** — Chapter 15 (HR & Payroll).
- **Auditors** — Chapter 18 (Approvals), Chapter 19 (Settings → Audit Logs), and the Reports chapter.

# Chapter 2 — About this guide

This guide is feature-by-feature, not task-by-task. Every screen in the product has a section here describing what it does, what each button means, and what data flows behind the scenes (so you understand the "why", not just the "what"). At the end of every chapter you will find a "Common pitfalls" callout listing the mistakes we most often see.

If you only have ten minutes, read:

1. Chapter 4 — Getting started.
2. Chapter 5 — The dashboard.
3. Chapter 22 — Common workflows.

You will then be productive enough to handle most day-to-day operations.

# Chapter 3 — System & browser requirements

AccuBook is a web application. There is nothing to install on your machine.

**Supported browsers** (latest two stable versions):

- Google Chrome
- Mozilla Firefox
- Apple Safari
- Microsoft Edge

**Screen resolution:** 1280 × 720 minimum, 1440 × 900 or higher recommended. The app is responsive but works best on a desktop.

**Network:** any modern broadband connection. Operations like CSV import or Tally migration upload up to 50 MB; ensure your connection is stable.

**Cookies & JavaScript** must both be enabled. The app uses cookies to remember your login and JavaScript to render the interface.

# Chapter 4 — Getting started

## 4.1 Accessing the app

Open your browser and navigate to your organization's AccuBook URL (e.g. `https://accubook.example.com`). The first thing you see is the marketing landing page with a "Sign in" button in the top-right.

## 4.2 Logging in

Click **Sign in** (top-right). You arrive at `/login`.

Enter:

- **Email** — the email address registered with your AccuBook account.
- **Password** — your password.

Click **Sign in**. On success you are redirected to `/dashboard`.

### Demo credentials

If the deployment is a demo, the login page will display a "Demo Credentials" card with:

- **Email:** `admin@accubook.com`
- **Password:** `password123!`

Use these credentials to explore. **Do not** use them in a production deployment that hosts real data — change the password immediately after first login (Chapter 17, Profile).

### Forgot password

Click **Forgot password?** under the password field. You are taken to `/forgot-password` where you can request a reset link by email. (When email is not configured at the deployment level, contact your administrator.)

### Failed login attempts

After **five** consecutive failed attempts, your account is locked for **30 minutes** as an anti-brute-force measure. After 30 minutes the lock clears automatically.

## 4.3 First-time setup

The first time anyone logs in to a fresh database, only one organization exists (the demo org or the one your installer set up). To start using the system for real, an administrator should:

1. **Settings → Organization** — set the legal name, registered address, default currency, financial year, GSTIN (if applicable), PAN, and TAN. See Chapter 19.1.
2. **Settings → India Tax** — switch on GSTIN/state/composition scheme if you are an Indian business. See Chapter 19.2.
3. **Settings → Branches** — add additional branches if you have multiple offices. The seed creates one head-office branch.
4. **Settings → Users** — invite your team and assign roles (Admin, Accountant, Manager, Viewer, etc.).
5. **Accounting → Chart of Accounts** — review the seeded ledger groups and add custom ledgers/groups your business needs.
6. **Parties** — create at least one customer and one vendor for testing.
7. **Inventory → Items** — add the items, products, or services you sell.
8. **Settings → Tax Configuration** — review and add custom tax rates if needed.

Once these are done, you are ready to record real transactions.

# Chapter 5 — The dashboard

The dashboard at `/dashboard` is the launch pad for every screen and the at-a-glance health check for your business.

## 5.1 The sidebar

Down the left of the screen is the navigation sidebar, organized by module:

- **Dashboard** — return to this page from anywhere.
- **Accounting** — Chart of Accounts, Ledgers, Vouchers, Journal Entries, Cost Centers, Projects.
- **Parties** — your customers and vendors.
- **Inventory** — Items, Categories, Warehouses, Stock Summary, Stock Movements, Stock Adjustment.
- **Sales** — Quotations, Sales Orders, Invoices, Recurring Invoices, Credit Notes, Receipts.
- **Purchases** — Purchase Orders, Bills, Debit Notes, Payments.
- **Banking** — Bank Accounts, Transactions, Statement Import, Reconciliation, Cash Management.
- **Manufacturing** — Work Orders.
- **Taxation** — Tax Configuration, GST Returns, GSTR-2B Reconcile, TDS/TCS, Tax Reports.
- **Payroll & HR** — Employees, Departments, Attendance, Leave Management, Payroll, Run Payroll, Expense Claims.
- **Reports** — Financial Reports, Profit & Loss, Balance Sheet, Cash Flow, Trial Balance, Registers, Custom Reports.
- **Approvals** — your inbox for pending approval requests.

Below those is a **Settings** section with Organization, India Tax, Branches, Users & Roles, Tax Configuration, Approval Workflows, Tally Migration, and Audit Logs.

At the bottom is your user card. Clicking it opens a menu with **Profile**, **Notifications**, **Help & Support**, **Add Organization**, and **Sign out**.

Click any module title with sub-items (a chevron is visible) to expand it.

## 5.2 The top bar

Across the top of the screen is the header.

- **Sidebar toggle** — collapses or expands the sidebar.
- **Breadcrumb** — shows your current organization and branch (e.g. *Demo Corporation / Head Office*).
- **Search bar** — type a keyword like "invoices", "GST returns", "parties" and press Enter (or click a suggestion) to jump straight to the relevant page. The search also surfaces sub-pages like "Trial Balance", "Stock Movements", "Run Payroll".
- **Branch switcher** — if your organization has multiple branches, you can switch the active branch from this dropdown. The currently-active branch is shown with a check mark; the head office is tagged with an "HQ" badge. Switching reloads the dashboard with that branch's data.
- **Notifications bell** — opens a dropdown listing your latest in-app notifications (overdue invoices, approvals waiting, payments due, low stock). The red badge on the bell shows the count of unread notifications. Click any item to jump to the related record. **Mark all read** clears the unread state for everything in the list. **View all notifications** opens the full notifications page.

## 5.3 KPI cards (first row)

Each card shows a real number for the current fiscal year (April → today by default; configurable):

- **Total Revenue** — sum of all non-cancelled invoices in the period. The footnote shows how many invoices that is.
- **Net Profit** — Revenue − Expenses. Green if positive, red if negative.
- **Receivables** — outstanding amount across all open invoices (status SENT / PARTIAL / OVERDUE). The footnote highlights overdue invoices in orange.
- **Payables** — outstanding amount across all open bills. The footnote highlights overdue bills in blue.

## 5.4 KPI cards (second row)

- **Cash Balance** — sum of `currentBalance` across all active bank accounts.
- **Stock Value** — sum of `quantity × purchasePrice` across every item in stock. The footnote calls out items that have fallen below their reorder level.
- **Total Expenses** — sum of all non-cancelled bills in the period. Footnote shows bill count.
- **Pending Approvals** — count of vouchers currently awaiting approval.

## 5.5 Charts and lists

- **Receivables Aging** (donut chart) — splits your outstanding receivables into Current, 1–30 days, 31–60 days, 60+ days. The percentages are derived from the receivables total.
- **Recent Transactions** — the latest five vouchers with date, voucher number, type, and amount.
- **Top Customers** — your top five customers this period by revenue, with a progress bar that compares against the leader.
- **Pending Actions** — coloured cards summarising the things you need to act on (overdue invoices, vouchers awaiting approval, overdue bills, low stock). Each card has a "Review" or "Pay" or "Approve" button that takes you to the filtered list.

## 5.6 Quick actions

The **Refresh** button at the top of the dashboard re-fetches all data without a full page reload.

The **Create Transaction** dropdown (top-right) gives you one-click shortcuts to:

- New Invoice
- New Quotation
- New Sales Order
- New Purchase Order
- Record Receipt
- Record Payment
- Journal Entry

These open inline dialogs (most of them) or take you to a full creation page (Invoice, Journal Entry).

# Chapter 6 — General usage notes

## 6.1 Lists and tables

Most module pages show a paginated table of records. Common controls:

- **Tabs** at the top filter by status (e.g. Sales Invoices: All / Draft / Sent / Paid / Overdue / Cancelled).
- **Search field** filters rows in the current view.
- **Column headers** with an up/down arrow are sortable — click to toggle ascending / descending.
- **Checkboxes** select rows for bulk operations (where applicable).
- **Three-dot button** at the end of each row opens a menu of row-level actions (View, Edit, Delete, etc.).
- **Export** button (where present) downloads the current filtered list as a CSV file.

## 6.2 Forms

- Required fields are marked with `*`.
- Date fields accept calendar selection or direct typing in `YYYY-MM-DD` format.
- Amount fields accept any numeric value with up to four decimals; figures are formatted in Indian numbering (e.g. ₹12,34,567.89) on display.
- Errors appear inline beneath the offending field and as a toast notification at the top-right.

## 6.3 Toasts & feedback

Every action that mutates data (create, update, delete, post, approve) produces a toast notification at the top-right:

- **Green** — success.
- **Red** — error (the message will be specific, e.g. "Validation failed: invoice number must be unique").
- **Blue** — informational (e.g. "Nothing to export").

Toasts disappear automatically after a few seconds.

# Part 2 — Modules

# Chapter 7 — Accounting

## 7.1 Chart of Accounts

`Accounting → Chart of Accounts`

The Chart of Accounts (CoA) is the backbone of your books. It is a hierarchical tree of **ledger groups** (e.g. *Assets*, *Liabilities*, *Sundry Debtors*) with **ledgers** (e.g. *Cash in Hand*, *HDFC Current*) at the leaves.

### What you see

- **Five summary cards** at the top — totals across each nature: Assets, Liabilities, Income, Expenses, Equity.
- A nested tree where each row is either a group (folder icon) or a ledger (document icon).
- The right side of each row shows the running balance.
- A three-dot menu on each row.

### Three-dot menu — group

- **Add Sub-Group** — opens the create-group dialog with this group pre-filled as the parent.
- **Add Ledger** — takes you to the Ledgers page in "create" mode within this group.
- **Edit** — opens the dialog to rename / reclassify the group. *System-defined groups (the ones seeded at install) cannot be edited or deleted; the menu item appears greyed-out.*
- **Delete** — removes the group. Refused if any ledgers or sub-groups still belong to it.

### Three-dot menu — ledger

- **View Details** — opens the ledger statement (transactions + running balance) in the Reports → Registers page filtered to this ledger.
- **Edit** — same destination as View Details, in edit mode.
- **View Transactions** — opens the Vouchers page filtered to vouchers that touch this ledger.
- **Delete** — removes the ledger. Refused if any voucher entries still reference it.

### Top-right buttons

- **Export** — downloads the entire CoA (groups + ledgers) as CSV.
- **Add Group** — opens the create dialog. You pick a name, a nature (Assets / Liabilities / Income / Expenses / Equity), and an optional parent.

## 7.2 Ledgers

`Accounting → Ledgers`

A flat, searchable list of every ledger account in the system. Each row shows code, name, parent group, opening balance + DR/CR type, and current balance. You can create / edit / delete ledgers directly here. Ledgers tied to system groups (Cash, Bank Accounts, GST Output / Input, TDS Payable, Salaries Payable, Stock-in-Hand, Work in Progress, etc.) are seeded automatically.

## 7.3 Vouchers

`Accounting → Vouchers`

A voucher is a journal entry — at minimum, two lines (debit and credit) that move money between ledgers. AccuBook supports multiple voucher types each with a code: Receipt (RCT), Payment (PMT), Journal (JOR), Sales (SAL), Purchase (PUR), Contra (CTA), Debit Note (DR), Credit Note (CR), Stock Journal (SJV), Manufacturing Journal (MJV), Reversing Journal (REV).

### Status lifecycle

`DRAFT → PENDING (PENDING_APPROVAL) → APPROVED → POSTED to GL`

A voucher can also become `REJECTED` or `CANCELLED`. When approval workflows are configured, submitting a DRAFT voucher routes it through the approval inbox before it can become APPROVED.

### What you see

- **KPI cards** — total vouchers, drafts, pending approvals, approved, total approved amount.
- **Tabs** — All / Receipt / Payment / Journal / Sales / Purchase / Contra (filter by type).
- **Table** — date, voucher number, type, narration, debit, credit, status, created-by.
- **Three-dot menu per row** — view, edit (DRAFT only), submit for approval, post, reverse, cancel.

### New Voucher (`/accounting/vouchers/new`)

A multi-line journal-entry form:

- Pick voucher type, date, voucher number (auto-generated and FY-scoped — you can override).
- Add lines (Dr / Cr / Ledger / Amount / Narration). The system enforces `total Dr = total Cr` before save.
- Save as DRAFT or directly submit for approval.

## 7.4 Cost Centers

`Accounting → Cost Centers`

Cost centers are tags you can attach to voucher entries to track expenses or revenues by department, project, location, or any other dimension. Useful for management reports later.

## 7.5 Projects

`Accounting → Projects`

A lightweight project register: name, description, start/end dates, budget. Project IDs can be attached to vouchers / invoices / bills for project-wise P&L.

## 7.6 Budgets

`Accounting → Budgets`

Plan and monitor monthly spend against ledgers.

### What you see

- **KPI cards** — total budgets, active count, total active budget across all active budgets, draft count.
- **Tabs** — All / Active / Draft / Closed.
- **Table** — name, fiscal year, total amount, line count, status.

### Three-dot menu

- **Activate** (DRAFT only) — moves the budget to ACTIVE so its lines can be tracked against actuals.
- **Close Budget** (ACTIVE only) — closes the budget so it no longer accepts new lines or actuals.
- **Delete** — removes the budget and all its lines.

### Create dialog

- Name, fiscal year, status (Draft / Active), description.
- Line items (per ledger × twelve months) are added after the budget is created — that is the next step in the planned UI.

# Chapter 8 — Parties (Customers & Vendors)

`Parties`

All customers and vendors live here. The page has two tabs: **Customers** and **Vendors**.

### What you see (per tab)

- KPI cards — total customers / vendors, with credit balances and GSTINs.
- Search field.
- Table with name, contact (email / phone), GSTIN, city, credit days, opening balance.
- Three-dot menu per row.

### Three-dot menu

- **View Details** — opens the party statement in Reports → Registers (full transaction history with running balance).
- **Edit** — opens the create / edit dialog with the party pre-filled.
- **View Transactions** — same destination as View Details.
- **Delete** — removes the party. Refused if there are any open invoices, bills, payments, or receipts referencing them.

### Add / Edit party dialog

- Type (Customer / Vendor / Both).
- Name (required), email, phone, GSTIN, PAN.
- Billing address, city, state.
- Credit days (e.g. 30 = "Net 30"), credit limit.
- Opening balance & balance type (Debit = receivable from customer, Credit = payable to vendor).

The system uses GSTIN and the party's billing state to derive the place-of-supply for invoices automatically.

# Chapter 9 — Inventory

## 9.1 Items

`Inventory → Items`

Your product / service catalogue. Each item has:

- Name, SKU, HSN/SAC code (for GST).
- Category (e.g. Raw Material, Finished Goods, Service).
- Unit of measure (e.g. PCS, KG, MTR).
- Selling price, purchase price.
- Tax mapping (the default tax rate to apply on sales).
- Reorder level (low-stock threshold for alerts).

Items can be marked as `isActive` toggle so retired items stop appearing in dropdowns without losing history.

## 9.2 Item Categories

`Inventory → Categories`

A flat list of category names you can assign to items.

## 9.3 Warehouses

`Inventory → Warehouses`

Locations where stock is held. The seed creates a default warehouse; you can add more for multi-location operations.

## 9.4 Stock Summary

`Inventory → Stock Summary`

For every item × every warehouse, shows on-hand quantity, weighted-average unit cost, total value, and the date of the last movement.

## 9.5 Stock Movements

`Inventory → Stock Movements`

The append-only log of every stock movement: PURCHASE (received via bill), SALE (issued via invoice), GRN (Goods Received Note), TRANSFER (warehouse-to-warehouse), ADJUSTMENT, ISSUE (issued to a work order), RECEIPT (work order completion), RETURN. Each row is linked back to the source document.

## 9.6 Stock Adjustment

`Inventory → Stock Adjustment`

Manual adjustments — for stock-take corrections, write-offs, or breakage. Choose item, warehouse, adjustment type (positive / negative), quantity, reason. The system writes a StockMovement and posts a journal voucher (Stock-in-Hand against Adjustment Loss / Gain).

# Chapter 10 — Sales

## 10.1 Quotations

`Sales → Quotations`

Pre-sale offers. Status: DRAFT → SENT → ACCEPTED → CONVERTED. An accepted quotation can be one-click converted to a sales order.

## 10.2 Sales Orders

`Sales → Sales Orders`

Confirmed orders that are not yet invoiced. A sales order can spawn one or more invoices as you fulfil partial deliveries.

## 10.3 Invoices

`Sales → Invoices`

The most-used screen for any Indian business. Each invoice has:

- Invoice number — auto-generated in the format `INV/YYYY-YY/NNNNN`, race-safe and FY-scoped (resets to `00001` each fiscal year).
- Customer, date, due date.
- Line items with quantity, unit price, discount, HSN/SAC, tax (CGST/SGST or IGST or zero-rated for exports).
- Place of supply (state code) — automatically derived from the customer's billing state and locked at write-time, so the GST split stays stable.
- Reverse charge flag where applicable.
- Notes, terms.

### Status lifecycle

`DRAFT → SENT → PARTIAL → PAID` (or `OVERDUE` if dueDate < today and unpaid; or `CANCELLED`).

### Top buttons

- **Export** — CSV download of the current filtered list.
- **New Invoice** — opens the full creation form at `/sales/invoices/new`.

### Three-dot menu

- **View Details** — opens the printable invoice page at `/sales/invoices/:id`.
- **Print** — opens a new tab with auto-print enabled (uses the browser's print dialog).
- **Download PDF** — same as Print; use "Save as PDF" in your browser's print dialog to get a PDF.
- **Duplicate** — creates a fresh DRAFT copy with a new FY-scoped number (date is today, due date is offset by the same number of days as the original). Receipts, IRN, and payment status are not copied.
- **Edit** (DRAFT only).
- **Send Invoice** (DRAFT → SENT).
- **Send Reminder** (SENT / PARTIAL / OVERDUE) — logs an in-app reminder notification and an audit entry. When email is configured at the deployment level, this also fires an email to the party.
- **Record Payment** (SENT / PARTIAL / OVERDUE) — opens the receipt creation form pre-filled with this invoice.
- **Delete** / **Cancel Invoice** — DRAFT invoices delete; non-DRAFT invoices CANCEL (the data is retained and reversed in the GL).

### E-invoicing & e-way bill

For organizations registered for e-invoicing under the Indian GST regime, AccuBook can generate the IRN payload (`/api/.../invoices/:id/einvoice-payload`) and the e-way bill payload (`/api/.../invoices/:id/eway-bill-payload`) compliant with NIC schema v1.04 (e-way) / v1.1 (e-invoice). The actual NIC API submission is a separate integration step.

## 10.4 Recurring Invoices

`Sales → Recurring Invoices` (`/billing/recurring`)

Templates that auto-generate invoices on a schedule. Each template carries:

- A name and description.
- Customer + line items + tax setup (just like a normal invoice).
- Frequency: weekly / monthly / quarterly / yearly.
- Next-run date.
- Active / inactive flag.

The page lists every template with KPIs (due / active / inactive counts), a DUE badge on rows whose next-run date has passed, and a **Run now** action that immediately generates an invoice from that template. The cron-style endpoint `/api/.../recurring-invoices/run` (also reachable from the **Run all due** button) processes every template whose next-run is on or before today.

## 10.5 Credit Notes

`Sales → Credit Notes`

Issued against an invoice when goods are returned or a customer is given a discount post-invoice. Reverses the relevant amounts in the GL and reduces GSTR-1 outward turnover.

## 10.6 Receipts

`Sales → Receipts`

Money received from a customer. A receipt can be linked to one specific invoice (allocates against that bill) or recorded as an advance (sits on the customer's ledger until allocated later). The receipt POST writes a 2- or 3-line journal voucher (Dr Bank gross / Cr Party / Cr TCS Payable when applicable), updates the bank account balance, and recomputes the linked invoice's status (SENT → PARTIAL → PAID).

# Chapter 11 — Purchases

## 11.1 Purchase Orders

`Purchases → Purchase Orders`

Same shape as a sales order but on the buy side. PO → GRN → Bill is the typical fulfilment chain.

## 11.2 Bills

`Purchases → Bills`

A bill is what you owe a vendor. Like invoices, bills have line items, GST splits, place-of-supply, and an FY-scoped bill number.

### Status lifecycle

`DRAFT → PENDING_APPROVAL → APPROVED → PARTIAL → PAID` (or CANCELLED / OVERDUE).

A bill posts to the GL when it becomes APPROVED — either directly when created with status APPROVED (admins only) or after passing through the configured approval workflow. The journal includes Dr Expense / Dr GST Input (regular) or Dr Expense (composition) / Cr Vendor / Cr GST Output RCM if reverse charge applies / Cr TDS Payable if a TDS section is selected at bill time.

## 11.3 Debit Notes

`Purchases → Debit Notes`

Issued against a bill when goods are returned to the vendor. Mirror of credit notes.

## 11.4 Payments

`Purchases → Payments`

Money paid to a vendor. Each payment can be linked to a specific bill or recorded as a vendor advance. When a TDS section (e.g. 194C, 194J, 194Q) is selected, the system computes the TDS amount automatically (with single + annual threshold checks and no-PAN penal rate logic), creates a 3-line voucher (Dr Vendor / Cr Bank net / Cr TDS Payable), reduces the bank account balance by the **net** amount (gross − TDS), and persists a TdsDeduction record for later certificate generation.

# Chapter 12 — Banking

## 12.1 Bank Accounts

`Banking → Bank Accounts`

Each bank account has a name, bank name, account number, IFSC code, current balance, and active flag. Bank balance updates on every receipt / payment automatically — there is no need to update it manually unless you import a statement (Section 12.4).

## 12.2 Transactions

`Banking → Transactions`

The append-only log of every BankTransaction. Most rows correspond to a receipt, payment, or transfer, and link back to the source. Manual transactions can be added too — they will appear in reconciliation as candidates for matching.

## 12.3 Cash Management

`Banking → Cash`

A simplified register for petty cash: opening, receipts, payments, closing. Cash transactions post to the seeded "Cash in Hand" ledger.

## 12.4 Statement Import

`Banking → Statement Import`

Upload a bank statement CSV (HDFC / ICICI / SBI / Axis / generic format) up to 10 MB. The system parses the file, dedupes by (date, debit, credit, ref, description), and inserts BankTransaction rows. Result panel shows parsed / inserted / skipped (duplicate) counts plus any per-row errors.

## 12.5 Reconciliation

`Banking → Reconciliation`

After importing a statement, click **Run reconciliation** to auto-match BankTransactions to existing receipts / payments / transfers. The matcher scores candidates on amount, date proximity, reference substring, and party-token overlap — ambiguous matches are flagged for manual review. Result panel shows considered / matched / ambiguous / unmatched counts.

# Chapter 13 — Manufacturing

## 13.1 Bills of Materials (BOMs)

(Backend route — UI extends from Work Orders for now.)

A BOM is the recipe for a manufactured item: the finished good, output quantity, output unit, and a list of component items with quantities and units. BOMs can be multi-level — a sub-assembly's BOM is automatically resolved when costing a parent.

## 13.2 Work Orders

`Manufacturing → Work Orders`

A work order is an instruction to produce a finished good against a BOM.

### Lifecycle

`DRAFT → IN_PROGRESS → COMPLETED` (or CANCELLED).

### Issue

Click **Issue** on a DRAFT work order. The system:

- Scales the BOM to `plannedQuantity`.
- Decrements stock from the issuing warehouse for each component.
- Writes ISSUE stock movements.
- Posts a journal voucher (Dr Work in Progress / Cr Stock-in-Hand).
- Moves the work order to IN_PROGRESS.

If any component has insufficient stock, the system refuses with a structured shortage list (item, required, available, deficit per row).

### Complete

Click **Complete** on an IN_PROGRESS work order. The system:

- Writes a GRN-style stock movement adding `completedQuantity` of the finished good to inventory.
- Recomputes the finished good's weighted-average cost.
- Posts a journal voucher (Dr Stock-in-Hand / Cr Work in Progress).
- Moves the work order to COMPLETED.

Scrap is absorbed into the finished good's unit cost.

# Chapter 14 — Taxation

## 14.1 GST Returns

`Taxation → GST Returns`

A four-tab page covering the GST returns triad (plus composition):

- **GSTR-1** — outward returns. Compute for a chosen month; download portal-format JSON with the **Download portal JSON** button. Sections: B2B, B2CL, B2CS, CDNR / CDNUR, EXP, NIL, HSN, DOCS.
- **GSTR-3B** — monthly summary. Section 3.1 outward (taxable / zero / nil-rated / RCM-inward / NON-GST), Section 4 ITC (available + net), Section 5 exempt inward. Portal JSON download supported.
- **GSTR-9** — annual return. Sections 4 / 5 / 6 / 7 / 9 surfaced, with optional `precedingFyTurnover` input feeding cell `gt`. Portal JSON download supported.
- **CMP-08** — quarterly composition return. Computes the four cells required by CMP-08 for organizations on the composition scheme.

For each tab: pick the period (date inputs for monthly returns, FY label `YYYY-YY` for annual), click **Compute**. The page shows summary KPIs (4 per return), section breakdowns, and a download button for portal JSON.

## 14.2 GSTR-2B Reconcile

`Taxation → GSTR-2B Reconcile`

Upload the GSTN GSTR-2B JSON for the tax period. The reconcile engine matches every B2B bill in the books to its row in GSTR-2B and classifies the result as:

- **MATCHED** — exact match within ₹1 cell tolerance.
- **MISMATCHED** — present on both sides with differences (and a reason — supplier GSTIN, taxable value, tax amount, etc.).
- **MISSING_IN_BOOKS** — present in GSTR-2B but no matching bill — usually a supplier you forgot to record.
- **MISSING_IN_2B** — present in books but not on GSTR-2B — usually a supplier yet to file.

The four-bucket output makes it easy to chase corrections before filing GSTR-3B.

## 14.3 TDS / TCS

`Taxation → TDS/TCS`

Tabs for TDS list, TCS list, Form 16A (per deductee, per quarter), Form 27D (TCS quarterly).

- **TDS list** — every TdsDeduction the system has booked, with section, party, deduction amount, and source document (payment or bill).
- **TCS list** — every TcsCollection booked at receipt time.
- **Form 16A** — for any deductee and quarter, generates the printable Form 16A certificate, fully formatted to be handed to the deductee.
- **Form 27D** — same shape, for TCS certificates.

### Printable certificates

`/taxation/tds-tcs/cert/:partyId` renders a print-friendly layout (with quarter selector + autoprint capability) that you can save as PDF or print on paper.

## 14.4 Tax Reports

`Taxation → Tax Reports`

Aggregated tax outputs (GST input register, GST output register, tax-paid summary). Useful for filing reconciliation and statutory dashboards.

# Chapter 15 — Payroll & HR

## 15.1 Employees

`HR & Payroll → Employees`

Full HR master record — name, contact, department, designation, joining date, PAN, Aadhaar, bank details, salary structure, reporting manager. The reporting-manager link is what powers the "MANAGER" approver type in approval workflows.

## 15.2 Departments & Designations

`HR & Payroll → Departments` and (under Settings) `Designations` lists.

## 15.3 Attendance

`HR & Payroll → Attendance`

Day-wise attendance grid: present, absent, half-day, on-leave, holiday. Bulk import from a CSV is supported.

## 15.4 Leave Management

`HR & Payroll → Leave Management`

Leave applications by employee, status workflow (PENDING → APPROVED / REJECTED), leave-balance tracking per leave type. Approval routes through the same approvals inbox as vouchers / bills.

## 15.5 Payroll

`HR & Payroll → Payroll`

Per-month payslip register. Each payslip is computed from the employee's salary structure, attendance, and applicable PF / ESI / professional tax / TDS deductions.

## 15.6 Run Payroll

`HR & Payroll → Run Payroll` (`/hr/payroll/run`)

A two-step monthly payroll cycle:

1. **Post month** — aggregates all PROCESSED payslips for a (month, year) and writes a single journal voucher: Dr Salaries & Wages (net of LOP) + Dr Employer PF & ESI / Cr Salaries Payable + Cr PF Payable + Cr ESI Payable + Cr Professional Tax Payable + Cr TDS Payable. This is the GL impact of the month's payroll.
2. **Pay month** — once the period is fully POSTED, this button posts Dr Salaries Payable / Cr Bank, decrements the chosen bank account, and moves payslips to PAID. Refused if the period is partially paid.

## 15.7 Expense Claims

`HR & Payroll → Expense Claims`

Employees raise reimbursement claims; claims route through the approvals inbox; on approval, the claim posts to the GL (Dr Expense / Cr Employee Payable) and shows up in the next payroll for reimbursement.

# Chapter 16 — Reports

`Reports → …`

Every report has a date-range picker. Each generates an on-screen table you can also download as CSV.

- **Profit & Loss** — Income − Expenses across the period. Drill from any line into the underlying voucher list.
- **Balance Sheet** — Assets vs Liabilities + Equity at a point in time.
- **Cash Flow** — Operating / Investing / Financing cash movements over the period.
- **Trial Balance** — every ledger with its closing debit and credit. Should always balance to zero.
- **Registers** — three tabs:
  - **Sales Register** — every outward invoice with party, place-of-supply, supply-type, taxable + tax breakdown, total, status.
  - **Purchase Register** — every bill with vendor, RCM flag, breakdown, total.
  - **Party Statement** — running-balance statement of account for any chosen party. Picks up partyId from the URL when opened from the Parties page three-dot menu.
- **Aging** — receivables and payables aging buckets (Current, 1-30, 31-60, 60+ days).
- **Custom Reports** — saved query templates (filter by ledger, party, voucher type, etc.) you can re-run on demand.
- **Financial Reports** — alias landing page that links to the four core statutory reports above.

# Chapter 17 — Profile, Notifications, Help

## 17.1 Profile

`/profile` (accessible from the user-menu at bottom-left of the sidebar).

Update your name, avatar, email, phone, and password. Two-factor authentication toggle (where enabled at the deployment level).

## 17.2 Notifications

`/notifications`

The full feed of every notification ever sent to you, filterable by type (APPROVAL_REQUEST / PAYMENT_DUE / STOCK_LOW / SYSTEM). Each item links to the source record. Mark-read and delete actions.

## 17.3 Help & Support

`/help`

In-product help cards: documentation links, contact support, version info.

# Chapter 18 — Approvals

`Approvals` (`/approvals`)

Your inbox for approval requests routed to you (or your role / your reportees). Two tabs:

- **Pending** — items awaiting your decision.
- **History** — items you have already acted on.

Each item shows the entity (Voucher / Bill / Expense Claim / Leave), submitter, amount where applicable, and the workflow step. Click **Approve** or **Reject** to decide. You can attach an optional comment.

When the **last** required approver decides:

- All-APPROVED → the entity auto-promotes (voucher posts to GL, bill becomes APPROVED, expense claim posts, leave is granted and balance decremented).
- Any-REJECTED → the entity goes to REJECTED (voucher) or back to DRAFT (bill).

When a step has multiple role-holders and one of them decides, the sibling Approvals at the same step auto-cancel.

# Chapter 19 — Settings

## 19.1 Organization

`Settings → Organization`

Legal name, registered address, default currency, fiscal year, GSTIN, PAN, TAN, logo, signature image.

## 19.2 India Tax

`Settings → India Tax`

Toggle GSTIN, registered state (drives place-of-supply auto-detection), composition scheme on/off + composition rate. Critical for GSTR-1 / 3B / CMP-08 to compute correctly.

## 19.3 Branches

`Settings → Branches`

Add / edit / deactivate branches. The header's Branch Switcher reads from this list.

## 19.4 Users & Roles

`Settings → Users & Roles`

Two halves:

- **Users** — invite team members by email, assign role, deactivate. The "last admin" is protected — you can't deactivate the only ADMIN; the system guards against locking everyone out.
- **Roles** — system roles (ADMIN, ACCOUNTANT, MANAGER, VIEWER, etc.) with edit-permissions for custom roles. Permissions are JSON of `{ module, actions[] }` triples; wildcards (`module: "*"` / `actions: ["*"]`) supported.

## 19.5 Tax Configuration

`Settings → Tax Configuration`

Add custom tax rates: name, rate %, tax type (CGST / SGST / IGST / CESS), applicable on (sales / purchases / both). Used in invoice / bill line-item tax mapping.

## 19.6 Approval Workflows

`Settings → Approval Workflows`

Define approval workflows per entity type with amount-based thresholds. Each workflow has an ordered list of steps; each step has an approver type (USER / ROLE / MANAGER) + amount limit + sequence number. Vouchers / bills / claims / leaves submit-PENDING are automatically routed by `routeEntityForApproval`.

## 19.7 Tally Migration

`Settings → Tally Migration` (`/setup/migrate`)

A one-shot importer for migrating from Tally Prime / Tally ERP 9.

### How to export from Tally

In Tally Prime: `F1 → Export → Masters → All Masters`, choose XML format, save the file.

(For Tally ERP 9: `Gateway of Tally → Display → List of Accounts → Alt+E → XML Format → All Masters`.)

### How to import into AccuBook

1. Click **Choose file** and select your `.xml` export.
2. Click **Run import**.
3. The result panel shows per-section stats:
   - **Ledger Groups** — created / skipped / errors
   - **Ledgers** — created / skipped / errors
   - **Parties** — created / skipped / errors
   - **Stock Items** — created / skipped / errors

Per-section errors are listed (collapsed to first 10 with "…and N more"). Re-uploads are idempotent — names already imported are skipped, not duplicated.

### What gets imported

Master data: ledger groups (with hierarchy), ledgers (with opening balances), parties (with GSTIN / address / credit terms), stock items (with HSN / unit). Voucher transactions are not imported in the current release — they should be re-entered or migrated via opening balance.

## 19.8 GST Returns (settings shortcut)

`Settings → GST Returns`

Quick access to the same GST returns dashboard at `/taxation/gst`.

## 19.9 Audit Logs

`Settings → Audit Logs`

Every CREATE / UPDATE / DELETE / POST / REVERSE / ISSUE / COMPLETE / EXPORT / LOGIN / LOGOUT action by every user. Filterable by user, action, entity type, date range. Each row carries the before / after JSON snapshot.

## 19.10 Notifications (settings)

`Settings → Notifications`

Per-user notification preferences (email-on-approval, email-on-overdue, daily-digest, etc.).

## 19.11 Preferences

`Settings → Preferences`

UI preferences (theme, density, default landing page).

# Chapter 20 — Setup wizard

`/setup` is a guided walkthrough that an administrator runs the very first time, in order:

1. **Organization** — fill in legal details, GSTIN, fiscal year.
2. **Branch** — confirm or rename the head office; add additional branches.
3. **Chart of Accounts** — accept the seed CoA or customise it.
4. **Bank** — add at least one bank account.
5. **Tax** — review tax rates.
6. **Done** — go to the dashboard.

You can re-run `/setup` at any time from the user-menu (`Add Organization`).

# Chapter 21 — Help, support, and feedback

- The in-app **Help & Support** page (`/help`) lists the support channels enabled at your deployment.
- Bugs / requests should be filed via the link your administrator has configured (e.g. an internal Jira project).
- Always include the URL, your role, and a screenshot when you report a problem.

# Chapter 22 — Common workflows

## 22.1 Your first sale, end-to-end

1. **Parties → Customers tab → Add Party** — create the customer.
2. **Inventory → Items → Add Item** — make sure the item you are selling exists with a tax mapping.
3. **Sales → Invoices → New Invoice** — pick the customer, add line items, save as DRAFT, then **Send Invoice**.
4. **Sales → Receipts → Record Receipt** — when the customer pays, allocate the receipt to the invoice. The invoice moves to PAID; bank balance increments.
5. **Reports → Profit & Loss** — revenue is now reflected.

## 22.2 Your first purchase + payment with TDS

1. **Parties → Vendors tab → Add Party** — create the vendor with GSTIN and PAN.
2. **Purchases → Bills → New Bill** — pick the vendor, add line items, set place-of-supply, save. If the bill should be approved by your finance head, submit for approval; otherwise an admin can directly mark APPROVED.
3. **Purchases → Payments → Record Payment** — pick the bill, choose the bank account, enter the amount, **select the TDS section** (e.g. `194J` for professional services). The system computes the TDS, generates a 3-line voucher, and decrements the bank by the net.
4. **Taxation → TDS/TCS → TDS list** — verify the deduction has been booked.

## 22.3 Month-end close

1. **HR & Payroll → Run Payroll → Post month** — books salaries.
2. **HR & Payroll → Run Payroll → Pay month** — disburses.
3. **Banking → Statement Import** — upload all bank statements for the month.
4. **Banking → Reconciliation** — auto-match.
5. **Taxation → GST Returns** — compute GSTR-1 + GSTR-3B for the month, download portal JSON, file via GSTN.
6. **Taxation → GSTR-2B Reconcile** — upload GSTR-2B JSON, chase mismatches.
7. **Reports → Profit & Loss / Balance Sheet** — review numbers, lock the period.

## 22.4 Migrating from Tally

1. **Settings → Tally Migration** — upload the All-Masters XML.
2. Review the per-section stats; fix errors and re-upload (idempotent).
3. **Accounting → Chart of Accounts** — verify the imported groups and ledgers.
4. **Parties** — verify the imported parties.
5. **Inventory → Items** — verify the imported items.
6. Set opening balances on the relevant ledgers (the importer brings them through; double-check large accounts).
7. From this point onwards, transact as normal.

# Chapter 23 — Tips, FAQs, and pitfalls

## Tips

- **Use the search bar** in the header. Typing `gst` then Enter takes you straight to GST Returns. Same for `tds`, `parties`, `trial balance`, etc.
- **Always set `place of supply` on invoices** (it auto-populates from the customer's billing state, but verify on cross-state sales). Wrong place-of-supply is the most common cause of wrong GST output split.
- **Run statement import before reconciliation** — reconciliation only matches against transactions already imported.
- **Approve in batches** — the Approvals page lets you approve / reject many items in one sitting. Use the History tab to audit your decisions.
- **Refresh the dashboard** when several team members are working concurrently — the Refresh button re-fetches without a full reload.

## FAQs

- **Can two users edit the same voucher at the same time?** The system uses optimistic concurrency. The second saver gets a "stale data" error and is prompted to reload before retrying.
- **Why is my invoice number `INV/2026-27/00001`?** Invoice numbers are FY-scoped and reset to `00001` each fiscal year (April–March in India). The `2026-27` is the FY label.
- **Why did Send Reminder say "no party email on file"?** Because the customer record has no email. Fix it under `Parties → Edit`. After that, every reminder for that party will email.
- **Can I delete an APPROVED voucher?** No — but you can REVERSE it. Reversal posts an opposite voucher and leaves an audit trail.
- **Does export include cancelled rows?** No. Use the Cancelled tab if you specifically need them.

## Common pitfalls

- **System ledger groups are not editable.** "Cash in Hand", "Sundry Debtors", "Duties & Taxes", and similar groups are seeded and protected. Trying to delete them returns an error.
- **Bills must be APPROVED before they post to the GL.** A DRAFT or PENDING_APPROVAL bill does not affect P&L or cash. Verify status if numbers look off.
- **TDS thresholds are per-FY-per-section.** If you uncheck the TDS section after the YTD threshold has already been crossed, the system will still deduct from the *first* rupee for the rest of the FY.
- **Composition scheme zeros out per-line GST on invoices.** Don't toggle composition mid-year unless you know what you are doing.

# Chapter 24 — Glossary

- **CoA** — Chart of Accounts.
- **CGST / SGST / IGST** — Central / State / Inter-state GST.
- **CMP-08** — Quarterly composition return.
- **DRAFT / SENT / PARTIAL / PAID** — invoice statuses.
- **DR / CR** — Debit / Credit.
- **EWB** — E-Way Bill.
- **FY** — Fiscal Year (April–March in India).
- **GL** — General Ledger.
- **GRN** — Goods Received Note.
- **GSTIN** — GST Identification Number.
- **GSTR-1 / 3B / 9 / 2B** — GSTN return forms.
- **HSN / SAC** — Harmonised System of Nomenclature (goods) / Service Accounting Code.
- **IRN** — Invoice Reference Number (e-invoicing).
- **JV** — Journal Voucher.
- **NIC** — National Informatics Centre (GSTN's tech arm).
- **POS** — Place of Supply.
- **RCM** — Reverse Charge Mechanism.
- **TCS** — Tax Collected at Source.
- **TDS** — Tax Deducted at Source.
- **WIP** — Work in Progress.
- **WO** — Work Order.

— End of User Manual —

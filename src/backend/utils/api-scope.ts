/**
 * API key scope model + URL → scope mapping.
 *
 * A scope is `{ module, category, actions[] }` with `*` wildcards. The
 * scope-checker walks the request's URL + HTTP method and asserts the
 * resolved (module, category, action) tuple is covered by at least one
 * scope on the key.
 */

export type ApiAction = "read" | "write" | "delete";

export interface ApiScope {
  module: string;          // e.g. "sales", "purchases", "*"
  category: string;        // e.g. "invoices", "bills", "*"
  actions: ApiAction[];    // any subset of read / write / delete
}

/** Map a URL path-segment → (module, category). Keys are the FIRST org-scoped
 *  segment after `/api/organizations/[orgId]/`. */
export const API_RESOURCE_MAP: Record<string, { module: string; category: string }> = {
  // Sales
  "invoices":            { module: "sales",       category: "invoices" },
  "quotations":          { module: "sales",       category: "quotations" },
  "sales-orders":        { module: "sales",       category: "orders" },
  "receipts":            { module: "sales",       category: "receipts" },
  "recurring-invoices":  { module: "sales",       category: "recurring" },

  // Purchases
  "bills":               { module: "purchases",   category: "bills" },
  "purchase-orders":     { module: "purchases",   category: "orders" },
  "payments":            { module: "purchases",   category: "payments" },

  // Inventory
  "items":               { module: "inventory",   category: "items" },
  "item-categories":     { module: "inventory",   category: "categories" },
  "warehouses":          { module: "inventory",   category: "warehouses" },
  "stock":               { module: "inventory",   category: "stock" },
  "inventory":           { module: "inventory",   category: "batches" }, // /inventory/batches
  "barcode":             { module: "inventory",   category: "barcode" },

  // Accounting / GL
  "vouchers":            { module: "accounting",  category: "vouchers" },
  "voucher-types":       { module: "accounting",  category: "voucher-types" },
  "ledgers":             { module: "accounting",  category: "ledgers" },
  "ledger-groups":       { module: "accounting",  category: "ledger-groups" },
  "cost-centers":        { module: "accounting",  category: "cost-centers" },
  "projects":            { module: "accounting",  category: "projects" },
  "budgets":             { module: "accounting",  category: "budgets" },
  "fiscal-years":        { module: "accounting",  category: "fiscal-years" },

  // Parties
  "parties":             { module: "parties",     category: "parties" },

  // Banking
  "bank-accounts":       { module: "banking",     category: "accounts" },
  "banking":             { module: "banking",     category: "import" }, // /banking/import-statement etc
  "bank-reconciliation": { module: "banking",     category: "reconciliation" },

  // Manufacturing
  "manufacturing":       { module: "manufacturing", category: "operations" }, // /manufacturing/boms, /work-orders

  // Taxation
  "gst-returns":         { module: "taxation",    category: "gst-returns" },
  "tax-config":          { module: "taxation",    category: "tax-config" },
  "tds-deductions":      { module: "taxation",    category: "tds" },
  "tcs-collections":     { module: "taxation",    category: "tcs" },

  // HR / Payroll
  "employees":           { module: "hr",          category: "employees" },
  "attendance":          { module: "hr",          category: "attendance" },
  "leaves":              { module: "hr",          category: "leaves" },
  "payroll":             { module: "hr",          category: "payroll" },
  "expense-claims":      { module: "hr",          category: "expense-claims" },

  // Reports
  "reports":             { module: "reports",     category: "reports" },
  "dashboard":           { module: "reports",     category: "dashboard" },

  // Organization administration
  "branches":            { module: "organization", category: "branches" },
  "users":               { module: "organization", category: "users" },
  "roles":               { module: "organization", category: "roles" },
  "approvals":           { module: "organization", category: "approvals" },
  "audit-logs":          { module: "organization", category: "audit-logs" },
  "notifications":       { module: "organization", category: "notifications" },
  "migration":           { module: "organization", category: "migration" },
  "api-keys":            { module: "organization", category: "api-keys" },
};

/**
 * For UI presentation: the master list of (module, category) pairs and
 * their human labels. Used by the API key creation dialog to render the
 * scope tree.
 */
export const SCOPE_TREE: { module: string; label: string; categories: { category: string; label: string }[] }[] = [
  {
    module: "sales", label: "Sales",
    categories: [
      { category: "invoices",   label: "Invoices" },
      { category: "quotations", label: "Quotations" },
      { category: "orders",     label: "Sales Orders" },
      { category: "receipts",   label: "Receipts" },
      { category: "recurring",  label: "Recurring Invoices" },
    ],
  },
  {
    module: "purchases", label: "Purchases",
    categories: [
      { category: "bills",    label: "Bills" },
      { category: "orders",   label: "Purchase Orders" },
      { category: "payments", label: "Payments" },
    ],
  },
  {
    module: "inventory", label: "Inventory",
    categories: [
      { category: "items",      label: "Items" },
      { category: "categories", label: "Categories" },
      { category: "warehouses", label: "Warehouses" },
      { category: "stock",      label: "Stock summary" },
      { category: "batches",    label: "Batches" },
      { category: "barcode",    label: "Barcode generator" },
    ],
  },
  {
    module: "accounting", label: "Accounting",
    categories: [
      { category: "vouchers",       label: "Vouchers" },
      { category: "voucher-types",  label: "Voucher types" },
      { category: "ledgers",        label: "Ledgers" },
      { category: "ledger-groups",  label: "Ledger groups" },
      { category: "cost-centers",   label: "Cost centers" },
      { category: "projects",       label: "Projects" },
      { category: "budgets",        label: "Budgets" },
      { category: "fiscal-years",   label: "Fiscal years" },
    ],
  },
  {
    module: "parties", label: "Parties",
    categories: [
      { category: "parties", label: "Customers / Vendors" },
    ],
  },
  {
    module: "banking", label: "Banking",
    categories: [
      { category: "accounts",       label: "Bank accounts" },
      { category: "import",         label: "Statement import" },
      { category: "reconciliation", label: "Reconciliation" },
    ],
  },
  {
    module: "manufacturing", label: "Manufacturing",
    categories: [
      { category: "operations", label: "BOMs + work orders" },
    ],
  },
  {
    module: "taxation", label: "Taxation",
    categories: [
      { category: "gst-returns", label: "GST returns" },
      { category: "tax-config",  label: "Tax configuration" },
      { category: "tds",         label: "TDS" },
      { category: "tcs",         label: "TCS" },
    ],
  },
  {
    module: "hr", label: "HR & Payroll",
    categories: [
      { category: "employees",      label: "Employees" },
      { category: "attendance",     label: "Attendance" },
      { category: "leaves",         label: "Leaves" },
      { category: "payroll",        label: "Payroll" },
      { category: "expense-claims", label: "Expense claims" },
    ],
  },
  {
    module: "reports", label: "Reports",
    categories: [
      { category: "reports",   label: "Statutory + custom reports" },
      { category: "dashboard", label: "Dashboard aggregator" },
    ],
  },
  {
    module: "organization", label: "Organization / Admin",
    categories: [
      { category: "branches",      label: "Branches" },
      { category: "users",         label: "Users" },
      { category: "roles",         label: "Roles" },
      { category: "approvals",     label: "Approvals" },
      { category: "audit-logs",    label: "Audit logs" },
      { category: "notifications", label: "Notifications" },
      { category: "migration",     label: "Tally migration" },
      { category: "api-keys",      label: "API keys (manage)" },
    ],
  },
];

/** HTTP method → action. */
export function methodToAction(method: string): ApiAction {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return "read";
  if (m === "DELETE") return "delete";
  return "write"; // POST / PATCH / PUT
}

/**
 * Resolve a request URL + method into a (module, category, action) tuple.
 * Returns null when the path doesn't match the org-scoped pattern (in
 * which case the caller should not allow API-key auth on it — only
 * session-based callers can hit non-org-scoped routes).
 */
export function resolveScopeTarget(
  pathname: string,
  method: string
): { module: string; category: string; action: ApiAction } | null {
  // /api/organizations/[orgId]/<segment>/...
  const m = pathname.match(/^\/api\/organizations\/[^/]+\/([^/?]+)/);
  if (!m) return null;
  const segment = m[1];
  const target = API_RESOURCE_MAP[segment];
  if (!target) return null;
  return { ...target, action: methodToAction(method) };
}

/**
 * Does the array of scopes cover (module, category, action)?
 *
 * `*` on either module or category is a wildcard.
 * `actions: ["*"]` is also a wildcard.
 */
export function scopesCover(
  scopes: ApiScope[],
  target: { module: string; category: string; action: ApiAction }
): boolean {
  for (const s of scopes) {
    const moduleOk = s.module === "*" || s.module === target.module;
    if (!moduleOk) continue;
    const categoryOk = s.category === "*" || s.category === target.category;
    if (!categoryOk) continue;
    const actionOk =
      (s.actions as string[]).includes("*") ||
      s.actions.includes(target.action);
    if (actionOk) return true;
  }
  return false;
}

/** Validate a scopes JSON value at API key creation time. */
export function isValidScopes(value: unknown): value is ApiScope[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (s) =>
      s &&
      typeof s === "object" &&
      typeof (s as ApiScope).module === "string" &&
      typeof (s as ApiScope).category === "string" &&
      Array.isArray((s as ApiScope).actions) &&
      (s as ApiScope).actions.every(
        (a) => a === "read" || a === "write" || a === "delete" || a === "*"
      )
  );
}

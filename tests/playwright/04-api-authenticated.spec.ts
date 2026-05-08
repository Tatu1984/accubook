import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@accubook.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "password123!";
const ORG_ID = process.env.DEMO_ORG_ID ?? "demo-org"; // matches the seeded id

const ENDPOINTS = [
  "dashboard",
  "ledger-groups",
  "ledgers",
  "parties",
  "invoices",
  "vouchers",
  "budgets",
  "fiscal-years",
  "branches",
  "notifications",
  "items",
  "item-categories",
  "warehouses",
  "bank-accounts",
  "payments",
  "receipts",
  "bills",
  "voucher-types",
  "tax-config",
  "approvals",
  "audit-logs",
  "tds-deductions",
  "tcs-collections",
  "employees",
  "attendance",
  "leaves",
  "expense-claims",
];

test.describe("authenticated API smoke", () => {
  let cookieHeader = "";
  let sessionOrgId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);

    const r = await ctx.request.get("/api/auth/session");
    const session = await r.json();
    sessionOrgId = session?.user?.organizationId ?? null;
    const cookies = await ctx.cookies();
    cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    await ctx.close();
  });

  test("session has organizationId", () => {
    expect(sessionOrgId).toBeTruthy();
  });

  for (const path of ENDPOINTS) {
    test(`GET /api/organizations/${ORG_ID}/${path} → 200`, async ({ playwright }) => {
      expect(cookieHeader).toBeTruthy();
      const ctx = await playwright.request.newContext({
        baseURL:
          process.env.PLAYWRIGHT_BASE_URL ?? "https://accubook.tensparrows.com",
        extraHTTPHeaders: { cookie: cookieHeader },
      });
      const r = await ctx.get(`/api/organizations/${sessionOrgId}/${path}`);
      expect(r.status()).toBe(200);
      await ctx.dispose();
    });
  }
});

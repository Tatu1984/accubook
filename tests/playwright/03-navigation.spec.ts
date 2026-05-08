import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@accubook.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "password123!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
}

test.describe("dashboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("sidebar shows the org name", async ({ page }) => {
    await expect(page.getByText(/demo corporation/i).first()).toBeVisible();
  });

  test("can navigate to Sales → Invoices (direct URL)", async ({ page }) => {
    await page.goto("/sales/invoices");
    await expect(
      page.getByRole("heading", { name: /sales invoices/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("can navigate to Reports → Trial Balance (direct URL)", async ({ page }) => {
    await page.goto("/reports/trial-balance");
    expect(page.url()).toContain("/reports/trial-balance");
  });

  test("can navigate to Approvals", async ({ page }) => {
    await page.goto("/approvals");
    expect(page.url()).toContain("/approvals");
  });

  test("can navigate to Parties", async ({ page }) => {
    await page.goto("/parties");
    expect(page.url()).toContain("/parties");
  });

  test("can navigate to Chart of Accounts", async ({ page }) => {
    await page.goto("/accounting/chart-of-accounts");
    expect(page.url()).toContain("/accounting/chart-of-accounts");
  });

  test("notification bell opens dropdown", async ({ page }) => {
    // F-A11Y-1 fixed: the Bell button now carries aria-label="Notifications"
    // (or "Notifications (N unread)" when there are unread items).
    await page.getByRole("button", { name: /^Notifications( \(\d+ unread\))?$/ }).click();
    await expect(page.getByRole("menu").getByText(/notifications/i).first()).toBeVisible();
  });

  test("user menu has Sign out", async ({ page }) => {
    // The user card is at the bottom of the sidebar; clicking it opens a
    // DropdownMenu with Profile / Notifications / Help / Sign out.
    await page.getByText(ADMIN_EMAIL).first().click();
    await expect(page.getByRole("menuitem", { name: /sign out/i })).toBeVisible();
  });
});

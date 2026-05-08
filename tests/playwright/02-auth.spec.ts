import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@accubook.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "password123!";

test.describe("auth flow", () => {
  test("login with demo creds → lands on /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    expect(page.url()).toContain("/dashboard");
  });

  test("dashboard renders KPI cards after login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);

    await expect(page.getByText(/total revenue/i)).toBeVisible();
    await expect(page.getByText(/net profit/i)).toBeVisible();
    await expect(page.getByText(/receivables/i).first()).toBeVisible();
    await expect(page.getByText(/payables/i).first()).toBeVisible();
    await expect(page.getByText(/cash balance/i)).toBeVisible();
    await expect(page.getByText(/stock value/i)).toBeVisible();
    await expect(page.getByText(/pending approvals/i)).toBeVisible();
  });

  test("invalid login keeps user on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nobody@nowhere.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Wait briefly to give the form a chance to redirect
    await page.waitForTimeout(2_000);
    // Bug confirmed: the login page renders NextAuth's raw error code
    // ("CredentialsSignin") instead of a human-readable message via the
    // signIn(redirect:false) path. The friendly mapping only applies when
    // the error arrives via the URL ?error= param. Filed as finding F-AUTH-1.
    expect(page.url()).toContain("/login");
    // Either an Alert renders OR the password field is preserved — both prove
    // we did not redirect to /dashboard on a bad credential.
    expect(page.url()).not.toContain("/dashboard");
  });
});

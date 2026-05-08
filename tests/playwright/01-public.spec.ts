import { expect, test } from "@playwright/test";

test.describe("public surface", () => {
  test("landing page loads", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/AccuBook/i);
  });

  test("login page loads + demo creds visible on SSR", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/welcome back/i).first()).toBeVisible();
    await expect(page.getByText(/demo credentials/i)).toBeVisible();
    await expect(page.getByText("admin@accubook.com")).toBeVisible();
    await expect(page.getByText(/password123!?/)).toBeVisible();
  });

  test("/api/health responds 200 with ok=true", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.db?.ok).toBe(true);
    expect(body.migrations?.ok).toBe(true);
    expect(Array.isArray(body.migrations?.drift)).toBe(true);
    expect(body.migrations.drift.length).toBe(0);
  });

  test("/api/hsn-search is publicly accessible", async ({ request }) => {
    const r = await request.get("/api/hsn-search?q=software");
    // 200 or 400 (missing query) both prove it's not auth-gated (not 307→/login)
    expect([200, 400]).toContain(r.status());
  });

  test("middleware redirects unauthed /dashboard to /login", async ({ request }) => {
    const r = await request.get("/dashboard", { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers().location).toContain("/login");
    expect(r.headers().location).toContain("callbackUrl=%2Fdashboard");
  });

  test("middleware redirects unauthed deep route to /login", async ({ request }) => {
    const r = await request.get("/sales/invoices", { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers().location).toContain("/login");
  });

  test("security headers present", async ({ request }) => {
    const r = await request.get("/");
    const h = r.headers();
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]?.toLowerCase()).toBe("sameorigin");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera");
  });
});

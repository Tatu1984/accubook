import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/backend/database/client";
import { createTestOrg, createIssuedInvoice, createItem } from "./factories";

/**
 * Scheduled jobs actually running (#6).
 *
 * The unit tests next to `cron-auth.ts` cover the token check in isolation.
 * These prove the other half: that with a valid token the handler reaches the
 * database, sweeps every active organization and returns a real summary —
 * which is the part that would silently stop working if a query or a service
 * import broke, since nobody is watching a cron at 3am.
 */

const SECRET = process.env.CRON_SECRET!;

function cronRequest(path: string, token?: string) {
  return new NextRequest(`https://example.test${path}`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("check-overdue cron", () => {
  it("rejects an unauthenticated call before touching the database", async () => {
    const { POST } = await import("@/app/api/cron/check-overdue/route");
    const response = await POST(cronRequest("/api/cron/check-overdue"));
    expect(response.status).toBe(401);
  });

  it("rejects a wrong token", async () => {
    const { POST } = await import("@/app/api/cron/check-overdue/route");
    const response = await POST(
      cronRequest("/api/cron/check-overdue", "not-the-secret-but-long-enough-x")
    );
    expect(response.status).toBe(401);
  });

  it("sweeps every active organization with a valid token", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);

    // An invoice that fell due a month ago — something for the sweep to find.
    const item = await createItem(orgA);
    const overdue = new Date(Date.now() - 60 * 86_400_000);
    await createIssuedInvoice(
      orgA,
      [{ itemId: item.id, quantity: 1, unitPrice: 1000 }],
      { date: overdue }
    );

    const { POST } = await import("@/app/api/cron/check-overdue/route");
    const response = await POST(cronRequest("/api/cron/check-overdue", SECRET));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.orgsScanned).toBeGreaterThanOrEqual(2);

    const scanned = body.summaries.map((s: { orgId: string }) => s.orgId);
    expect(scanned).toContain(orgA.orgId);
    expect(scanned).toContain(orgB.orgId);

    // A sweep that threw per-org would report an `error` key instead of counts.
    for (const summary of body.summaries) {
      expect(summary.error).toBeUndefined();
    }
  });

  it("skips inactive organizations", async () => {
    const org = await createTestOrg();
    await prisma.organization.update({
      where: { id: org.orgId },
      data: { isActive: false },
    });

    const { POST } = await import("@/app/api/cron/check-overdue/route");
    const response = await POST(cronRequest("/api/cron/check-overdue", SECRET));
    const body = await response.json();

    const scanned = body.summaries.map((s: { orgId: string }) => s.orgId);
    expect(scanned).not.toContain(org.orgId);
  });
});

describe("run-recurring cron", () => {
  it("rejects an unauthenticated call", async () => {
    const { POST } = await import("@/app/api/cron/run-recurring/route");
    const response = await POST(cronRequest("/api/cron/run-recurring"));
    expect(response.status).toBe(401);
  });

  it("runs to completion with a valid token", async () => {
    await createTestOrg();

    const { POST } = await import("@/app/api/cron/run-recurring/route");
    const response = await POST(cronRequest("/api/cron/run-recurring", SECRET));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});

describe("both crons answer GET as well as POST", () => {
  // Vercel Cron issues a GET; shipping POST alone made every scheduled
  // invocation 405 silently.
  it.each([
    "@/app/api/cron/check-overdue/route",
    "@/app/api/cron/run-recurring/route",
  ])("%s exports GET", async (modulePath) => {
    const mod = await import(modulePath);
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
  });
});

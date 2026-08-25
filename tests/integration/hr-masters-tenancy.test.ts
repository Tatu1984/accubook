import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/backend/database/client";
import { createTestOrg } from "./factories";
import { inParallel } from "./support/concurrency";

/**
 * Departments, designations and leave types belong to one organization.
 *
 * Until migration 17 these were global tables. `leave_types` was read with no
 * scoping whatsoever, so every organization saw every other organization's
 * leave catalogue. `departments` was read through a workaround — visible when
 * the department held one of your employees, OR when it held no employees at
 * all — which leaked every not-yet-staffed department across tenants and then
 * hid the evidence as soon as somebody was assigned to it.
 *
 * Neither was reachable by a unit test: both bugs live in a `where` clause, and
 * a mocked Prisma client returns whatever the test told it to.
 */

const sessionMock = vi.hoisted(() => ({
  value: null as { user: { id: string; email: string } } | null,
}));

vi.mock("@/backend/services/auth.service", () => ({
  auth: async () => sessionMock.value,
}));

beforeEach(() => {
  sessionMock.value = null;
});

/**
 * The path matters: `withOrgAuth` resolves (module, category, action) from the
 * request URL through `API_RESOURCE_MAP` and fails closed on anything it does
 * not recognise, so a placeholder path returns 403 before the handler runs.
 */
function jsonRequest(path: string, body?: unknown) {
  return new NextRequest(`https://example.test/api/organizations/x/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      host: "example.test",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("department tenancy", () => {
  it("does not show one organization's department to another", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);

    // A department with no employees — the exact shape the old
    // `{ employees: { none: {} } }` arm leaked to every tenant.
    await prisma.department.create({
      data: { organizationId: orgA.orgId, name: "A Secret Division" },
    });

    sessionMock.value = { user: { id: orgB.userId, email: "b@example.test" } };
    const { GET } = await import(
      "@/app/api/organizations/[orgId]/departments/route"
    );

    const response = await GET(jsonRequest("departments"), {
      params: Promise.resolve({ orgId: orgB.orgId }),
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("A Secret Division");
  });

  it("lets an organization see its own department", async () => {
    const org = await createTestOrg();
    await prisma.department.create({
      data: { organizationId: org.orgId, name: "Own Division" },
    });

    sessionMock.value = { user: { id: org.userId, email: "own@example.test" } };
    const { GET } = await import(
      "@/app/api/organizations/[orgId]/departments/route"
    );

    const response = await GET(jsonRequest("departments"), {
      params: Promise.resolve({ orgId: org.orgId }),
    });

    expect(await response.text()).toContain("Own Division");
  });

  it("does not report another organization's code as taken", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);
    await prisma.department.create({
      data: { organizationId: orgA.orgId, name: "A Sales", code: "SALES" },
    });

    // B asks for the same code. Previously the clash check queried
    // `where: { code }` with no organization filter, so B was refused —
    // and told about the existence of A's department in the process.
    sessionMock.value = { user: { id: orgB.userId, email: "b@example.test" } };
    const { POST } = await import(
      "@/app/api/organizations/[orgId]/departments/route"
    );

    const response = await POST(jsonRequest("departments", { name: "B Sales", code: "SALES" }), {
      params: Promise.resolve({ orgId: orgB.orgId }),
    });

    expect(response.status).toBe(201);
  });

  it("still refuses a code the same organization already used", async () => {
    const org = await createTestOrg();
    await prisma.department.create({
      data: { organizationId: org.orgId, name: "First", code: "DUP" },
    });

    sessionMock.value = { user: { id: org.userId, email: "own@example.test" } };
    const { POST } = await import(
      "@/app/api/organizations/[orgId]/departments/route"
    );

    const response = await POST(jsonRequest("departments", { name: "Second", code: "DUP" }), {
      params: Promise.resolve({ orgId: org.orgId }),
    });

    expect(response.status).toBe(400);
  });

  it("cannot hold two departments of the same name in one organization", async () => {
    const org = await createTestOrg();

    // The constraint, not the check-then-create, is what makes this safe:
    // six concurrent writers all pass their own existence check.
    const results = await inParallel(6, () =>
      prisma.department.create({
        data: { organizationId: org.orgId, name: "Contended" },
      })
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      prisma.department.count({
        where: { organizationId: org.orgId, name: "Contended" },
      })
    ).resolves.toBe(1);
  });

  it("lets two organizations each hold a department of the same name", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);

    await prisma.department.create({
      data: { organizationId: orgA.orgId, name: "Shared Name" },
    });
    await prisma.department.create({
      data: { organizationId: orgB.orgId, name: "Shared Name" },
    });

    await expect(
      prisma.department.count({ where: { name: "Shared Name" } })
    ).resolves.toBe(2);
  });
});

describe("leave type tenancy", () => {
  it("does not show one organization's leave types to another", async () => {
    const [orgA, orgB] = await Promise.all([createTestOrg(), createTestOrg()]);

    await prisma.leaveType.create({
      data: {
        organizationId: orgA.orgId,
        name: "A Sabbatical",
        code: "ASAB",
        annualQuota: 30,
      },
    });

    sessionMock.value = { user: { id: orgB.userId, email: "b@example.test" } };
    const { GET } = await import(
      "@/app/api/organizations/[orgId]/leave-types/route"
    );

    const response = await GET(jsonRequest("leave-types"), {
      params: Promise.resolve({ orgId: orgB.orgId }),
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("A Sabbatical");
    expect(body).not.toContain("ASAB");
  });

  it("cannot hold two leave types of the same code in one organization", async () => {
    const org = await createTestOrg();

    const results = await inParallel(6, () =>
      prisma.leaveType.create({
        data: {
          organizationId: org.orgId,
          name: `Contended ${Math.random()}`,
          code: "CONT",
          annualQuota: 5,
        },
      })
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("provisioning", () => {
  /**
   * `createTestOrg` builds its own minimal skeleton rather than going through
   * provisioning, so these call it directly — which is also the path that
   * matters: seed, self-serve register and `POST /api/organizations` all
   * bottom out here.
   */
  async function provisionedOrg() {
    const { provisionOrganization } = await import(
      "@/backend/services/organization/provision"
    );
    const org = await prisma.organization.create({
      data: { name: `Provisioned ${Math.random()}`, country: "IN", state: "Maharashtra" },
    });
    await provisionOrganization(prisma, { organizationId: org.id });
    return org;
  }

  it("gives a new organization its own HR masters", async () => {
    // Before migration 17 a new org inherited the globals. Now it must be
    // given a set, or every HR dropdown is empty and no employee or leave can
    // be recorded at all.
    const org = await provisionedOrg();

    const [departments, designations, leaveTypes] = await Promise.all([
      prisma.department.count({ where: { organizationId: org.id } }),
      prisma.designation.count({ where: { organizationId: org.id } }),
      prisma.leaveType.count({ where: { organizationId: org.id } }),
    ]);

    expect(departments).toBeGreaterThan(0);
    expect(designations).toBeGreaterThan(0);
    expect(leaveTypes).toBeGreaterThan(0);
  });

  it("provisions a Loss of Pay type, which payroll resolves by code", async () => {
    const org = await provisionedOrg();
    await expect(
      prisma.leaveType.findFirst({
        where: { organizationId: org.id, code: "LOP" },
        select: { id: true },
      })
    ).resolves.not.toBeNull();
  });

  it("is idempotent — provisioning twice does not duplicate the masters", async () => {
    const { provisionOrganization } = await import(
      "@/backend/services/organization/provision"
    );
    const org = await provisionedOrg();
    const before = await prisma.department.count({ where: { organizationId: org.id } });

    await provisionOrganization(prisma, { organizationId: org.id });

    await expect(
      prisma.department.count({ where: { organizationId: org.id } })
    ).resolves.toBe(before);
  });
});

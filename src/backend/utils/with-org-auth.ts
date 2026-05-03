import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/backend/services/auth.service";
import { prisma } from "@/backend/database/client";
import type { Prisma } from "@/generated/prisma";

export type OrgUser = Prisma.OrganizationUserGetPayload<{
  include: { role: true };
}>;

export type { Session };

export type OrgAuthContext<P extends Record<string, string> = Record<string, string>> = {
  session: Session;
  userId: string;
  orgId: string;
  orgUser: OrgUser;
  params: P & { orgId: string };
};

type RouteContext<P extends Record<string, string>> = {
  params: Promise<P & { orgId: string }>;
};

type Handler<P extends Record<string, string>> = (
  request: NextRequest,
  context: OrgAuthContext<P>
) => Promise<Response> | Response;

/**
 * Wraps a Next.js route handler under `/api/organizations/[orgId]/...` with:
 *   - session authentication (401 on missing/invalid)
 *   - organizationUser membership check (403 if not a member of the URL's orgId)
 *   - orgUser.isActive check (403 if deactivated)
 *
 * Closes the cross-tenant data leak: the handler can trust `ctx.orgId` is
 * a real org the caller belongs to. Use `ctx.orgUser.role.permissions`
 * for fine-grained permission checks inside the handler.
 */
export function withOrgAuth<P extends Record<string, string> = Record<string, string>>(
  handler: Handler<P>
) {
  return async (request: NextRequest, ctx: RouteContext<P>) => {
    const params = await ctx.params;
    const { orgId } = params;

    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
      include: { role: true },
    });

    if (!orgUser || !orgUser.isActive) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return handler(request, {
      session,
      userId: session.user.id,
      orgId,
      orgUser,
      params,
    });
  };
}

type Permission = {
  module: string;
  actions: string[];
};

/**
 * Checks whether an OrgUser has a given permission via their role's
 * `permissions` JSON. Wildcard `module: "*"` grants all modules; wildcard
 * `actions: ["*"]` (not currently used) would grant all actions.
 *
 * Use inside a withOrgAuth handler:
 *   if (!hasPermission(orgUser, "items", "delete")) {
 *     return forbidden("Cannot delete items");
 *   }
 */
export function hasPermission(
  orgUser: OrgUser,
  module: string,
  action: string
): boolean {
  const perms = orgUser.role?.permissions;
  if (!Array.isArray(perms)) return false;

  for (const raw of perms as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Partial<Permission>;
    const moduleMatch = p.module === module || p.module === "*";
    if (!moduleMatch) continue;
    if (!Array.isArray(p.actions)) continue;
    if (p.actions.includes(action) || p.actions.includes("*")) return true;
  }
  return false;
}

/** Convenience helpers for common JSON responses. */
export const unauthorized = (message = "Unauthorized") =>
  NextResponse.json({ error: message }, { status: 401 });

export const forbidden = (message = "Forbidden") =>
  NextResponse.json({ error: message }, { status: 403 });

export const notFound = (message = "Not found") =>
  NextResponse.json({ error: message }, { status: 404 });

export const badRequest = (message = "Bad request", details?: unknown) =>
  NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status: 400 });

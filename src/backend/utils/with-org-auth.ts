import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/backend/services/auth.service";
import { prisma } from "@/backend/database/client";
import type { Prisma } from "@/generated/prisma";
import { hasPermission as hasPermissionLeaf } from "@/backend/utils/permissions";
import {
  extractBearerToken,
  verifyApiKey,
  type VerifiedApiKey,
} from "@/backend/utils/verify-api-key";
import { resolveScopeTarget, scopesCover } from "@/backend/utils/api-scope";

export type OrgUser = Prisma.OrganizationUserGetPayload<{
  include: { role: true };
}>;

export type { Session };

// Re-export the leaf-module helper so existing call sites
// (`import { hasPermission } from "@/backend/utils/with-org-auth"`) still work.
export const hasPermission: (orgUser: OrgUser, module: string, action: string) => boolean =
  hasPermissionLeaf;

export type OrgAuthContext<P extends Record<string, string> = Record<string, string>> = {
  session: Session | null;             // null when authenticated via API key
  userId: string;
  orgId: string;
  orgUser: OrgUser;
  params: P & { orgId: string };
  /** Set when the caller authenticated via Authorization: Bearer acb_live_…  */
  apiKey?: VerifiedApiKey;
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
 *   - session authentication (cookie) OR API-key authentication
 *     (Authorization: Bearer acb_live_…)
 *   - organizationUser membership check (403 if not a member of the URL's orgId)
 *   - orgUser.isActive check (403 if deactivated)
 *   - For API-key requests: scope check against the resolved
 *     (module, category, action) tuple. 403 with `error: "scope_denied"`
 *     if the key isn't authorized for the requested resource.
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

    // 1. Try API-key auth first if a Bearer token is present.
    const bearer = extractBearerToken(request);
    if (bearer) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || request.headers.get("x-real-ip")
        || undefined;
      const verified = await verifyApiKey(bearer, ip);
      if (!verified) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
      }
      if (verified.organizationId !== orgId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      // Scope check based on URL + HTTP method.
      const target = resolveScopeTarget(new URL(request.url).pathname, request.method);
      if (!target) {
        // Path doesn't map to a known org-scoped resource — refuse rather
        // than silently allow.
        return NextResponse.json(
          { error: "scope_denied", reason: "unmapped_path" },
          { status: 403 }
        );
      }
      if (!scopesCover(verified.scopes, target)) {
        return NextResponse.json(
          {
            error: "scope_denied",
            required: target,
            granted: verified.scopes,
          },
          { status: 403 }
        );
      }

      // Resolve the API key's owner orgUser (so the handler sees a
      // permissions object and audit trail attribution).
      const orgUser = await prisma.organizationUser.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: verified.createdById,
          },
        },
        include: { role: true },
      });
      if (!orgUser || !orgUser.isActive) {
        return NextResponse.json(
          { error: "Access denied (key creator no longer active)" },
          { status: 403 }
        );
      }

      return handler(request, {
        session: null,
        userId: verified.createdById,
        orgId,
        orgUser,
        params,
        apiKey: verified,
      });
    }

    // 2. Fall back to session-cookie auth.
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

/** Convenience helpers for common JSON responses. */
export const unauthorized = (message = "Unauthorized") =>
  NextResponse.json({ error: message }, { status: 401 });

export const forbidden = (message = "Forbidden") =>
  NextResponse.json({ error: message }, { status: 403 });

export const notFound = (message = "Not found") =>
  NextResponse.json({ error: message }, { status: 404 });

export const badRequest = (message = "Bad request", details?: unknown) =>
  NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status: 400 });

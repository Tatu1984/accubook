import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/backend/services/auth.service";
import { prisma, withDbRetry } from "@/backend/database/client";
import type { Prisma } from "@/generated/prisma";
import { env } from "@/config/env";
import { hasPermission as hasPermissionLeaf } from "@/backend/utils/permissions";
import {
  extractBearerToken,
  verifyApiKey,
  type VerifiedApiKey,
} from "@/backend/utils/verify-api-key";
import { resolveScopeTarget, scopesCover } from "@/backend/utils/api-scope";

/**
 * Anti-CSRF check for session-authenticated, mutating requests.
 *
 * Browsers auto-attach cookies but enforce the Same-Origin Policy on
 * cross-origin Origin headers. By rejecting any mutating request whose
 * Origin doesn't match the Host (or a known allowlisted app URL), we
 * close the classic "malicious page POSTs to our cookie-authed endpoint"
 * vector even when SameSite=Lax cookies aren't enough (e.g. top-level
 * navigations).
 *
 * Skipped for:
 *  - GET / HEAD / OPTIONS — RFC-safe methods (browsers don't pre-flight
 *    these so CSRF isn't applicable; reads are allowed).
 *  - API-key requests — bearer tokens aren't auto-attached by the
 *    browser, so there's no cross-origin ride.
 *
 * Returns null on success, a 403 NextResponse on failure.
 */
function checkSameOrigin(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  // No Origin on a mutating request → either an older/odd client, or a
  // crafted request that stripped the header. Reject conservatively.
  if (!origin || !host) {
    return NextResponse.json(
      { error: "Missing Origin header" },
      { status: 403 }
    );
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "Invalid Origin header" }, { status: 403 });
  }

  if (originHost === host) return null;

  // Allow an explicit APP_URL (canonical public URL, may differ from the
  // internal Host behind a proxy or load balancer).
  const appUrl = env.APP_URL || env.NEXTAUTH_URL;
  if (appUrl) {
    try {
      const allowedHost = new URL(appUrl).host;
      if (originHost === allowedHost) return null;
    } catch {
      // Malformed APP_URL — fall through to deny.
    }
  }

  return NextResponse.json(
    { error: "Cross-origin request denied" },
    { status: 403 }
  );
}

export type OrgUser = Prisma.OrganizationUserGetPayload<{
  include: { role: true };
}>;

export type { Session };

// Re-export the leaf-module helper so existing call sites
// (`import { hasPermission } from "@/backend/utils/with-org-auth"`) still work.
export const hasPermission: (
  orgUser: OrgUser,
  module: string,
  category: string,
  action: string
) => boolean = hasPermissionLeaf;

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

export type WithOrgAuthOptions = {
  /**
   * Skip the automatic role check for this route.
   *
   * Only for routes whose URL genuinely does not describe the permission
   * being exercised. Every use needs a comment saying why, because the
   * default — deny unless the role grants it — is what makes the role
   * model mean anything.
   */
  skipRoleCheck?: true;
};

/**
 * Enforce the caller's role against the resource their URL and method
 * describe.
 *
 * This is the whole role model. Previously each route was expected to call
 * `hasPermission` itself, and 55 of the 71 mutating route files did not —
 * so a VIEWER whose role literally granted `actions: ["read"]` could post
 * journal vouchers, delete ledgers and run payroll. Enforcing centrally
 * means a new route is protected the moment it exists, and forgetting is
 * no longer possible.
 *
 * The (module, category, action) tuple comes from `resolveScopeTarget`,
 * the same resolver used for API-key scopes, so a role grant and an API
 * key grant describe resources identically.
 *
 * Fails closed: a path that resolves to nothing is refused rather than
 * waved through, which means adding a route under a new URL segment
 * without registering it in `API_RESOURCE_MAP` produces a loud 403 in
 * development instead of a silent hole in production.
 */
function checkRolePermission(
  request: NextRequest,
  orgUser: OrgUser
): NextResponse | null {
  const target = resolveScopeTarget(new URL(request.url).pathname, request.method);
  if (!target) {
    return NextResponse.json(
      {
        error: "forbidden",
        reason: "unmapped_path",
        detail:
          "This route is not registered in API_RESOURCE_MAP, so no permission can be resolved for it.",
      },
      { status: 403 }
    );
  }
  if (!hasPermissionLeaf(orgUser, target.module, target.category, target.action)) {
    return NextResponse.json(
      {
        error: "forbidden",
        reason: "insufficient_permissions",
        required: target,
        role: orgUser.role?.name ?? null,
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Wraps a Next.js route handler under `/api/organizations/[orgId]/...` with:
 *   - session authentication (cookie) OR API-key authentication
 *     (Authorization: Bearer acb_live_…)
 *   - organizationUser membership check (403 if not a member of the URL's orgId)
 *   - orgUser.isActive check (403 if deactivated)
 *   - a role check on the resolved (module, category, action) tuple, for
 *     every caller. Handlers may still call `hasPermission` for business
 *     actions the URL cannot express — `approve` is the main one, since
 *     no HTTP method implies it.
 *   - For API-key requests: an additional scope check, so a key is limited
 *     to the intersection of its own scopes and its creator's role.
 *
 * Closes the cross-tenant data leak: the handler can trust `ctx.orgId` is
 * a real org the caller belongs to.
 */
export function withOrgAuth<P extends Record<string, string> = Record<string, string>>(
  handler: Handler<P>,
  options: WithOrgAuthOptions = {}
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
      const orgUser = await withDbRetry(() =>
        prisma.organizationUser.findUnique({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: verified.createdById,
            },
          },
          include: { role: true },
        })
      );
      if (!orgUser || !orgUser.isActive) {
        return NextResponse.json(
          { error: "Access denied (key creator no longer active)" },
          { status: 403 }
        );
      }

      // A key can never exceed the role of the person who issued it. Without
      // this, a VIEWER could mint a full-scope key and use it to write.
      if (!options.skipRoleCheck) {
        const roleDenied = checkRolePermission(request, orgUser);
        if (roleDenied) return roleDenied;
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

    // 2a. CSRF: session-authed mutations must come from a same-origin
    // request. Belt-and-braces alongside the auth cookie's SameSite=Lax.
    const csrfDenied = checkSameOrigin(request);
    if (csrfDenied) return csrfDenied;

    // Membership check runs on EVERY org-scoped request. Retry transient
    // Neon connection errors (cold-start ETIMEDOUT) so a sleeping DB doesn't
    // 500 an otherwise-valid request.
    const orgUser = await withDbRetry(() =>
      prisma.organizationUser.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: session.user.id,
          },
        },
        include: { role: true },
      })
    );

    if (!orgUser || !orgUser.isActive) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 2b. Role check. Membership gets you into the organization; the role
    // decides what you may do once inside.
    if (!options.skipRoleCheck) {
      const roleDenied = checkRolePermission(request, orgUser);
      if (roleDenied) return roleDenied;
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

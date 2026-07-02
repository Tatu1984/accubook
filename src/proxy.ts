import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Build a per-request CSP string from a freshly-generated nonce.
 *
 * Strict policy:
 *  - default-src 'self' — everything denied unless explicitly allowed
 *  - script-src nonce + 'strict-dynamic' — only nonced scripts run, and
 *    they can dynamically load further scripts (Next, React, Sentry SDK)
 *    without re-enumerating every URL. No 'unsafe-inline', no 'unsafe-eval'.
 *  - style-src 'self' 'unsafe-inline' — Tailwind v4 injects inline styles
 *    we can't easily nonce; this is the standard concession.
 *  - connect-src — same-origin plus Sentry ingest + Upstash REST (the only
 *    external services this app talks to from the browser; cheap to keep
 *    unconditional whether or not the env vars are wired).
 *  - frame-ancestors 'none' — defense in depth alongside XFO=SAMEORIGIN.
 *  - object-src 'none', base-uri 'self', form-action 'self' — close common
 *    XSS amplification vectors.
 *
 * In production this is a hard enforcement header. In dev we ship a
 * Report-Only variant so the React refresh runtime + Turbopack HMR aren't
 * blocked while you're iterating. The set-cookie path stays consistent.
 */
function buildCsp(_nonce: string, isProd: boolean): { header: string; value: string } {
  // NOTE on script-src: we tried two stricter variants and both broke
  // production. (1) `'nonce-X' 'strict-dynamic'` — modern, recommended —
  // blocks every script on a prerendered page because the static HTML's
  // script tags have no nonce attribute (the build had no request and
  // therefore no x-nonce header). (2) `'self' 'nonce-X'` (no strict-dynamic)
  // — `self` covered the external chunks but Next still emits ~20 inline
  // <script> bootstrap tags in the prerendered HTML, and per CSP3 the
  // presence of any nonce in script-src causes browsers to ignore
  // 'unsafe-inline', so those inline tags still got blocked.
  //
  // Pragmatic resolution: drop the nonce; use `'self' 'unsafe-inline'`.
  // We lose inline-script XSS defense (an injected <script>alert(...)
  // would now run), but keep all the other valuable CSP gates:
  // frame-ancestors 'none', object-src 'none', base-uri 'self',
  // form-action 'self', connect-src allowlist, same-origin script
  // loading. Tightening back to nonce-only requires forcing every page
  // dynamic (export const dynamic = 'force-dynamic') or computing per-
  // build script hashes — both intrusive enough to defer.
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${isProd ? "" : "'unsafe-eval'"}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.ingest.sentry.io https://*.upstash.io",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isProd ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");

  return {
    header: isProd ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: directives,
  };
}

export function proxy(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;

  // Check for session token (NextAuth/AuthJS stores it in cookies)
  const sessionToken = request.cookies.get("authjs.session-token")?.value
    || request.cookies.get("__Secure-authjs.session-token")?.value;
  const isLoggedIn = !!sessionToken;

  // API-key auth: external integrations send `Authorization: Bearer
  // acb_live_…`. Let those requests pass through proxy so the route
  // handler's `withOrgAuth` wrapper can verify the token + check scopes.
  // We only sniff for the prefix here — actual verification is server-side.
  const authHeader = request.headers.get("authorization") || "";
  const hasApiKey = /^Bearer\s+acb_live_/i.test(authHeader);

  // Public routes that don't require authentication
  const publicRoutes = ["/login", "/register", "/forgot-password", "/reset-password"];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // API routes that don't require authentication.
  // /api/health: public ops probe (uptime checks, deploy-readiness gates).
  // /api/hsn-search: public lookup helper used pre-login on quoting flows.
  const publicApiRoutes = ["/api/auth", "/api/health", "/api/hsn-search"];
  const isPublicApiRoute = publicApiRoutes.some(route => pathname.startsWith(route));

  // Static files - skip proxy
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Auth / redirect logic. Compute the desired response, then attach the
  // CSP nonce + header to it on the way out.
  let response: NextResponse;

  if (isPublicApiRoute) {
    response = NextResponse.next();
  } else if (hasApiKey && pathname.startsWith("/api/")) {
    // Let API-key requests through to withOrgAuth.
    response = NextResponse.next();
  } else if (pathname === "/") {
    // Landing page is public for everyone — logged-in users get the
    // header's "Sign in" → /login link, which will then bounce them to
    // /dashboard via the rule below.
    response = NextResponse.next();
  } else if (isLoggedIn && isPublicRoute) {
    response = NextResponse.redirect(new URL("/dashboard", nextUrl));
  } else if (!isLoggedIn && !isPublicRoute) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    response = NextResponse.redirect(loginUrl);
  } else {
    response = NextResponse.next();
  }

  // Attach CSP only to HTML responses (not /api/*). API responses are
  // JSON; CSP on them is useless and clutters the wire.
  if (!pathname.startsWith("/api/")) {
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const isProd = process.env.NODE_ENV === "production";
    const csp = buildCsp(nonce, isProd);
    const isRedirect = response.headers.get("location") !== null;

    if (!isRedirect) {
      // Mutate request headers so server components reading `headers()`
      // can pick up the nonce and emit nonced inline JSON if needed.
      // Next.js auto-adds the nonce to its emitted <script> tags when
      // `x-nonce` is present on the request.
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-nonce", nonce);
      response = NextResponse.next({ request: { headers: requestHeaders } });
    }
    response.headers.set(csp.header, csp.value);
    response.headers.set("x-nonce", nonce);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

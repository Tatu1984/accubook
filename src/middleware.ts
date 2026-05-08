import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;

  // Check for session token (NextAuth/AuthJS stores it in cookies)
  const sessionToken = request.cookies.get("authjs.session-token")?.value
    || request.cookies.get("__Secure-authjs.session-token")?.value;
  const isLoggedIn = !!sessionToken;

  // API-key auth: external integrations send `Authorization: Bearer
  // acb_live_…`. Let those requests pass through middleware so the route
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

  // Static files - skip middleware
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Allow public API routes
  if (isPublicApiRoute) {
    return NextResponse.next();
  }

  // Allow API-key requests under /api/* through to the route handler so
  // `withOrgAuth` can verify the bearer token. The handler returns 401
  // on bad keys and 403 on scope_denied — middleware doesn't second-guess.
  if (hasApiKey && pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Home page is the public marketing landing. Logged-in users hitting "/"
  // land directly in the dashboard so they don't see the marketing page
  // every time they type the bare domain.
  if (pathname === "/") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }
    return NextResponse.next();
  }

  // Redirect logged-in users away from auth pages
  if (isLoggedIn && isPublicRoute) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // Redirect non-logged-in users to login page
  if (!isLoggedIn && !isPublicRoute) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

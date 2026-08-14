"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Alert, AlertDescription } from "@/frontend/components/ui/alert";
import { Loader2, Building2, AlertCircle } from "lucide-react";

// Same-origin pathname guard. Refuses absolute URLs, protocol-relative
// URLs, javascript: schemes, and anything that would let an attacker
// hand off the post-login redirect to a third-party host.
function safeCallbackUrl(raw: string | null): string {
  const fallback = "/dashboard";
  if (!raw) return fallback;
  // Must start with a single forward slash (relative path) and must not
  // start with "//" (protocol-relative) or "/\\" (Windows path quirks).
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // Reject any control char or scheme inside the value.
  if (/[\u0000-\u001F\u007F]/.test(raw)) return fallback;
  return raw;
}

// NextAuth v5 returns short error codes from signIn(redirect:false).
// Map the ones we recognise to user-friendly strings; fall back to a
// generic message for anything else (and never echo the raw code).
function friendlySignInError(code: string | undefined | null): string {
  switch (code) {
    case "CredentialsSignin":
      return "Invalid email or password";
    case "AccessDenied":
      return "This account is not allowed to sign in";
    case "Verification":
      return "The sign-in link has expired or is invalid";
    case "Configuration":
      return "Authentication is misconfigured. Please contact your administrator.";
    default:
      return "Sign in failed. Please try again.";
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const error = searchParams.get("error");

  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    error ? friendlySignInError(error) : null
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setFormError(friendlySignInError(result.error));
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setFormError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary rounded-lg">
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">AccuBooks</span>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              {formError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="email"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 mt-6">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="text-primary hover:underline">
                  Sign up
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>

        <DemoCredentialsCard />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Enterprise Accounting Platform
        </p>
      </div>
    </div>
  );
}

/*
  Demo credentials card.

  Shown by default, because this deployment is a demo whose whole point is
  that an evaluator can sign in without being handed credentials out of
  band.

  The defaults below are the seeded super admin from `prisma/seed.ts`,
  which is committed in this (public) repository — so printing them here
  discloses nothing that `prisma/seed.ts:140` does not already disclose.
  That is a statement about this deployment, not a general endorsement:
  BEFORE this instance holds real client books, either

    - set `NEXT_PUBLIC_DEMO=false` to remove the card entirely, or
    - point `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` at a
      restricted demo account in a throwaway organization,

  and rotate the seeded password, which anyone can read on GitHub.

  All three are `NEXT_PUBLIC_*` and therefore inlined at build time, so
  changing them requires a redeploy, not just an env edit.

  Rendered in BOTH the live form and the Suspense fallback because
  `useSearchParams()` in LoginForm forces dynamic rendering, so the
  fallback is what gets streamed before hydration.
*/
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL || "admin@accubook.com";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "password123!";

function DemoCredentialsCard() {
  const enabled = process.env.NEXT_PUBLIC_DEMO !== "false";
  const email = DEMO_EMAIL;
  const password = DEMO_PASSWORD;

  if (!enabled || !email || !password) return null;

  return (
    <Card className="mt-4 bg-slate-50 dark:bg-slate-900 border-dashed">
      <CardContent className="pt-4 pb-4">
        <p className="text-sm font-semibold text-center mb-2">Demo Credentials</p>
        <div className="text-sm space-y-1">
          <p>
            <span className="font-medium">Email:</span>{" "}
            <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">
              {email}
            </code>
          </p>
          <p>
            <span className="font-medium">Password:</span>{" "}
            <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">
              {password}
            </code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoginFormFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary rounded-lg">
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">AccuBooks</span>
          </div>
        </div>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
            <CardDescription className="text-center">
              Loading…
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>

        <DemoCredentialsCard />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Enterprise Accounting Platform
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  );
}

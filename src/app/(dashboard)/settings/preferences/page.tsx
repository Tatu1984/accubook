"use client";

import Link from "next/link";
import { Construction, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";

/**
 * Placeholder. The previous implementation was a fake-save form (no
 * API calls, just a setTimeout that toasted "saved successfully" while
 * persisting nothing). Removed so customers don't see a misleading
 * confirmation. The real per-org settings live on /settings/india-tax;
 * date-format / language / fiscal-year-start are read from the
 * organization row directly today and don't have a UI yet.
 */
export default function PreferencesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Preferences</h1>
        <p className="text-muted-foreground">
          General organization preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Construction className="h-5 w-5 text-amber-600" />
            <div>
              <CardTitle className="text-base">Coming soon</CardTitle>
              <CardDescription>
                Date format, default currency, fiscal-year start and language
                preferences are read from the organization record today and
                don&apos;t yet have a UI here. The settings that DO have a
                working UI are linked below.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href="/settings/india-tax">
            <Button variant="outline" className="w-full justify-between">
              India Tax — GSTIN, state, composition scheme
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/settings/users">
            <Button variant="outline" className="w-full justify-between">
              Users &amp; Roles
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/settings/branches">
            <Button variant="outline" className="w-full justify-between">
              Branches
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/settings/taxes">
            <Button variant="outline" className="w-full justify-between">
              Tax Configuration
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

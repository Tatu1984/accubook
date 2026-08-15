"use client";

import * as React from "react";
import {
  
  Loader2,
  Save,
  Camera,
  Mail,
  Phone,
  Shield,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import { useOrganization } from "@/frontend/hooks/use-organization";

/**
 * The signed-in user's profile.
 *
 * This page used to display a hardcoded "User / user@example.com"
 * regardless of who was signed in, and its Save button waited 500ms,
 * wrote to localStorage and reported "Profile updated successfully" —
 * so a user could change their name, be told it saved, and find it
 * reverted on any other device.
 *
 * The identity now comes from the session. There is no endpoint for a
 * user to edit their own profile — `PATCH /users` only sets another
 * member's role and active flag — so the fields are presented read-only
 * rather than pretending to accept changes.
 */
export default function ProfilePage() {
  const { organizationId, isLoading: orgLoading, role, organizationName, session } = useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);

  const profile = {
    name: session?.user?.name ?? "",
    email: session?.user?.email ?? "",
  };

  React.useEffect(() => {
    if (organizationId || session) setIsLoading(false);
  }, [organizationId, session]);

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground">
            Manage your account settings
          </p>
        </div>
        <Button disabled title="Editing your own profile is not supported yet">
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Your signed-in account. Editing these is not available yet — ask an
              administrator to change them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={session?.user?.image ?? undefined} />
                <AvatarFallback className="text-2xl">
                  {profile.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <Button variant="outline" size="sm" disabled title="Photo upload is not available yet">
                  <Camera className="mr-2 h-4 w-4" />
                  Change Photo
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Signed in as {profile.email || "—"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={profile.name} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" className="pl-10" value={profile.email} readOnly />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="org">Organization</Label>
                <Input id="org" value={organizationName ?? ""} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground opacity-0" />
                  <Input id="role" value={role ?? ""} readOnly />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">
                  Last changed 30 days ago
                </p>
              </div>
              <Button variant="outline">Change Password</Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security
                </p>
              </div>
              <Button variant="outline">Enable 2FA</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

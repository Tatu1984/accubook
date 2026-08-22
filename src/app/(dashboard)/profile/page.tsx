"use client";

import * as React from "react";
import {
  Loader2,
  Save,
  Camera,
  Mail,
  Phone,
  Shield,
  LogOut,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import { useOrganization } from "@/frontend/hooks/use-organization";
import { toast } from "sonner";

/**
 * The signed-in user's profile.
 *
 * This page used to display a hardcoded "User / user@example.com" regardless
 * of who was signed in, and its Save button waited 500ms, wrote to
 * localStorage and reported success — so a user could change their name, be
 * told it saved, and find it reverted on any other device. It was then made
 * entirely read-only because no self-service endpoint existed.
 *
 * `/api/profile` and `/api/profile/password` now provide those, so the name,
 * phone and avatar are editable and the password can be changed here.
 *
 * Email stays read-only: it is the login identifier and the key invitations
 * are keyed on, so changing it needs an admin flow with re-verification.
 */
export default function ProfilePage() {
  const { organizationId, isLoading: orgLoading, role, organizationName, session } =
    useOrganization();
  const [isLoading, setIsLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [profile, setProfile] = React.useState({
    name: "",
    email: "",
    phone: "",
    avatar: "" as string | null,
  });
  const [loadedProfile, setLoadedProfile] = React.useState(profile);

  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [passwordForm, setPasswordForm] = React.useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/profile");
        if (r.ok) {
          const body = await r.json();
          const next = {
            name: body.data?.name ?? "",
            email: body.data?.email ?? "",
            phone: body.data?.phone ?? "",
            avatar: body.data?.avatar ?? null,
          };
          setProfile(next);
          setLoadedProfile(next);
        }
      } catch {
        // Falls back to the session values below.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const isDirty =
    profile.name !== loadedProfile.name ||
    profile.phone !== loadedProfile.phone ||
    profile.avatar !== loadedProfile.avatar;

  const handleSave = async () => {
    if (!profile.name.trim()) {
      toast.error("Your name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name.trim(),
          phone: profile.phone || null,
          avatar: profile.avatar,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to save profile");
      setLoadedProfile(profile);
      toast.success("Profile updated");
    } catch (e) {
      toast.error((e as Error).message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChosen = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > 250 * 1024) {
      toast.error("Image must be under 250 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfile((prev) => ({ ...prev, avatar: String(reader.result) }));
      toast.message("Photo staged — press Save Changes to keep it");
    };
    reader.onerror = () => toast.error("Could not read that image");
    reader.readAsDataURL(file);
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("The new passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      const r = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to change password");
      toast.success(
        "Password changed. Other devices will be signed out shortly."
      );
      setPasswordOpen(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (e) {
      toast.error((e as Error).message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOutEverywhere = async () => {
    setSigningOut(true);
    try {
      const r = await fetch("/api/auth/revoke-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Failed to revoke sessions");
      toast.success(
        "Every session has been revoked — you will be signed out here too."
      );
    } catch (e) {
      toast.error((e as Error).message || "Failed to revoke sessions");
    } finally {
      setSigningOut(false);
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const displayName = profile.name || session?.user?.name || "";
  const displayEmail = profile.email || session?.user?.email || "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground">Manage your account settings</p>
        </div>
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Your signed-in account. Your email address is managed by an
              administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profile.avatar ?? session?.user?.image ?? undefined} />
                <AvatarFallback className="text-2xl">
                  {displayName.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarChosen(file);
                    e.target.value = "";
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Change Photo
                  </Button>
                  {profile.avatar && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setProfile((prev) => ({ ...prev, avatar: null }))
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Signed in as {displayEmail || "—"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    className="pl-10"
                    value={displayEmail}
                    readOnly
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    className="pl-10"
                    placeholder="Optional"
                    value={profile.phone}
                    onChange={(e) =>
                      setProfile({ ...profile, phone: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org">Organization</Label>
                <Input id="org" value={organizationName ?? ""} readOnly />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input id="role" value={role ?? ""} readOnly />
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
                  Changing it signs out your other devices
                </p>
              </div>
              <Button variant="outline" onClick={() => setPasswordOpen(true)}>
                Change Password
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Active sessions</p>
                <p className="text-sm text-muted-foreground">
                  Revoke every signed-in session, including this one
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleSignOutEverywhere}
                disabled={signingOut}
              >
                {signingOut ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                Sign out everywhere
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password, then a new one of at least 12
              characters.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    currentPassword: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    confirmPassword: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPasswordOpen(false)}
              disabled={changingPassword}
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={
                changingPassword ||
                !passwordForm.currentPassword ||
                !passwordForm.newPassword
              }
            >
              {changingPassword && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!organizationId && (
        <p className="text-sm text-muted-foreground">
          You are not currently attached to an organization.
        </p>
      )}
    </div>
  );
}
